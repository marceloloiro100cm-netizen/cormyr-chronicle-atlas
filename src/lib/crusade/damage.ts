/** CRZ-1.0 · matemática inteira, manual 03 §7, 02 T-PIL-01..09/T-WOTR-01.
 * Apenas resolução isolada. Não é redutor de turnos nem paridade integral com PTE.
 */
import type {CrzRuleset} from './ruleset';
import {crzApplyDamage,crzClamp,crzSafe,type CrzStack,
 type CrzDamageReceipt} from './stack';
import {crzPcg32,type CrzRngState} from './rng';

export type CrzMitigation='normal'|'resist'|'vulnerable'|'immune';
export type CrzDamagePart=Readonly<{
 type:string;dice:Readonly<{count:number;sides:number}>;mod:number;
 mitigation:CrzMitigation;
}>;
export type CrzAttackEntry=Readonly<{
 id:string;count:number;toHit:number;parts:readonly CrzDamagePart[];
}>;
export type CrzExpectedBreakdown=Readonly<{
 entryId:string;hitBP:number;perAttackX100:number;
 expectedHitsX100:number;totalX100:number;
}>;
export type CrzExpectedResult=Readonly<{
 mode:'expected';rawDamage:number;expectedHitsX100:number;capHP:number;
 receipt:CrzDamageReceipt;breakdown:readonly CrzExpectedBreakdown[];
}>;
export const CRZ_BP=10000;
export function crzHitFactorBP(rule:CrzRuleset,attack:number,defense:number):number{
 crzSafe(attack,'attack');crzSafe(defense,'defense');
 if(rule.hit.model==='pte-linear')
  return crzClamp(crzSafe(10000+400*(attack-defense),'pte factor'),
   rule.hit.pMinBP,rule.hit.pMaxBP??14000);
 const raw=crzSafe(500*(21+attack-defense),'hit factor');
 if(rule.hit.model==='wotr-linear')return Math.max(500,raw);
 return crzClamp(raw,rule.hit.pMinBP,rule.hit.pMaxBP??9500);
}
function partAverageX100(part:CrzDamagePart):{full:number;dice:number}{
 const {count,sides}=part.dice;
 for(const n of [count,sides,part.mod]){
  if(!Number.isSafeInteger(n))throw new Error('E_OVERFLOW: dados inválidos.');
 }
 if(count<0||count>100||sides<1||sides>1000||!part.type)
  throw new Error('Ataque inválido.');
 const dice=crzSafe(count*(sides+1)*50,'dice mean');
 const full=crzSafe(dice+part.mod*100,'damage mean');
 return {full:Math.max(0,full),dice};
}
function mitigate(value:number,mitigation:CrzMitigation):number{
 crzSafe(value,'part damage');
 switch(mitigation){
  case 'immune':return 0;
  case 'resist':return Math.floor(value/2);
  case 'vulnerable':return crzSafe(value*2,'vulnerability');
  case 'normal':return value;
  default:throw new Error('Modificador de dano desconhecido.');
 }
}
function validEntry(e:CrzAttackEntry):void{
 if(!e.id||!Number.isSafeInteger(e.count)||e.count<1||e.count>10||
  !Number.isSafeInteger(e.toHit)||!e.parts.length||e.parts.length>8)
  throw new Error('Rotina de ataque inválida.');
}
export function crzExpected5e(args:{
 ruleset:CrzRuleset;attackerCount:number;attackBonus:number;targetAc:number;
 target:CrzStack;entries:readonly CrzAttackEntry[];damageBonusBP?:number;
}):CrzExpectedResult{
 const {ruleset,attackerCount,attackBonus,targetAc,target,entries}=args;
 if(ruleset.id!=='CRZ-5E'||ruleset.hit.model!=='d20')
  throw new Error('Esta rotina é exclusiva do preset CRZ-5E.');
 if(!Number.isSafeInteger(attackerCount)||attackerCount<1||
  attackerCount>ruleset.stack.maxCount||entries.length<1||entries.length>10)
  throw new Error('E_SETUP_COUNT: quantidade inválida.');
 crzSafe(attackBonus,'attack bonus');crzSafe(targetAc,'target AC');
 const damageBonusBP=args.damageBonusBP??0;
 if(!Number.isSafeInteger(damageBonusBP)||damageBonusBP< -9000||
  damageBonusBP>50000)throw new Error('Bônus de dano inválido.');
 let totalX100=0,hitsX100=0;
 const breakdown:CrzExpectedBreakdown[]=[];
 for(const e of entries){
  validEntry(e);
  const p=crzHitFactorBP(ruleset,crzSafe(e.toHit+attackBonus,'total hit'),targetAc);
  let perAttackX100=0;
  for(const part of e.parts){
   const avg=partAverageX100(part);
   const mean=mitigate(avg.full,part.mitigation);
   const dice=mitigate(avg.dice,part.mitigation);
   perAttackX100=crzSafe(perAttackX100+
    Math.floor(p*mean/CRZ_BP)+
    (ruleset.hit.critEnabled?Math.floor(ruleset.hit.critBP*dice/CRZ_BP):0),
    'per strike');
  }
  const attacks=crzSafe(attackerCount*e.count,'attacks');
  const contribution=crzSafe(attacks*perAttackX100,'contribution');
  const expectedHitsX100=Math.floor(crzSafe(attacks*p,'hits scale')/100);
  totalX100=crzSafe(totalX100+contribution,'total expected');
  hitsX100=crzSafe(hitsX100+expectedHitsX100,'expected hits');
  breakdown.push({entryId:e.id,hitBP:p,perAttackX100,
   expectedHitsX100,totalX100:contribution});
 }
 const boosted=Math.floor(crzSafe(totalX100*(10000+damageBonusBP),'damage multiplier')/10000);
 const rawDamage=Math.floor(boosted/100);
 const capHP=ruleset.damage.overkill==='cap'?
  Math.floor(crzSafe(hitsX100*target.hpPerCreature,'cap hp')/100):target.hpPool;
 const receipt=crzApplyDamage(target,Math.min(rawDamage,capHP),'carry');
 return {mode:'expected',rawDamage,expectedHitsX100:hitsX100,capHP,receipt,breakdown};
}
export type CrzRolledResult=Readonly<{
 mode:'rolled';attacks:number;hits:number;crits:number;
 rawDamage:number;receipt:CrzDamageReceipt;rngState:CrzRngState;
}>;
/** N <= 10 no modo hybrid. O estado RNG retornado pode ser guardado no snapshot.
 * Para replay verificável, a camada seguinte deve armazenar agregados do evento.
 */
export function crzRolled5e(args:{
 ruleset:CrzRuleset;attackerCount:number;attackBonus:number;targetAc:number;
 target:CrzStack;entries:readonly CrzAttackEntry[];rngState:CrzRngState;
 damageBonusBP?:number;
}):CrzRolledResult{
 const {ruleset,attackerCount,attackBonus,targetAc,entries}=args;
 if(ruleset.id!=='CRZ-5E')throw new Error('Rolagem exclusiva CRZ-5E.');
 if(!Number.isSafeInteger(attackerCount)||attackerCount<1||
  attackerCount>ruleset.stack.maxCount||entries.length<1||entries.length>10)
  throw new Error('E_SETUP_COUNT: quantidade inválida.');
 const bonus=args.damageBonusBP??0;
 if(!Number.isSafeInteger(bonus)||bonus< -9000||bonus>50000)
  throw new Error('Bônus de dano inválido.');
 const rng=crzPcg32(args.rngState);
 let target=args.target,attacks=0,hits=0,crits=0,rawDamage=0,applied=0;
 for(const e of entries){
  validEntry(e);
  const strikeBonus=crzSafe(e.toHit+attackBonus,'total attack bonus');
  for(let n=0;n<crzSafe(attackerCount*e.count,'attack count');n++){
   if(target.alive===0)break;
   attacks++;
   const roll=rng.nextInt(20)+1;
   const critical=roll===20&&ruleset.hit.critEnabled;
   if(roll===1||!critical&&roll+strikeBonus<targetAc)continue;
   hits++;if(critical)crits++;
   let total=0,immune=true;
   for(const part of e.parts){
    partAverageX100(part); // valida a entrada e os limites antes de consumir dano
    if(part.mitigation!=='immune')immune=false;
    let amount=part.mod;
    for(let k=0;k<part.dice.count*(critical?2:1);k++)
     amount=crzSafe(amount+rng.nextInt(part.dice.sides)+1,'rolled damage');
    total=crzSafe(total+mitigate(Math.max(0,amount),part.mitigation),'rolled total');
   }
   const basic=immune?0:Math.max(1,total);
   const damage=basic===0?0:Math.max(0,Math.floor(
    crzSafe(basic*(10000+bonus),'rolled bonus')/10000));
   rawDamage=crzSafe(rawDamage+damage,'damage sum');
   const result=crzApplyDamage(target,damage,'waste');
   applied=crzSafe(applied+result.damageApplied,'applied damage');
   target=result.stack;
  }
 }
 return {mode:'rolled',attacks,hits,crits,rawDamage,
  receipt:{stack:target,damageRequested:rawDamage,damageApplied:applied,
   wasted:rawDamage-applied,casualties:args.target.alive-target.alive},
  rngState:rng.state()};
}
/** Preset WotR: RD por atacante ANTES da taxa de acerto; excedente vaza.
 * Forma determinística `expected` para goldens e benchmark. Não é o sampler
 * de 10 amostras/ataque do jogo; rolagem WotR fica para próximo lote.
 */
export function crzWotrExpected(args:{
 ruleset:CrzRuleset;attackerCount:number;attackBonus:number;targetAc:number;
 averageDamageX100:number;flatDr:number;baseMultiplierBP:number;
 target:CrzStack;
}):{damage:number;hitMultiplierBP:number;receipt:CrzDamageReceipt}{
 const {ruleset,attackerCount,attackBonus,targetAc,
  averageDamageX100,flatDr,baseMultiplierBP,target}=args;
 if(ruleset.id!=='CRZ-WOTR'||ruleset.hit.model!=='wotr-linear')
  throw new Error('Preset CRZ-WOTR necessário.');
 for(const n of [attackerCount,attackBonus,targetAc,averageDamageX100,flatDr,baseMultiplierBP])
  crzSafe(n,'WotR input');
 if(attackerCount<1||attackerCount>ruleset.stack.maxCount||
  averageDamageX100<0||flatDr<0||baseMultiplierBP<0||baseMultiplierBP>50000)
  throw new Error('Ataque WotR inválido.');
 const base=Math.max(0,Math.floor(
  crzSafe(averageDamageX100*baseMultiplierBP,'base damage')/CRZ_BP)-flatDr*100);
 const hitMultiplierBP=crzHitFactorBP(ruleset,attackBonus,targetAc);
 const totalX100=Math.floor(crzSafe(
  crzSafe(base*attackerCount,'WotR attacks')*hitMultiplierBP,'WotR hit multiplier')/CRZ_BP);
 const damage=Math.floor(totalX100/100);
 return {damage,hitMultiplierBP,receipt:crzApplyDamage(target,damage,'carry')};
}
export function crzAoEExpected(args:{
 affected:number;averageDamageX100:number;saveBonus:number;dc:number;
 saveEffect:'half'|'none';target:CrzStack;
}):{failBP:number;perCreatureX100:number;rawDamage:number;receipt:CrzDamageReceipt}{
 const {affected,averageDamageX100,saveBonus,dc,saveEffect,target}=args;
 for(const n of [affected,averageDamageX100,saveBonus,dc])crzSafe(n,'AoE input');
 if(affected<1||affected>target.alive||averageDamageX100<0)
  throw new Error('AoE com alvo inválido.');
 const failBP=crzClamp(10000-500*(21+saveBonus-dc),0,10000);
 const multiplier=saveEffect==='half'?5000+Math.floor(failBP/2):failBP;
 const perCreatureX100=Math.floor(crzSafe(averageDamageX100*multiplier,'AoE scale')/CRZ_BP);
 const rawDamage=Math.floor(crzSafe(affected*perCreatureX100,'AoE total')/100);
 return {failBP,perCreatureX100,rawDamage,receipt:crzApplyDamage(target,rawDamage,'carry')};
}

/** Seleção de modo em CRZ-5E, 03 §7.5: até 10 engajados rolar,
 * acima disso utilizar esperança inteira. Nenhum RNG é criado implicitamente.
 */
export function crzResolve5e(args:{
 ruleset:CrzRuleset;engagedCount:number;attackBonus:number;targetAc:number;
 target:CrzStack;entries:readonly CrzAttackEntry[];
 damageBonusBP?:number;
 mode?:'hybrid'|'expected'|'rolled';rngState?:CrzRngState;
}):CrzExpectedResult|CrzRolledResult{
 const mode=args.mode??(args.ruleset.damage.resolution==='hybrid'?'hybrid':'expected');
 if(args.ruleset.id!=='CRZ-5E')throw new Error('Resolver 5e exige CRZ-5E.');
 const effective=mode==='hybrid'?
  (args.engagedCount<=args.ruleset.damage.hybridThreshold?'rolled':'expected'):mode;
 if(effective==='rolled'){
  if(!args.rngState)throw new Error('Modo rolado requer seed e estado de RNG.');
  return crzRolled5e({ruleset:args.ruleset,attackerCount:args.engagedCount,
   attackBonus:args.attackBonus,targetAc:args.targetAc,target:args.target,
   entries:args.entries,rngState:args.rngState,
   ...(args.damageBonusBP!==undefined?{damageBonusBP:args.damageBonusBP}:{})});
 }
 return crzExpected5e({ruleset:args.ruleset,attackerCount:args.engagedCount,
  attackBonus:args.attackBonus,targetAc:args.targetAc,target:args.target,
  entries:args.entries,
  ...(args.damageBonusBP!==undefined?{damageBonusBP:args.damageBonusBP}:{})});
}
