import {criticalFailure,degreesOfSuccess,rollDice,seedFromText} from './dice';
import type {WarBattle,WarCommander,WarCondition,WarEvent,WarOrder,WarOrderResult,WarPosition,WarSide,WarUnit} from './types';
import {terrainAt,terrainEffect,movementSlow,visibilityPenalty,weatherAttackModifier,terrainHighGround,terrainCoverBonus} from './terrain';
import type {WarTerrainTile,WarWeather,WarVisibility} from './terrain';
import {WAR_FORMATIONS,formationAllowed,formationMovement,angleAttackBonus,attackAngle} from './formations';
import {WAR_SIEGE_CATALOG,warSiegeDamage,warSiegeReloadRemaining,warSiegeTargetInRange} from './siege';
import type {WarSiegeEngine} from './siege';
import {fortForUnit,fortDefense,validateWarForts,sabotageFortification,damageWarFortification} from './fortifications';
import {igniteWarUnit,advanceWarFire,resolveCarriedWildfireRisk} from './siege-fire';
import {canSeeWarTarget} from './line-of-sight';
import {warFieldDefenseBonus,warFieldMovementMetres,warFieldOrderDifficulty,
 warFieldForbidsAttack,warFieldThrowDamage,validateWarFieldEquipment} from './field-equipment';
import type {WarFortification} from './fortifications';
import {executeAdvancedWarOrder,WAR_ADVANCED_ORDER_DIFFICULTY} from './advanced-orders';
import {validateWarHeroes,heroUnitDefenseBonus,heroUnitBonusDice,applyDamageToEmbeddedHeroes} from './heroes';
import type {WarHero} from './heroes';
import {personalPosition,spendPersonalAction} from './personal-combat';
import {queuePersonalDamage} from './personal-injuries';
import {settleWarSquadLosses} from './squads';
import {auditWarUnitStats} from './unit-validation';
import {effectivePersonalArmor,activePersonalOffhandDefense} from './personal-weapons';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import {assertPersonalTurn,settlePersonalTurn} from './personal-initiative';

const SIDES:readonly WarSide[]=['attacker','defender'];
const opposite=(side:WarSide):WarSide=>side==='attacker'?'defender':'attacker';
const inBounds=(battle:Pick<WarBattle,'width'|'height'>,p:WarPosition):boolean=>
 Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<battle.width&&p.y<battle.height;
const distance=(a:WarPosition,b:WarPosition):number=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const alive=(unit:WarUnit):boolean=>unit.condition==='organized'||unit.condition==='disorganized';
const onBoard=(unit:WarUnit):boolean=>!['destroyed','surrendered','escaped'].includes(unit.condition);
const log=(battle:WarBattle,kind:string,text:string,side:WarSide|null,details:Partial<WarEvent>={}):WarBattle=>({
 ...battle,events:[...battle.events,{seq:battle.events.length+1,round:battle.round,side,kind,text,...details}],
});
const replaceUnit=(battle:WarBattle,unit:WarUnit):WarBattle=>({
 ...battle,units:battle.units.map(row=>row.id===unit.id?unit:row),
});
function commandBudget(commanders:readonly WarCommander[],side:WarSide):Record<string,number>{
 return Object.fromEntries(commanders.filter(c=>c.side===side&&c.active).map(c=>[c.id,c.role==='commander'?c.warfare:1]));
}
const remaining=(battle:WarBattle,side:WarSide):number=>battle.commanders.filter(c=>c.side===side)
 .reduce((sum,c)=>sum+(battle.ordersRemaining[c.id]??0),0);
const turnAfter=(battle:WarBattle,acted:WarSide):WarSide=>{
 const other=opposite(acted);
 if(remaining(battle,other)>0)return other;
 if(remaining(battle,acted)>0)return acted;
 return battle.first;
};
function checkVictory(battle:WarBattle):WarBattle{
 const capable=(side:WarSide)=>battle.units.some(u=>u.side===side&&alive(u));
 const a=capable('attacker'),d=capable('defender');
 if(a&&d)return battle;
 return log({...battle,phase:'finished',winner:a?'attacker':d?'defender':null},'result',
  a?'Vitória do atacante.':d?'Vitória do defensor.':'Ambas as forças perderam a capacidade de combater.',null);
}
function sideInitiative(battle:WarBattle):WarBattle{
 const scores:Partial<Record<WarSide,{total:number;warfare:number;strategy:number}>>={};
 let next=battle;
 for(const side of SIDES){
  const leader=next.commanders.find(c=>c.side===side&&c.role==='commander'&&c.active);
  if(!leader){scores[side]={total:0,warfare:0,strategy:0};continue;}
  const roll=rollDice(next.seed,leader.warfare,leader.strategy);
  next={...next,seed:roll.nextSeed};
  scores[side]={total:roll.total,warfare:leader.warfare,strategy:leader.strategy};
  next=log(next,'initiative',leader.name+' testou Guerra para iniciativa: '+roll.total+'.',side,{
   roll:roll.dice,total:roll.total,difficulty:0,
  });
 }
 const a=scores.attacker!,d=scores.defender!;
 const first=a.total!==d.total?(a.total>d.total?'attacker':'defender'):
  a.warfare!==d.warfare?(a.warfare>d.warfare?'attacker':'defender'):
  a.strategy!==d.strategy?(a.strategy>d.strategy?'attacker':'defender'):'defender';
 return {...next,first,turn:first};
}
export function createWarBattle(input:{
 id:string;name:string;seed:string;width:number;height:number;
 commanders:readonly WarCommander[];units:readonly WarUnit[];
 tiles?:readonly WarTerrainTile[];weather?:WarWeather;visibility?:WarVisibility;
 advancedFormations?:boolean;siege?:readonly WarSiegeEngine[];
 manualMitigation?:boolean;strictLineOfSight?:boolean;
 fortifications?:readonly WarFortification[];heroes?:readonly WarHero[];
}):WarBattle{
 if(!input.id.trim()||!input.name.trim()||input.seed.length<1)throw new Error('Identificação do combate inválida.');
 if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<5||input.height<5||
 input.width>60||input.height>60)throw new Error('Dimensão do mapa inválida.');
 const ids=[...input.units.map(u=>u.id),...input.commanders.map(c=>c.id)];
 if(new Set(ids).size!==ids.length||input.units.length<2)throw new Error('Identificadores ou unidades inválidos.');
 const siegeIds=new Set<string>();
 const engineerCounts=new Map<string,number>();
 for(const engine of input.siege??[]){
  const profile=WAR_SIEGE_CATALOG[engine.kind];
  if(!profile||siegeIds.has(engine.id)||!engine.id.trim()||!inBounds(input,engine.position)||
   !Number.isInteger(engine.health)||engine.health<0||engine.health>profile.maxHealth||
   (engine.lastFiredRound!==null&&(!Number.isInteger(engine.lastFiredRound)||
    engine.lastFiredRound<0)))throw new Error('Máquina de cerco inválida.');
  siegeIds.add(engine.id);
  const operator=input.units.find(u=>u.id===engine.engineerId);
  if(!operator||operator.side!==engine.side||operator.typeId!=='engineers'||!alive(operator))
   throw new Error('Uma máquina de cerco precisa de unidade de engenheiros ativa.');
  engineerCounts.set(operator.id,(engineerCounts.get(operator.id)??0)+1);
  if(engineerCounts.get(operator.id)!>4)throw new Error('Cada unidade de engenheiros opera até quatro máquinas.');
 }
 const occupied=new Set<string>();
 for(const tile of input.tiles??[]){
  if(!inBounds(input,tile)||!terrainEffect(tile))throw new Error('Terreno inválido.');
 }
 for(const u of input.units){
  auditWarUnitStats(u);
  validateWarFieldEquipment(u);
  if(!inBounds(input,u.position))throw new Error('Unidade fora do mapa: '+u.name);
  const key=u.position.x+':'+u.position.y;
  if(occupied.has(key))throw new Error('Duas unidades ocupam o mesmo quadrado.');
  occupied.add(key);
  if(u.maxHealth!==u.ability.endurance*3||u.health<0||u.health>u.maxHealth||u.armor<0||
   u.discipline<0||u.defense<0)throw new Error('Atributos inconsistentes com o livro: '+u.name);
 }
 validateWarForts(input.fortifications??[],input.units,input.width,input.height);
 validateWarHeroes(input.heroes??[],input.units,input.width,input.height);
 for(const side of SIDES){
  const leaders=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='commander');
  const sub=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='subcommander');
  if(leaders.length!==1||!Number.isInteger(leaders[0]!.warfare)||leaders[0]!.warfare<1||
   leaders[0]!.warfare>12||sub.length>Math.floor(input.units.filter(u=>u.side===side).length/2))
   throw new Error('Exige comandante válido e no máximo um subcomandante para cada duas unidades.');
  if(input.units.filter(u=>u.side===side).length<1)throw new Error('Cada lado precisa de unidades.');
  // Cap. 10, p. 222: cada exército dispõe de até Status do comandante em heróis.
  if((input.heroes??[]).filter(h=>h.side===side&&h.role==='hero').length>
   leaders[0]!.status)
   throw new Error('Número de heróis excede o Status do comandante.');
 }
 const commanders=input.commanders.map(c=>({...c}));
 const units=input.units.map(u=>({...u,position:{...u.position},ability:{...u.ability},
  ...(input.advancedFormations?{formation:u.formation??'battle',facing:u.facing??(u.side==='attacker'?'east':'west')}:{}),
  standing:u.standing?{...u.standing}:null,issuedThisRound:0,actedThisRound:false,criticalThisRound:false}));
 const initial:WarBattle={id:input.id,name:input.name,seed:seedFromText(input.seed),schemaVersion:1,
  rulesVersion:'GOT-CH10-1',width:input.width,height:input.height,metresPerCell:10,
  round:1,phase:(input.siege?.length??0)>0?'siege':(input.heroes?.length?'heroes-first':'orders'),
  first:'defender',turn:'defender',units,commanders,
  heroes:(input.heroes??[]).map(h=>({...h,position:{...h.position},usedActions:0})),
  manualMitigation:input.manualMitigation??false,squads:[],
  siege:[...(input.siege??[])],siegeCompleted:{attacker:false,defender:false},
  tiles:[...(input.tiles??[])],weather:input.weather??'clear',visibility:input.visibility??'clear',
  advancedFormations:input.advancedFormations??false,
  strictLineOfSight:input.strictLineOfSight??false,
  fortifications:(input.fortifications??[]).map(f=>({...f,cells:f.cells.map(x=>({...x}))})),
  ordersRemaining:{...commandBudget(commanders,'attacker'),...commandBudget(commanders,'defender')},
  events:[],winner:null};
 return sideInitiative(initial);
}
/** Tabela 10-3: movimento lento reduz o MOVIMENTO da ordem em 10 m,
 * muito lento em 20 m. O penalizador de terreno é aplicado uma vez pela
 * maior restrição atravessada, não cobrado novamente a cada quadrado.
 * Dijkstra só conclui a rota ao retirar o destino da fila ordenada;
 * retornar na primeira descoberta escolhia rotas mais caras.
 */
function movePath(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,maxCells:number):WarPosition[]{
 if(!inBounds(battle,to))throw new Error('Destino fora do campo de batalha.');
 if(sprint&&unit.naval)throw new Error('Navios de guerra não podem correr.');
 if(unit.position.x===to.x&&unit.position.y===to.y)return [];
 const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u))
  .map(u=>u.position.x+':'+u.position.y));
 const directX=to.x-unit.position.x,directY=to.y-unit.position.y;
 if(sprint&&directX!==0&&directY!==0)
  throw new Error('Corrida exige deslocamento em linha reta.');
 const slowAt=(p:WarPosition)=>movementSlow(terrainAt(battle.tiles,p),
  battle.visibility,battle.weather);
 const startSlow=slowAt(unit.position);
 const key=(p:WarPosition,slow:number)=>p.x+':'+p.y+':'+slow;
 type PathStep={pos:WarPosition;path:WarPosition[];cost:number;maxSlow:number};
 const queue:PathStep[]=[{pos:unit.position,path:[],cost:0,maxSlow:startSlow}];
 const seen=new Map([[key(unit.position,startSlow),0]]);
 while(queue.length){
  queue.sort((a,b)=>a.cost-b.cost);
  const current=queue.shift()!;
  const {pos,path,cost,maxSlow}=current;
  if(cost>(seen.get(key(pos,maxSlow))??Infinity))continue;
  if(pos.x===to.x&&pos.y===to.y)return path;
  if(cost>=maxCells)continue;
  for(const [dx,dy] of ([[1,0],[-1,0],[0,1],[0,-1]] as const)){
   const step={x:pos.x+dx,y:pos.y+dy};
   if(!inBounds(battle,step)||occupied.has(step.x+':'+step.y))continue;
   const tile=terrainAt(battle.tiles,step),effect=terrainEffect(tile);
   // Rios e lagos bloqueiam soldados terrestres, mas permitem navios.
   if((effect.blocked&&!(unit.naval&&effect.naval))||
    (effect.water&&!unit.naval)||(unit.mounted&&effect.noCavalry))continue;
   if(unit.naval&&!effect.naval)continue;
   if(sprint&&(directX!==0&&step.y!==unit.position.y||
    directY!==0&&step.x!==unit.position.x))continue;
   const nextSlow=Math.max(maxSlow,slowAt(step));
   const candidate=[...path,step];
   const nextCost=candidate.length+nextSlow;
   const stepKey=key(step,nextSlow);
   if(nextCost>maxCells||(seen.get(stepKey)??Infinity)<=nextCost)continue;
   seen.set(stepKey,nextCost);
   queue.push({pos:step,path:candidate,cost:nextCost,maxSlow:nextSlow});
  }
 }
 throw new Error('Destino inacessível no limite de movimento ou ocupado.');
}
function movementCells(unit:WarUnit,sprint:boolean):number{
 const base=Math.max(0,(unit.naval?60:unit.mounted?80:40)-unit.bulk*10);
 const equipped=warFieldMovementMetres(unit,sprint&&!unit.naval?base*4:base);
 return Math.floor(equipped/10);
}
function availableMovementMetres(battle:WarBattle,unit:WarUnit,sprint:boolean):number{
 const base=movementCells(unit,sprint)*10;
 return battle.advancedFormations&&unit.formation?
  formationMovement(base,unit.formation):base;
}
export type WarMovementPreview=Readonly<{
 legal:boolean;path:readonly WarPosition[];distanceMetres:number;
 costMetres:number;budgetMetres:number;reason:string;
}>;
/** Prévia sem dados ou mutação: exatamente a rota usada pela ordem Mover. */
export function previewWarMovement(
 battle:WarBattle,unitId:string,to:WarPosition,sprint=false,
):WarMovementPreview{
 const unit=battle.units.find(u=>u.id===unitId);
 if(!unit||!alive(unit))return {legal:false,path:[],distanceMetres:0,
  costMetres:0,budgetMetres:0,reason:'Unidade não está apta para marchar.'};
 const budgetMetres=availableMovementMetres(battle,unit,sprint);
 try{
  const path=movePath(battle,unit,to,sprint,Math.floor(budgetMetres/10));
  const slowest=path.length?Math.max(
   movementSlow(terrainAt(battle.tiles,unit.position),battle.visibility,battle.weather),
   ...path.map(p=>movementSlow(terrainAt(battle.tiles,p),battle.visibility,battle.weather))
  ):0;
  const costMetres=path.length*10+slowest*10;
  return {legal:true,path,distanceMetres:path.length*10,costMetres,budgetMetres,
   reason:path.length?'Rota disponível.':'Unidade já ocupa este quadrado.'};
 }catch(e){
  return {legal:false,path:[],distanceMetres:0,costMetres:0,budgetMetres,
   reason:e instanceof Error?e.message:'Destino indisponível.'};
 }
}
function move(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,limit?:number):WarBattle{
 const max=limit??Math.floor(availableMovementMetres(battle,unit,sprint)/10);
 const path=movePath(battle,unit,to,sprint,max);
 if(!path.length)return log(battle,'move-still',unit.name+' permaneceu na mesma posição.',unit.side);
 let next=battle;
 const final=path.at(-1)??unit.position;
 const holder=unit.envelopedBy?next.units.find(u=>u.id===unit.envelopedBy&&alive(u)):null;
 if(holder&&distance(final,holder.position)>1){
  // A reação livre acontece ANTES da retirada. O alvo ainda está adjacente.
  next=attack(next,holder,unit,false);
  if(!alive(next.units.find(u=>u.id===unit.id)!))
   return log(next,'envelop-retreat-blocked',
    unit.name+' não conseguiu romper o envolvimento.',unit.side);
  next=replaceUnit(next,{...next.units.find(u=>u.id===holder.id)!,
   envelopingTargetId:undefined});
 }
 const moving=next.units.find(u=>u.id===unit.id)!;
 const broken=Boolean(holder&&distance(final,holder.position)>1);
 next=replaceUnit(next,{...moving,position:final,hidden:false,
  ...(broken?{envelopedBy:undefined}:{})});
 return triggerReadyReactions(log(next,'move',unit.name+' moveu '+path.length*10+
  ' m'+(sprint?' em corrida':'')+'.',unit.side),unit.id,'enemy-adjacent');
}
function applyDamage(battle:WarBattle,target:WarUnit,amount:number,attackerName:string):WarBattle{
 if(amount<=0)return log(battle,'armor',target.name+' absorveu todo o dano.',target.side);
 let updated:WarUnit;
 if(target.condition==='routed'||amount>target.maxHealth*2){
  updated={...target,health:0,condition:'destroyed',standing:null};
 }else if(target.condition==='disorganized'){
  updated={...target,health:0,condition:'routed',standing:{kind:'retreat'},
   ...(battle.advancedFormations?{formation:'mob' as const}:{})};
 }else{
  const health=target.health-amount;
  if(health>0){updated={...target,health};}
  else{
   const disorganizations=target.disorganizations+1;
   updated={...target,health:0,disorganizations,
    condition:disorganizations>=target.ability.endurance?'destroyed':'disorganized',
    standing:disorganizations>=target.ability.endurance?null:target.standing};
  }
 }
 const text=attackerName+' causou '+amount+' de dano em '+target.name+'. Condição: '+updated.condition+'.';
 let withUnit=replaceUnit(battle,updated);
 if(!alive(updated)&&(target.envelopedBy||target.envelopingTargetId)){
  withUnit={...withUnit,units:withUnit.units.map(u=>{
   if(u.id===updated.id)return {...u,envelopedBy:undefined,envelopingTargetId:undefined};
   if(u.envelopingTargetId===updated.id)return {...u,envelopingTargetId:undefined};
   if(u.envelopedBy===updated.id)return {...u,envelopedBy:undefined};
   return u;
  })};
 }
 // Dano efetivo revela a posição de uma unidade previamente escondida.
 if(updated.hidden)withUnit=replaceUnit(withUnit,{...updated,hidden:false});
 const withHeroes=applyDamageToEmbeddedHeroes(withUnit,target,updated,amount);
 const resolved=log(withHeroes,'damage',text,target.side);
 const afterAccident=resolveCarriedWildfireRisk(resolved,target.id,applyDamage);
 return target.condition!=='routed'&&updated.condition==='routed'?
  triggerReadyReactions(afterAccident,target.id,'enemy-routed'):afterAccident;
}
/** A pegada da unidade tem 10×10 m; a pessoa usa coordenadas de 1 m. */
function distanceFromHeroToUnit(hero:WarHero,unit:WarUnit):number{
 const p=personalPosition(hero),left=unit.position.x*10,top=unit.position.y*10;
 const dx=Math.max(left-p.x,0,p.x-(left+9));
 const dy=Math.max(top-p.y,0,p.y-(top+9));
 return Math.max(dx,dy);
}
/** Capítulo 10, passo 6/8: um personagem atacando uma unidade inteira.
 * A unidade recebe +20 Defesa; resolver a Saúde coletiva pelo motor de guerra.
 */
export function executeWarHeroAttackUnit(battle:WarBattle,input:{
 heroId:string;unitId:string;ranged?:boolean;
 twoHandedGrip?:boolean;powerBonusDice?:number;
}):WarBattle{
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('Ataques pessoais exigem a fase de heróis.');
 const hero=battle.heroes.find(h=>h.id===input.heroId);
 const target=battle.units.find(u=>u.id===input.unitId);
 if(!hero||!hero.active||hero.role!=='hero'||hero.unitId||
  hero.usedActions>=5||hero.lockedUntilRound===battle.round||
  !target||!onBoard(target)||target.side===hero.side)
  throw new Error('Herói ou unidade inimiga indisponível.');
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 assertPersonalTurn(battle,hero.id);
 if(hero.pinnedByHero||hero.pinnedByMount||hero.grabbedBy||
  hero.grapplingTargetId||hero.impaledBy)
  throw new Error('Libere a contenção antes de atacar uma unidade coletiva.');
 const ranged=Boolean(input.ranged),distanceMetres=distanceFromHeroToUnit(hero,target);
 if(ranged?hero.rangedWeaponBroken:hero.meleeWeaponBroken)
  throw new Error('Arma quebrada impede ataque contra a unidade.');
 const range=ranged?(hero.rangedRange==='long'?100:10):
  (hero.meleeWeapon?.reachMetres??1);
 if(!ranged&&distanceMetres>range)
  throw new Error('Ataque de Luta exige contato com a unidade em escala pessoal.');
 if(ranged&&(hero.rangedRange==='none'||hero.rangedDamage<=0))
  throw new Error('Herói sem arma de Pontaria.');
 if(ranged&&hero.rangedWeapon?.reload&&hero.rangedLoaded===false)
  throw new Error('Arma de Pontaria exige recarga antes de disparar.');
 const chosenWeapon=ranged?hero.rangedWeapon:hero.meleeWeapon;
 if(!ranged&&chosenWeapon?.counterChargeOnly)
  throw new Error('Pique Contra Carga exige reação específica a uma carga.');
 if(input.twoHandedGrip&&(!chosenWeapon?.adaptable||ranged))
  throw new Error('Uso Adaptável exige arma de Luta apropriada.');
 const invested=input.powerBonusDice??0;
 if(!Number.isInteger(invested)||invested<0||invested>(hero.strengthBonusDice??0)||
  (invested>0&&!chosenWeapon?.powerful))
  throw new Error('Dados de Força investidos inválidos para arma Poderosa.');
 const used=spendPersonalAction(hero,'major');
 const rangePenalty=ranged?Math.max(0,Math.ceil((distanceMetres-range)/
  (hero.rangedRange==='long'?100:10))):0;
 const weapon=ranged?hero.rangedWeapon:hero.meleeWeapon;
 const availableBonus=(ranged?hero.rangedBonusDice:hero.meleeBonusDice)??0;
 const requiredBonus=weapon?.trainingBonusDice??0;
 const penalty=Math.min(15,(hero.injuries??0)+
  Math.max(0,requiredBonus-availableBonus)+
  (hero.mounted&&weapon?.clumsy?2:0)+
  (!hero.mounted&&weapon?.mountedOnly?2:0)+
  (hero.oneHandUnavailable&&weapon?.twoHanded?2:0)+
  visibilityPenalty(battle.visibility,battle.weather,ranged)+rangePenalty);
 const roll=rollPersonalWithFate(battle.seed,hero,ranged?hero.marksmanship:hero.fighting,
  Math.min(15,Math.max(0,availableBonus-requiredBonus)+
   (hero.passBonusDice??0)+(hero.aimBonusDice??0)),penalty);
 const total=Math.max(0,roll.total-(hero.wounds??0)-(hero.entangledBy?5:0));
 const difficulty=target.defense+20;
 const degrees=degreesOfSuccess(total,difficulty);
 const damage=degrees?Math.max(0,
  ((ranged?hero.rangedDamage:
    hero.meleeDamage+(chosenWeapon?.adaptable&&input.twoHandedGrip?1:0))+
   invested)*degrees-
   effectivePersonalArmor(target.armor,ranged?hero.rangedWeapon:hero.meleeWeapon)):0;
 let next:WarBattle={...battle,seed:roll.nextSeed,
  heroes:battle.heroes.map(h=>h.id===hero.id?{
   ...consumePersonalFateRoll(used),passBonusDice:0,aimBonusDice:0,
   ...(ranged&&weapon?.reload?{rangedLoaded:false}:{})
  }:h)};
 next=log(next,'hero-vs-unit',hero.name+' atacou '+target.name+' (Defesa +20): '+
  total+' vs '+difficulty+', '+degrees+' grau(s), '+damage+' dano.',hero.side,{
   roll:roll.dice,total,difficulty,degrees,
  });
 if(damage>0)next=applyDamage(next,target,damage,hero.name);
 if(degrees>=2&&weapon?.shattering){
  const current=next.units.find(u=>u.id===target.id);
  if(current&&current.armor>0){
   const loss=Math.min(current.armor,weapon.shattering);
   next={...next,units:next.units.map(u=>u.id===target.id?{
    ...u,armor:u.armor-loss,
   }:u)};
   next=log(next,'hero-shatter-unit',hero.name+' reduziu o VA de '+
    target.name+' em '+loss+' com '+weapon.label+'.',hero.side);
  }
 }
 if(degrees>=2&&weapon?.fragile){
  next={...next,heroes:next.heroes.map(h=>h.id===hero.id?{
   ...h,...(ranged?{rangedWeaponBroken:true}:{meleeWeaponBroken:true}),
  }:h)};
  next=log(next,'hero-weapon-broken',hero.name+' quebrou '+weapon.label+
   ' após dois ou mais graus de sucesso.',hero.side);
 }
 return settlePersonalTurn(battle,checkVictory(next),hero.id);
}
/** Capítulo 10: quando 100 homens atacam uma pessoa, recebem +2D. */
function attackIndividualFromWarUnit(
 battle:WarBattle,actor:WarUnit,hero:WarHero,ranged:boolean,
):WarBattle{
 if(!alive(actor)||!hero.active||hero.unitId||hero.side===actor.side)
  throw new Error('Herói inimigo não pode ser atacado pela unidade.');
 const distanceMetres=distanceFromHeroToUnit(hero,actor);
 const max=ranged?(actor.range==='long'?200:actor.range==='short'?20:0):1;
 if(max===0||distanceMetres>max)
  throw new Error('Herói fora do alcance da unidade.');
 const rank=ranged?actor.ability.marksmanship:actor.ability.fighting;
 const roll=rollDice(battle.seed,Math.min(15,rank+2),
  (ranged?actor.rangedBonusDice:actor.meleeBonusDice)??0,
  (actor.condition==='disorganized'?1:0)+
  visibilityPenalty(battle.visibility,battle.weather,ranged));
 const total=roll.total;
 const difficulty=Math.max(1,(hero.dodgeDefense??hero.defense)+
  activePersonalOffhandDefense(hero)-(hero.pinnedByHero?(hero.agility??3):0)+
  (hero.cautiousDefenseBonus??0)-(hero.recklessDefensePenalty??0)-
  (hero.pinnedByMount?5:0));
 const degrees=degreesOfSuccess(total,difficulty);
 const damage=degrees?Math.max(0,
  (ranged?actor.rangedDamage:actor.meleeDamage)*degrees-hero.armor):0;
 let next:WarBattle={...battle,seed:roll.nextSeed};
 if(damage>0)next=queuePersonalDamage(next,{actorName:actor.name,
  targetHeroId:hero.id,damage,source:'unit'});
 const defeated=next.heroes.find(h=>h.id===hero.id)?.active===false;
 return log(next,'unit-vs-hero',actor.name+' atacou '+hero.name+
  ' (+2D de Luta/Pontaria): '+total+' vs Defesa '+difficulty+
  ', '+degrees+' grau(s), '+damage+' dano potencial'+
  (defeated?' (derrotado)':'')+'.',
  actor.side,{roll:roll.dice,total,difficulty,degrees});
}
function chooseNearest(battle:WarBattle,unit:WarUnit,ranged:boolean):WarUnit|null{
 const max=ranged?(unit.range==='long'?20:unit.range==='short'?2:0):1;
 return battle.units.filter(u=>u.side!==unit.side&&onBoard(u)&&
   (!u.hidden||distance(u.position,unit.position)<=1)&&distance(u.position,unit.position)<=max)
   .sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position)||a.id.localeCompare(b.id))[0]??null;
}
function attack(battle:WarBattle,attacker:WarUnit,target:WarUnit,ranged:boolean,
 options:{charge?:boolean;penalty?:number;counterCharge?:boolean;
  testRank?:number;bonusDice?:number;damageBonus?:number;
  /** Pinça: resolve o acerto sem modificar o alvo até ambos atacarem. */
  deferDamage?:(damage:number)=>void;}={}):WarBattle{
 if(!alive(attacker))throw new Error('Esta unidade não pode atacar.');
 if(warFieldForbidsAttack(attacker))
  throw new Error('O equipamento especial impede ataques enquanto estiver transportado.');
 if(!onBoard(target)||target.side===attacker.side)throw new Error('Alvo indisponível.');
 // Uma tropa escondida só pode ser escolhida por quem já a alcançou.
 // A resolução de detecção a distância continua reservada ao Narrador.
 if(target.hidden&&distance(attacker.position,target.position)>1)
  throw new Error('Unidade escondida: é preciso descobri-la antes de atacar.');
 const max=ranged?(attacker.range==='long'?20:attacker.range==='short'?2:0):1;
 if(!max||distance(attacker.position,target.position)>max||(!ranged&&distance(attacker.position,target.position)===0))
  throw new Error('O alvo não está no alcance.');
 if(ranged&&battle.strictLineOfSight&&
  !canSeeWarTarget(attacker.position,target.position,battle.tiles))
  throw new Error('Linha de visão bloqueada entre unidades.');
 const score=ranged?attacker.ability.marksmanship:attacker.ability.fighting;
 let extraPenalty=(attacker.condition==='disorganized'?1:0)+(options.penalty??0)+(options.charge?1:0);
 let bonus=options.bonusDice??(ranged?(attacker.rangedBonusDice??0):(attacker.meleeBonusDice??0));
 let testDice=heroUnitBonusDice(battle,attacker);
 let formationDefense=0;
 if(battle.advancedFormations){
  const own=WAR_FORMATIONS[attacker.formation??'battle'];
  const enemy=WAR_FORMATIONS[target.formation??'battle'];
  if(own.noAttack)throw new Error('Esta formação não permite ataques.');
  extraPenalty+=ranged?0:own.meleePenalty;
  if(!ranged){
   if(options.charge)testDice+=own.chargeBonus;
   if(target.formation==='mob')testDice+=own.meleeBonusAgainstMob;
   const ownAngle=attackAngle(target.position,attacker.position,attacker.facing??'north');
   if(ownAngle==='rear')throw new Error('Uma unidade não pode atacar pela própria retaguarda.');
   if(ownAngle==='flank')extraPenalty+=1;
   const angle=attackAngle(attacker.position,target.position,target.facing??'north');
   const closeEnemies=battle.units.filter(u=>u.side===attacker.side&&alive(u)&&
    distance(u.position,target.position)===1).length;
   const edge=angleAttackBonus(angle,closeEnemies>=2,enemy.flankImmunity);
   bonus+=edge.bonusDice;testDice+=edge.testDice;
  }
  formationDefense=ranged?enemy.rangedDefense:enemy.meleeDefense;
 }
 const attackerTile=terrainAt(battle.tiles,attacker.position);
 const targetTile=terrainAt(battle.tiles,target.position);
 bonus+=terrainHighGround(attackerTile,targetTile);
 extraPenalty+=visibilityPenalty(battle.visibility,battle.weather,ranged);
 const roll=rollDice(battle.seed,Math.min(15,Math.max(1,(options.testRank??score)+testDice)),bonus,extraPenalty);
 let next:{seed:number}&WarBattle={...battle,seed:roll.nextSeed};
 const cover=terrainCoverBonus(targetTile,ranged,target.defendRoll!==null);
 const fort=fortForUnit(battle.fortifications,target);
 const fortBonus=fort?fortDefense(fort):0;
 const probeBonus=target.probeDefenseRound===battle.round?2:0;
 const defense=(target.defendRoll??target.defense)+cover+formationDefense+
  fortBonus+probeBonus+warFieldDefenseBonus(target,ranged);
 const adjustedRoll=Math.max(0,roll.total+weatherAttackModifier(battle.weather));
 const degrees=degreesOfSuccess(adjustedRoll,defense);
 const baseDamage=(ranged?attacker.rangedDamage:attacker.meleeDamage+(options.charge?2:0))+(options.damageBonus??0);
 const raw=baseDamage*(degrees+(options.counterCharge&&degrees>0?1:0));
 const damage=Math.max(0,raw-target.armor);
 next=log(next,'attack',attacker.name+' atacou '+target.name+' ('+(ranged?'Pontaria':'Luta')+
  '); teste '+adjustedRoll+' vs Defesa '+defense+', '+degrees+' grau(s).',attacker.side,{
   roll:roll.dice,total:adjustedRoll,difficulty:defense,degrees,
  });
 if(!degrees)return next;
 if(options.deferDamage){
  options.deferDamage(damage);
  return next;
 }
 const linkedId=ranged?(target.envelopedBy??target.envelopingTargetId):undefined;
 next=applyDamage(next,target,damage,attacker.name);
 if(linkedId){
  const linked=next.units.find(u=>u.id===linkedId&&alive(u));
  if(linked){
   const secondary=Math.max(0,raw-linked.armor);
   next=log(next,'envelop-friendly-fire',
    'Disparo sobre tropas envolvidas atinge também '+linked.name+
    ' ('+secondary+' dano).',attacker.side);
   next=applyDamage(next,linked,secondary,attacker.name);
  }
 }
 return next;
}
/** A ordem Prontidão fica armada até uma condição de movimento ou debandada ocorrer.
 * Reações resolvem antes de a unidade que se move concluir sua ação (inclusive carga).
 */
function triggerReadyReactions(battle:WarBattle,subjectId:string,
 trigger:'enemy-adjacent'|'enemy-routed'):WarBattle{
 let next=battle;
 const initial=next.units.find(u=>u.id===subjectId);
 if(!initial)return next;
 const candidates=next.units.filter(u=>u.side!==initial.side&&alive(u)&&
  u.standing?.kind==='ready'&&u.standing.ready?.trigger===trigger);
 for(const candidate of candidates){
  const subject=next.units.find(u=>u.id===subjectId);
  const watcher=next.units.find(u=>u.id===candidate.id);
  if(!subject||!onBoard(subject)||!watcher||!alive(watcher))continue;
  const plan=watcher.standing?.ready;
  if(watcher.standing?.kind!=='ready'||!plan||plan.trigger!==trigger)continue;
  if(trigger==='enemy-adjacent'&&distance(watcher.position,subject.position)!==1)continue;
  if(trigger==='enemy-routed'&&subject.condition!=='routed')continue;
  const ranged=Boolean(plan.ranged);
  const max=plan.reaction==='attack'?(ranged?(watcher.range==='long'?20:watcher.range==='short'?2:0):1):Infinity;
  if(plan.reaction==='attack'&&(max===0||distance(watcher.position,subject.position)>max))continue;
  // Consumir antes da execução impede cadeias recursivas de reações.
  next=replaceUnit(next,{...watcher,standing:plan.reaction==='attack'?{kind:'attack',ranged}:null});
  try{
   const current=next.units.find(u=>u.id===watcher.id)!;
   if(plan.reaction==='attack')next=attack(next,current,subject,ranged);
   else if(plan.to)next=move(next,current,plan.to,false);
   next=log(next,'ready-trigger',watcher.name+' executou prontidão após '+
    (trigger==='enemy-routed'?'debandada':'aproximação inimiga')+'.',watcher.side);
  }catch{
   next=log(next,'ready-skip',watcher.name+
    ' não conseguiu completar a reação de prontidão.',watcher.side);
  }
 }
 return next;
}
function retreatStep(battle:WarBattle,unit:WarUnit,steps:number,rout:boolean):WarBattle{
 const foes=battle.units.filter(u=>u.side!==unit.side&&onBoard(u));
 if(!foes.length)return battle;
 const nearest=foes.sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position))[0]!;
 const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 let pos={...unit.position},escaped=false;
 let slowest=movementSlow(terrainAt(battle.tiles,pos),battle.visibility,battle.weather);
 for(let i=0;i<steps;i++){
  const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u)).map(u=>u.position.x+':'+u.position.y));
  const candidates=dirs.map(([dx,dy])=>({x:pos.x+dx!,y:pos.y+dy!}))
   .filter(p=>!occupied.has(p.x+':'+p.y)&&distance(p,nearest.position)>distance(pos,nearest.position))
   .sort((a,b)=>distance(b,nearest.position)-distance(a,nearest.position));
  const outside=candidates.find(p=>!inBounds(battle,p));
  if(outside&&i+1+slowest<=steps){escaped=true;break;}
  const allowed=candidates.filter(p=>{
   if(!inBounds(battle,p))return false;
   const tile=terrainAt(battle.tiles,p),effect=terrainEffect(tile);
   return (!effect.blocked||(unit.naval&&effect.naval))&&
    !(effect.water&&!unit.naval)&&
    !(unit.mounted&&effect.noCavalry)&&
    (!unit.naval||effect.naval||tile.terrain==='coast')&&
    i+1+Math.max(slowest,movementSlow(tile,battle.visibility,battle.weather))<=steps;
  });
  if(!allowed.length)break;
  // Retiradas não atravessam paredes, rios ou montanhas proibidas.
  pos=allowed[0]!;
  slowest=Math.max(slowest,movementSlow(terrainAt(battle.tiles,pos),
   battle.visibility,battle.weather));
  if(i+1+slowest>=steps)break;
 }
 const updated={...unit,position:pos,condition:escaped?'escaped' as WarCondition:unit.condition,
  standing:escaped?null:unit.standing,
  ...(escaped?{}:{hidden:false})};
 return log(replaceUnit(battle,updated),rout?'rout':'retreat',
  unit.name+(escaped?' saiu do campo.':' retirou-se até '+pos.x+','+pos.y+'.'),unit.side);
}
function perform(battle:WarBattle,unit:WarUnit,order:WarOrder,degrees:number):WarBattle{
 if(order.kind==='discard-equipment'){
  if(!unit.fieldEquipment||unit.fieldEquipmentConsumed)
   throw new Error('A unidade não possui equipamento a abandonar.');
  return log(replaceUnit(battle,{...unit,fieldEquipmentConsumed:true}),
   'discard-equipment',unit.name+' abandonou '+unit.fieldEquipment+'.',unit.side);
 }
 if(order.kind==='breach-gate'){
  if(unit.fieldEquipmentConsumed||
   !['ram','covered-ram'].includes(unit.fieldEquipment??''))
   throw new Error('Arrombar portões exige aríete disponível.');
  const fort=battle.fortifications.find(f=>f.id===order.fortId&&
   f.side!==unit.side&&!f.breached&&f.structuralHealth!==0);
  if(!fort||!fort.cells.some(p=>distance(unit.position,p)<=1))
   throw new Error('Arrombar exige fortificação inimiga adjacente.');
  const covered=unit.fieldEquipment==='covered-ram';
  const difficulty=order.wallDifficulty??12;
  if(!Number.isInteger(difficulty)||difficulty<1||difficulty>30)
   throw new Error('Dificuldade de arrombamento inválida.');
  const roll=rollDice(battle.seed,covered?8:unit.ability.athletics,
   covered?0:2,unit.condition==='disorganized'?1:0);
  const success=degreesOfSuccess(roll.total,difficulty);
  let next:WarBattle={...battle,seed:roll.nextSeed};
  if(success){
   const hit=damageWarFortification(fort,5*success+(covered?8:0));
   next={...next,fortifications:next.fortifications.map(f=>
    f.id===fort.id?hit.fort:f)};
   next=log(next,hit.breached?'gate-breached':'gate-damage',
    unit.name+' atingiu '+fort.name+' com o aríete: '+
    hit.damage+' dano estrutural'+(hit.breached?', brecha aberta.':'.'),
    unit.side);
  }
  return log(next,'ram-test',unit.name+' arrombou '+fort.name+
   ' ('+roll.total+' vs '+difficulty+').',unit.side,{
    roll:roll.dice,total:roll.total,difficulty,degrees:success});
 }
 if(order.kind==='fire-special'){
  if(!order.targetId)throw new Error('Selecione a unidade alvo da munição especial.');
  const target=battle.units.find(u=>u.id===order.targetId&&u.side!==unit.side&&onBoard(u));
  if(!target)throw new Error('Alvo especial inválido.');
  const payload=warFieldThrowDamage(unit);
  if(distance(unit.position,target.position)>1)
   throw new Error('Munição especial só atinge unidade adjacente.');
  if(!payload.wildfire&&!fortForUnit(battle.fortifications,unit))
   throw new Error('Água e óleo fervente exigem posição em fortificação.');
  const difficulty=target.defense+warFieldDefenseBonus(target,true)+
   (fortForUnit(battle.fortifications,target)?
    fortDefense(fortForUnit(battle.fortifications,target)!):0);
  const roll=rollDice(battle.seed,unit.ability.marksmanship,
   unit.rangedBonusDice??0,unit.condition==='disorganized'?1:0);
  const success=degreesOfSuccess(roll.total,difficulty);
  let next:WarBattle={...battle,seed:roll.nextSeed,
   units:battle.units.map(u=>u.id===unit.id?{
    ...u,fieldEquipmentConsumed:true}:u)};
  next=log(next,'special-fire',unit.name+' utilizou '+unit.fieldEquipment+
   ' contra '+target.name+': '+roll.total+' vs '+difficulty+
   ', '+success+' grau(s).',unit.side,{
    roll:roll.dice,total:roll.total,difficulty,degrees:success});
  if(success){
   const damage=payload.wildfire?payload.damage*success:payload.damage;
   next=applyDamage(next,target,damage,unit.name);
   if(payload.wildfire)next=igniteWarUnit(next,target.id,unit.name,7,2);
  }
  return next;
 }
 const advanced=executeAdvancedWarOrder(battle,unit,order,{attack,applyDamage});
 if(advanced)return advanced;
 if(order.kind==='formation'){
  if(!battle.advancedFormations)throw new Error('Formações avançadas desabilitadas.');
  if(!order.formation||!formationAllowed(order.formation,unit))throw new Error('Formação indisponível à unidade.');
  return log(replaceUnit(battle,{...unit,formation:order.formation}),'formation',unit.name+' adotou '+order.formation+'.',unit.side);
 }
 if(order.kind==='turn'||order.kind==='reverse'){
  if(!battle.advancedFormations)throw new Error('Ângulo frontal desabilitado.');
  const facing=order.kind==='turn'?order.facing:
   ({north:'south',south:'north',east:'west',west:'east'} as const)[unit.facing??'north'];
  if(!facing)throw new Error('Informe a orientação.');
  return log(replaceUnit(battle,{...unit,facing}), 'facing',unit.name+' voltou-se para '+facing+'.',unit.side);
 }
 if(order.kind==='move'){
  if(!order.to)throw new Error('Movimentação exige destino.');
  return move(battle,unit,order.to,Boolean(order.sprint));
 }
 if(order.kind==='attack'){
  if(order.targetHeroId){
   const hero=battle.heroes.find(h=>h.id===order.targetHeroId);
   if(!hero)throw new Error('Selecione um herói inimigo válido.');
   return attackIndividualFromWarUnit(battle,unit,hero,Boolean(order.ranged));
  }
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo válido.');
  return attack(battle,unit,target,Boolean(order.ranged));
 }
 if(order.kind==='charge'){
  if(order.ranged)throw new Error('Carga exige Luta.');
  const target=battle.units.find(u=>u.id===order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo de carga inválido.');
  let next=battle,actor=unit;
  if(distance(actor.position,target.position)>1){
   const choices=[{x:target.position.x-1,y:target.position.y},
    {x:target.position.x+1,y:target.position.y},
    {x:target.position.x,y:target.position.y-1},{x:target.position.x,y:target.position.y+1}];
   let destination:WarPosition|null=null;
   for(const candidate of choices){
    try{movePath(battle,actor,candidate,true,movementCells(actor,true));destination=candidate;break;}catch{ /* outra posição */ }
   }
   if(!destination)throw new Error('Carga sem corredor em linha reta.');
   next=move(next,actor,destination,true);
   actor=next.units.find(u=>u.id===unit.id)!;
   if(!alive(actor))return log(next,'charge-blocked',actor.name+
    ' foi neutralizada por prontidão antes de completar a carga.',actor.side);
  }
  const guarding=next.units.find(u=>u.id===target.id)!;
  if(guarding.counterChargeReady){
   const counter=attack(next,guarding,actor,false,{counterCharge:true});
   const afterDefender=counter.units.find(u=>u.id===guarding.id)!;
   next=replaceUnit(counter,{...afterDefender,counterChargeReady:false});
   if(!alive(next.units.find(u=>u.id===actor.id)!))
    return log(next,'charge-blocked',actor.name+' não conseguiu completar a carga.',actor.side);
   actor=next.units.find(u=>u.id===actor.id)!;
  }
  return attack(next,actor,next.units.find(u=>u.id===target.id)!,false,{charge:true});
 }
 if(order.kind==='defend'){
  const roll=rollDice(battle.seed,unit.ability.agility,0,unit.condition==='disorganized'?1:0);
  return log(replaceUnit({...battle,seed:roll.nextSeed},{...unit,defendRoll:roll.total}),
   'defend',unit.name+' assumiu Defesa '+roll.total+' até o fim da rodada.',unit.side,{
    roll:roll.dice,total:roll.total,
   });
 }
 if(order.kind==='rally'){
  const health=Math.min(unit.maxHealth,unit.health+degrees);
  if(unit.condition!=='organized')throw new Error('Reagrupar não substitui Reorganizar/Reanimar.');
  return log(replaceUnit(battle,{...unit,health}), 'rally',unit.name+' recuperou '+(health-unit.health)+' de Saúde.',unit.side);
 }
 if(order.kind==='revive'){
  if(unit.condition!=='routed')throw new Error('Reanimar exige debandada.');
  return log(replaceUnit(battle,{...unit,condition:'disorganized',health:0,standing:null}),
   'revive',unit.name+' deixou de debandar; ainda precisa ser reorganizada.',unit.side);
 }
 if(order.kind==='reorganize'){
  if(unit.condition!=='disorganized')throw new Error('Reorganizar exige desorganização.');
  return log(replaceUnit(battle,{...unit,condition:'organized',health:unit.maxHealth,standing:null}),
   'reorganize',unit.name+' foi reorganizada, mantendo as penalidades de Disciplina.',unit.side);
 }
 if(order.kind==='retreat'){
  return retreatStep(battle,unit,movementCells(unit,false),false);
 }
 if(order.kind==='aggressive-retreat'){
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo de retirada agressiva.');
  const next=attack(battle,unit,target,Boolean(order.ranged),{penalty:1});
  const self=next.units.find(u=>u.id===unit.id)!;
  return retreatStep(next,self,Math.floor(movementCells(self,false)/2),false);
 }
 if(order.kind==='ready')return log(battle,'ready',unit.name+' aguardará a condição '+
  order.ready?.trigger+' para '+order.ready?.reaction+'.',unit.side);
 throw new Error('Ordem não suportada.');
}
/** Pinça (cap. 10): uma ordem consome duas parcelas distintas de Guerra.
 * Ambas as unidades devem passar seu próprio teste de comando para
 * receber +1D no ataque de Luta contra o mesmo inimigo.
 */
export function issueWarPincer(battle:WarBattle,input:{
 commanderId:string;firstUnitId:string;secondUnitId:string;
 targetId:string;firstWarfareDice:number;
}):WarOrderResult{
 if(battle.phase!=='orders'||!battle.advancedFormations)
  throw new Error('Pinça exige fase de ordens com regras avançadas.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&
  c.active&&c.side===battle.turn);
 if(!commander||(battle.ordersRemaining[commander.id]??0)<1||
  battle.heroes.some(h=>h.active&&h.commanderId===commander.id&&h.unitId))
  throw new Error('Comandante indisponível para Pinça.');
 const first=battle.units.find(u=>u.id===input.firstUnitId);
 const second=battle.units.find(u=>u.id===input.secondUnitId);
 const enemy=battle.units.find(u=>u.id===input.targetId);
 if(!first||!second||!enemy||first.id===second.id||
  first.side!==commander.side||second.side!==commander.side||
  enemy.side===commander.side||!alive(first)||!alive(second)||!alive(enemy)||
  distance(first.position,enemy.position)!==1||
  distance(second.position,enemy.position)!==1)
  throw new Error('Pinça exige dois aliados ativos adjacentes ao mesmo inimigo.');
 const n1=input.firstWarfareDice,n2=commander.warfare-n1;
 if(!Number.isInteger(n1)||n1<1||n2<1||n1>15||n2>15)
  throw new Error('Divida exatamente os dados de Guerra entre as duas unidades.');
 const dif=(u:WarUnit)=>Math.max(0,u.discipline+u.disorganizations*3+
  u.issuedThisRound*3+3+heroUnitDefenseBonus(battle,u)+
  (u.formation?WAR_FORMATIONS[u.formation].discipline:0)+
  (u.suppressionRound===battle.round?(u.suppressionPenalty??0):0));
 const d1=dif(first),d2=dif(second);
 const one=rollDice(battle.seed,n1),two=rollDice(one.nextSeed,n2);
 const passed1=one.total>=d1,passed2=two.total>=d2;
 const passed=passed1&&passed2;
 let next:WarBattle={...battle,seed:two.nextSeed,
  ordersRemaining:{...battle.ordersRemaining,
   [commander.id]:battle.ordersRemaining[commander.id]!-1},
  units:battle.units.map(u=>{
   if(u.id!==first.id&&u.id!==second.id)return u;
   return {...u,issuedThisRound:u.issuedThisRound+1,
    actedThisRound:u.actedThisRound||passed,
    criticalThisRound:u.criticalThisRound||
     (u.id===first.id?criticalFailure(one.total,d1):criticalFailure(two.total,d2)),
    ...(passed?{activated:true,standing:{kind:'attack' as const}}:{})};
  }),
 };
 next=log(next,'pincer-command',commander.name+' dividiu Guerra '+
  n1+'/'+n2+' para Pinça: '+one.total+' vs '+d1+' e '+
  two.total+' vs '+d2+(passed?' (ambos passaram).':' (manobra falhou).'),
  commander.side,{roll:[...one.dice,...two.dice],
   total:Math.min(one.total,two.total),difficulty:Math.max(d1,d2),
   degrees:passed?Math.min(degreesOfSuccess(one.total,d1),
    degreesOfSuccess(two.total,d2)):0});
 if(passed){
  // As duas rolagens veem a mesma condição e Defesa do alvo.
  // O dano individual já desconta o VA, mas só modifica Saúde após
  // ambas as rolagens: o primeiro golpe não cancela o segundo.
  const pending:{name:string;damage:number}[]=[];
  for(const id of [first.id,second.id]){
   const attacker=next.units.find(u=>u.id===id)!;
   const target=next.units.find(u=>u.id===enemy.id)!;
   if(!alive(attacker)||!alive(target))
    throw new Error('Pinça interrompida: participantes não estão mais ativos.');
   next=attack(next,attacker,target,false,{
    testRank:Math.min(15,attacker.ability.fighting+1),
    deferDamage:(damage)=>pending.push({name:attacker.name,damage}),
   });
  }
  const damage=pending.reduce((sum,p)=>sum+p.damage,0);
  const original=next.units.find(u=>u.id===enemy.id)!;
  if(damage>0)next=applyDamage(next,original,damage,
   first.name+' e '+second.name);
  next=log(next,'pincer-simultaneous',first.name+' e '+second.name+
   ' resolveram dois ataques antes de aplicar '+damage+
   ' dano total a '+enemy.name+'.',commander.side);
 }
 next=checkVictory({...next,turn:turnAfter(next,commander.side)});
 return {battle:next,passed,
  critical:criticalFailure(one.total,d1)||criticalFailure(two.total,d2),
  test:Math.min(one.total,two.total),difficulty:Math.max(d1,d2),
  degrees:passed?Math.min(degreesOfSuccess(one.total,d1),
   degreesOfSuccess(two.total,d2)):0};
}
/** Prévia da mesma Dificuldade usada na rolagem, sem consumir dados nem ordens. */
export function previewWarOrderDifficulty(
 battle:WarBattle,unit:WarUnit,order:Pick<WarOrder,'kind'|'formation'>,
):Readonly<{difficulty:number;advancedModifier:number;parts:readonly Readonly<{label:string;value:number}>[]}>{
 const formationDifficulty=battle.advancedFormations&&order.kind==='formation'&&order.formation?
  WAR_FORMATIONS[order.formation].difficulty:order.kind==='turn'&&battle.advancedFormations?3:0;
 const formationDiscipline=battle.advancedFormations&&unit.formation?
  WAR_FORMATIONS[unit.formation].discipline:0;
 const advancedBase=(WAR_ADVANCED_ORDER_DIFFICULTY as Partial<Record<WarOrder['kind'],number>>)[order.kind]??0;
 const advancedModifier=order.kind==='climb-walls'&&
  (unit.laddersDeployed||(!unit.fieldEquipmentConsumed&&
  ['ladders','siege-tower'].includes(unit.fieldEquipment??'')))?0:advancedBase;
 const suppression=unit.suppressionRound===battle.round?(unit.suppressionPenalty??0):0;
 const parts=[
  {label:'Disciplina base',value:unit.discipline},
  {label:'Herói incorporado',value:heroUnitDefenseBonus(battle,unit)},
  {label:'Desorganizações',value:unit.disorganizations*3},
  {label:'Ordens extras',value:unit.issuedThisRound*3},
  {label:'Nova formação ou giro',value:formationDifficulty},
  {label:'Disciplina da formação atual',value:formationDiscipline},
  {label:'Ordem avançada',value:advancedModifier},
  {label:'Supressão',value:suppression},
  {label:'Equipamento',value:warFieldOrderDifficulty(unit)},
 ];
 return {difficulty:Math.max(0,parts.reduce((sum,part)=>sum+part.value,0)),
  advancedModifier,parts:parts.filter(part=>part.value!==0||part.label==='Disciplina base')};
}
export function issueWarOrder(battle:WarBattle,input:{
 commanderId:string;unitId:string;order:WarOrder;
}):WarOrderResult{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active);
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Não é a vez deste comandante, ou suas ordens terminaram.');
 if(battle.heroes.some(h=>h.active&&h.commanderId===commander.id&&h.unitId))
  throw new Error('Comandante dentro de unidade não pode dar ordens.');
 const unit=battle.units.find(u=>u.id===input.unitId);
 if(!unit||unit.side!==commander.side||!onBoard(unit))throw new Error('Unidade fora do comando.');
 if(!alive(unit)&&input.order.kind!=='revive')throw new Error('Uma tropa em debandada só pode ser reanimada.');
 if(input.order.kind==='revive'&&unit.condition!=='routed')throw new Error('Esta unidade não está em debandada.');
 // Rejeitar instruções incompletas ANTES de consumir o orçamento e os dados.
 if(input.order.kind==='pincer')throw new Error('Use o comando simultâneo Pinça de duas unidades.');
 if(input.order.kind==='surrender')return issueWarSurrender(battle,{commanderId:input.commanderId});
 if(input.order.targetHeroId&&input.order.kind!=='attack')
  throw new Error('Apenas a ordem Atacar pode alvejar herói individual.');
 if(input.order.targetHeroId&&(!battle.heroes.some(h=>
  h.id===input.order.targetHeroId&&h.side!==unit.side&&h.active&&!h.unitId)))
  throw new Error('Herói adversário indisponível.');
 if(input.order.kind==='move'&&!input.order.to)throw new Error('Indique o quadrado de destino.');
 if(input.order.kind==='ready'){
  const plan=input.order.ready;
  if(!plan||!['enemy-adjacent','enemy-routed'].includes(plan.trigger)||
   !['attack','move'].includes(plan.reaction))
   throw new Error('Prontidão exige condição e reação explícitas.');
  if(plan.reaction==='move'&&(!plan.to||!inBounds(battle,plan.to)))
   throw new Error('Movimento de prontidão exige um destino válido.');
  if(plan.reaction==='attack'&&plan.ranged&&unit.range==='none')
   throw new Error('Esta unidade não tem arma de Pontaria para prontidão.');
 }
 if(input.order.kind==='formation'&&(!input.order.formation||!battle.advancedFormations))throw new Error('Formação avançada indisponível ou desabilitada.');
 if(input.order.kind==='turn'&&(!input.order.facing||!battle.advancedFormations))throw new Error('Selecione uma orientação válida.');
 if(['attack','charge','aggressive-retreat','suppress','ambush','probe','push','envelop'].includes(input.order.kind)&&input.order.targetId){
  const target=battle.units.find(u=>u.id===input.order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo inimigo indisponível.');
 }
 if(['lightning-attack','trample'].includes(input.order.kind)&&!input.order.to)
  throw new Error('Selecione destino para a manobra avançada.');
 if(input.order.kind==='scorched-earth'&&!input.order.targetDomainId?.trim())
  throw new Error('Terra Arrasada exige domínio declarado.');
 if(input.order.kind==='split-attack'&&
  (!input.order.targetIds||input.order.targetIds.length<2||
   !input.order.testRanks||input.order.testRanks.length!==input.order.targetIds.length||
   !input.order.bonusRanks||input.order.bonusRanks.length!==input.order.targetIds.length))
  throw new Error('Ataque Dividido exige múltiplos alvos e dados alocados.');
 const {difficulty,advancedModifier}=previewWarOrderDifficulty(battle,unit,input.order);
 if(advancedModifier&&!battle.advancedFormations)
  throw new Error('Esta ordem avançada exige regras avançadas habilitadas.');
 const roll=rollDice(battle.seed,commander.warfare,0,0);
 const passed=roll.total>=difficulty;
 const critical=criticalFailure(roll.total,difficulty);
 const degrees=degreesOfSuccess(roll.total,difficulty);
 let next:WarBattle={...battle,seed:roll.nextSeed,
  ordersRemaining:{...battle.ordersRemaining,[commander.id]:battle.ordersRemaining[commander.id]!-1}};
 next=replaceUnit(next,{...unit,issuedThisRound:unit.issuedThisRound+1,actedThisRound:unit.actedThisRound||passed,
  criticalThisRound:unit.criticalThisRound||critical});
 next=log(next,'command',commander.name+' deu ordem '+input.order.kind+' a '+unit.name+
  ': '+roll.total+' vs Disciplina '+difficulty+(passed?' (sucesso).':critical?' (falha crítica).':' (falha).'),
  unit.side,{roll:roll.dice,total:roll.total,difficulty,degrees});
 if(!passed&&critical&&['retreat','aggressive-retreat'].includes(input.order.kind)){
  const affected=next.units.find(u=>u.id===unit.id)!;
  if(input.order.kind==='retreat'){
   next=replaceUnit(next,{...affected,health:0,condition:'routed',standing:{kind:'retreat'},
    ...(next.advancedFormations?{formation:'mob' as const}:{})});
   next=log(next,'critical-retreat',unit.name+' entrou em debandada após falha crítica de retirada.',unit.side);
  }else{
   const disorganizations=affected.disorganizations+1;
   const destroyed=disorganizations>=affected.ability.endurance;
   next=replaceUnit(next,{...affected,disorganizations,health:0,
    condition:destroyed?'destroyed':'disorganized',standing:destroyed?null:affected.standing});
   next=log(next,'critical-aggressive-retreat',unit.name+' ficou desorganizada após falha crítica.',unit.side);
  }
 }
 if(!passed&&!critical&&['turn','reverse'].includes(input.order.kind)&&next.advancedFormations){
  const affected=next.units.find(u=>u.id===unit.id)!;
  const facing=input.order.kind==='turn'?input.order.facing:
   ({north:'south',south:'north',east:'west',west:'east'} as const)[affected.facing??'north'];
  next=replaceUnit(next,{...affected,...(facing?{facing}:{}),exposedFacingUntilRound:next.round});
  next=log(next,'turn-failure',unit.name+' virou-se, mas permanece vulnerável ao flanco nesta rodada.',unit.side);
 }
 if(passed){
  const updated=next.units.find(u=>u.id===unit.id)!;
  const revealing=['attack','charge','move','aggressive-retreat','split-attack',
   'lightning-attack','trample','envelop','pincer','hammer-anvil','suppress',
   'probe','push','ambush','fire-special','breach-gate','climb-walls','sabotage'];
  const issued={...updated,standing:{...input.order},activated:true,
   ...(revealing.includes(input.order.kind)?{hidden:false}:{})};
  // A emboscada precisa preservar o estado oculto até seu ataque especial.
  const executing=input.order.kind==='ambush'?{...issued,hidden:updated.hidden??false}:issued;
  next=replaceUnit(next,executing);
  // Instruções que não geram ação recorrente encerram a sua execução neste momento.
  try{next=perform(next,executing,input.order,degrees);}
  catch(e){throw e;}
  const latest=next.units.find(u=>u.id===unit.id)!;
  const continuous=(['attack','charge','defend','retreat','aggressive-retreat','ready','push'].includes(input.order.kind));
  next=replaceUnit(next,{...latest,standing:continuous&&onBoard(latest)?input.order:null});
 }
 next={...next,turn:turnAfter(next,commander.side)};
 next=checkVictory(next);
 return {battle:next,passed,critical,test:roll.total,difficulty,degrees};
}
/** Rendição: a ordem geral requer um teste para cada unidade ativa. */
/** Passo 5: uma ordem para disparar até Guerra máquinas, cada engenheiro com até quatro. */
/** Book phase 5. A volley can target a unit or a structural fortification.
 * Structural durability is explicitly a game-digital approximation.
 */
export function fireWarSiegeVolley(battle:WarBattle,input:{
 commanderId:string;weaponIds:readonly string[];
 targetId?:string;fortId?:string;targetHeroId?:string;
}):WarBattle{
 if(battle.phase!=='siege')throw new Error('A fase de cerco não está ativa.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active&&c.role==='commander');
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Ordem de cerco indisponível.');
 if(battle.siegeCompleted[commander.side])throw new Error('Este lado já executou a fase de cerco.');
 if(!input.weaponIds.length||new Set(input.weaponIds).size!==input.weaponIds.length||
  input.weaponIds.length>commander.warfare)throw new Error('O disparo exige até Guerra máquinas distintas.');
 if([input.targetId,input.fortId,input.targetHeroId].filter(Boolean).length!==1)
  throw new Error('Escolha exatamente um único alvo de cerco.');
 const target=input.targetId?battle.units.find(u=>
  u.id===input.targetId&&u.side!==commander.side&&onBoard(u)):undefined;
 const fort=input.fortId?battle.fortifications.find(f=>
  f.id===input.fortId&&f.side!==commander.side&&!f.breached&&
  f.structuralHealth!==0):undefined;
 const hero=input.targetHeroId?battle.heroes.find(h=>
  h.id===input.targetHeroId&&h.side!==commander.side&&h.active&&!h.unitId):undefined;
 if(!target&&!fort&&!hero)throw new Error('Alvo de cerco inimigo indisponível.');
 if(target?.hidden)
  throw new Error('Unidade escondida ainda não foi revelada para a artilharia.');
 if(hero&&(input.weaponIds.length!==1||
  battle.siege.find(w=>w.id===input.weaponIds[0])?.kind!=='scorpion'))
  throw new Error('Apenas um escorpião pode alvejar personagem.');
 const position=target?.position??fort?.cells[0]??{
  x:Math.floor(personalPosition(hero!).x/10),
  y:Math.floor(personalPosition(hero!).y/10),
 };
 for(const id of input.weaponIds){
  const weapon=battle.siege.find(w=>w.id===id&&w.side===commander.side&&w.health>0);
  if(!weapon)throw new Error('Máquina não pertence ao exército ativo.');
  const engineer=battle.units.find(u=>u.id===weapon.engineerId);
  if(!engineer||!alive(engineer)||engineer.typeId!=='engineers')
   throw new Error('Sem engenheiro disponível para a máquina.');
  if(warSiegeReloadRemaining(weapon,battle.round)>0)
   throw new Error('Máquina precisa aguardar uma rodada completa para recarregar.');
  const engineTerrain=terrainEffect(terrainAt(battle.tiles,weapon.position));
  const defenderHasFort=battle.fortifications.some(f=>f.side===weapon.side&&
   !f.breached&&f.structuralHealth!==0);
  if(engineTerrain.noSiege&&
   (weapon.side==='attacker'||!defenderHasFort))
   throw new Error('Terreno proíbe armas de cerco nesta posição.');
  if(!warSiegeTargetInRange(weapon,position))
   throw new Error('Alvo fora do alcance de cerco.');
  if(battle.strictLineOfSight&&weapon.kind==='scorpion'&&
   !canSeeWarTarget(weapon.position,position,battle.tiles))
   throw new Error('Escorpião sem linha de visão para o alvo.');
 }
 let next:WarBattle={...battle,ordersRemaining:{
  ...battle.ordersRemaining,[commander.id]:(battle.ordersRemaining[commander.id]??0)-1,
 }};
 for(const id of input.weaponIds){
  const weapon=next.siege.find(w=>w.id===id)!;
  const engineer=next.units.find(u=>u.id===weapon.engineerId)!;
  const profile=WAR_SIEGE_CATALOG[weapon.kind];
  const structuralRank:Readonly<Record<string,number>>={
   'catapult-small':5,'catapult-medium':7,'catapult-large':9,
   mangonel:10,trebuchet:12,
  };
  const rank=fort?(structuralRank[weapon.kind]??engineer.ability.warfare??2):
   engineer.ability.warfare??2;
  const roll=rollDice(next.seed,rank,0,
   hero?1:fort?0:profile.engineerPenaltyDice);
  const currentTarget=target?next.units.find(u=>u.id===target.id):undefined;
  const currentFort=fort?next.fortifications.find(f=>f.id===fort.id):undefined;
  const currentHero=hero?next.heroes.find(h=>h.id===hero.id&&h.active):undefined;
  // As máquinas de uma salva são comprometidas simultaneamente.
  // Se o primeiro disparo destruir o alvo, as demais ainda gastam o turno
  // de fogo e recarga; não são preservadas para uma salva futura gratuita.
  if((currentFort&&(currentFort.breached||currentFort.structuralHealth===0))||
   (currentTarget&&!onBoard(currentTarget))||
   (!currentTarget&&!currentFort&&!currentHero)){
   next={...next,siege:next.siege.map(w=>w.id===weapon.id?
    {...w,lastFiredRound:next.round}:w)};
   next=log(next,'siege-spent',weapon.name+
    ' já integrava a salva; o alvo foi neutralizado antes da resolução individual.',commander.side);
   continue;
  }
  const defenderFort=currentTarget?fortForUnit(next.fortifications,currentTarget):null;
  const difficulty=currentTarget?
   currentTarget.defense+(defenderFort?fortDefense(defenderFort):0):
   currentHero?currentHero.defense:
   currentFort!.structuralDifficulty??12+fortDefense(currentFort!);
  const degrees=degreesOfSuccess(roll.total,difficulty);
  const payload=warSiegeDamage(weapon);
  const damage=currentTarget?
   Math.max(0,payload.base*degrees-
    (payload.ignoresArmor?0:currentTarget.armor)):0;
  next={...next,seed:roll.nextSeed,siege:next.siege.map(w=>
   w.id===weapon.id?{...w,lastFiredRound:next.round}:w)};
  const label=currentTarget?.name??currentFort?.name??currentHero!.name;
  next=log(next,'siege',weapon.name+' disparou contra '+label+': Guerra '+
   roll.total+' vs Defesa '+difficulty+', '+degrees+' grau(s)'+
   (currentTarget?', '+damage+' dano.':'.'),commander.side,{
    roll:roll.dice,total:roll.total,difficulty,degrees});
  if(currentHero){
   const heroDamage=degrees>0?Math.max(0,10-currentHero.armor):0;
   next=log(next,'siege-hero',weapon.name+' atingiu '+currentHero.name+
    ': '+heroDamage+' dano de escorpião.',commander.side,
    {roll:roll.dice,total:roll.total,difficulty,degrees});
   if(heroDamage)next=queuePersonalDamage(next,{
    actorName:weapon.name,targetHeroId:currentHero.id,damage:heroDamage,
    source:'personal',
   });
   break;
  }
  if(currentTarget&&degrees>0){
   if(damage>0)next=applyDamage(next,currentTarget,damage,weapon.name);
   if(weapon.ammo==='wildfire')
    next=igniteWarUnit(next,currentTarget.id,weapon.name,7,2);
  }else if(currentFort&&degrees>0){
   const hit=damageWarFortification(currentFort,payload.base*degrees);
   next={...next,fortifications:next.fortifications.map(f=>
    f.id===currentFort.id?hit.fort:f)};
   next=log(next,hit.breached?'fort-breached':'fort-damage',
    weapon.name+' causou '+hit.damage+' dano estrutural em '+
    currentFort.name+(hit.breached?' (brecha aberta).':'.'),commander.side);
  }
 }
 return completeSiegeSide(next,commander.side);
}
function completeSiegeSide(battle:WarBattle,side:WarSide):WarBattle{
 const done={...battle.siegeCompleted,[side]:true};
 return {...battle,siegeCompleted:done,
  ...(done.attacker&&done.defender?{phase:(battle.heroes.length?'heroes-first':'orders') as WarBattle['phase'],turn:battle.first}:
   {turn:opposite(side)})};
}
/** A passagem voluntária da fase de cerco não consome ordem. */
export function skipWarSiege(battle:WarBattle):WarBattle{
 if(battle.phase!=='siege'||battle.siegeCompleted[battle.turn])
  throw new Error('Não há fase de cerco para pular.');
 const side=battle.turn;
 return completeSiegeSide(log(battle,'siege-skip','Sem disparos nesta fase de cerco.',side),side);
}
export function issueWarSurrender(battle:WarBattle,input:{commanderId:string}):WarOrderResult{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active&&c.role==='commander');
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Rendição exige comandante ativo e ordem disponível.');
 let next:WarBattle={...battle,ordersRemaining:{
  ...battle.ordersRemaining,[commander.id]:(battle.ordersRemaining[commander.id]??0)-1,
 }};
 const units=next.units.filter(u=>u.side===commander.side&&alive(u));
 for(const unit of units){
  const difficulty=unit.discipline+unit.disorganizations*3+unit.issuedThisRound*3;
  const roll=rollDice(next.seed,commander.warfare);
  const passed=roll.total>=difficulty;
  const updated:WarUnit=passed?{...unit,health:0,condition:'surrendered',standing:null,issuedThisRound:unit.issuedThisRound+1}:
   {...unit,health:0,condition:'routed',standing:{kind:'retreat'},
    issuedThisRound:unit.issuedThisRound+1,
    ...(next.advancedFormations?{formation:'mob' as const}:{})};
  next=replaceUnit({...next,seed:roll.nextSeed},updated);
  next=log(next,'surrender',unit.name+(passed?' rendeu-se.':' debandou ao recusar a rendição.'),
   commander.side,{roll:roll.dice,total:roll.total,difficulty,
    degrees:degreesOfSuccess(roll.total,difficulty)});
 }
 next={...next,turn:turnAfter(next,commander.side)};
 next=checkVictory(next);
 return {battle:next,passed:units.every(u=>next.units.find(v=>v.id===u.id)?.condition==='surrendered'),
  critical:false,test:0,difficulty:0,degrees:0};
}
/** Passos seis/oito: conclui a janela de cinco rodadas dos personagens. */
export function completeWarHeroPhase(battle:WarBattle):WarBattle{
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente antes de avançar.');
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('Esta não é uma fase de heróis.');
 const settled=settleWarSquadLosses(battle,(state,unit,squad)=>
  applyDamage(state,unit,1,'Baixas do esquadrão '+squad));
 const resolved=checkVictory(settled);
 if(resolved.phase==='finished')return resolved;
 if(resolved.phase==='heroes-first')
  return log({...resolved,phase:'orders',personalInitiative:undefined,heroes:resolved.heroes.map(h=>({...h,usedActions:0,minorActionsUsed:0,attackedThisTurn:false}))},
   'hero-phase','Passo seis concluído: ordens dos exércitos.',null);
 if(resolved.phase==='heroes-second'){
  const ready:WarBattle={...resolved,phase:'orders',heroSecondCompletedRound:resolved.round};
  return advanceWarRound(log(ready,'hero-phase','Passo oito concluído: ordens contínuas.',null));
 }
 throw new Error('Esta não é uma fase de heróis.');
}
export function advanceWarRound(battle:WarBattle):WarBattle{
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 if(battle.phase!=='orders')throw new Error('Batalha não está na fase de ordens.');
 if(battle.heroes.length>0&&battle.heroSecondCompletedRound!==battle.round)
  return log({...battle,phase:'heroes-second',
   heroes:battle.heroes.map(h=>({...h,usedActions:0,minorActionsUsed:0})),personalInitiative:undefined},
   'hero-phase','Passo oito: cinco rodadas individuais dos heróis.',null);
 let next=battle;
 // Passo 9: ordens permanentes somente para unidades não comandadas durante a rodada.
 for(const side of [battle.first,opposite(battle.first)]){
  for(const base of next.units.filter(u=>u.side===side&&u.activated&&u.standing&&
   !u.actedThisRound&&!u.criticalThisRound&&alive(u))){
   const order=base.standing!;
   try{
    // A lista de ordens foi obtida no início da fase: após cada ataque,
   // a unidade seguinte pode ter sido derrotada, debandado ou movido.
   // Nunca reutilizar uma ficha antiga para executar ação posterior.
   const current=next.units.find(u=>u.id===base.id);
   if(!current||!alive(current)||current.actedThisRound||current.criticalThisRound)continue;
   if(['attack','charge','aggressive-retreat'].includes(order.kind)){
     const ranged=Boolean(order.ranged);
     const target=chooseNearest(next,current,ranged);
     if(target)next=attack(next,current,target,ranged);
    }else if(order.kind==='envelop'){
     const target=current.envelopingTargetId?
      next.units.find(u=>u.id===current.envelopingTargetId):null;
     if(target&&alive(target)&&distance(current.position,target.position)===1)
      next=attack(next,current,target,false);
    }else if(order.kind==='push'){
     const target=chooseNearest(next,current,false);
     if(target){
      const pushed=executeAdvancedWarOrder(next,current,{kind:'push',targetId:target.id},
       {attack,applyDamage});
      if(pushed)next=pushed;
     }
    }else if(order.kind==='defend')next=perform(next,current,{kind:'defend'},1);
    else if(order.kind==='retreat')next=retreatStep(next,current,movementCells(current,false),false);
   }catch{
    next=log(next,'standing-skip',base.name+' não pôde executar a ordem contínua.',base.side);
   }
  }
 }
 // Uma tropa debandada corre em retirada independentemente das ordens da rodada.
 for(const unit of next.units.filter(u=>u.condition==='routed')){
  next=retreatStep(next,unit,movementCells(unit,true),true);
 }
 next=advanceWarFire(next,applyDamage);
 next=checkVictory(next);
 if(next.phase==='finished')return next;
 next={...next,round:next.round+1,
  units:next.units.map(u=>({...u,issuedThisRound:0,actedThisRound:false,
   criticalThisRound:false,defendRoll:null,counterChargeReady:false})),
  heroes:next.heroes.map(h=>({...h,usedActions:0,minorActionsUsed:0,dodgeDefense:null,attackedThisTurn:false})),
  personalInitiative:undefined,
  ordersRemaining:{
   ...commandBudget(next.commanders,'attacker'),
   ...commandBudget(next.commanders,'defender'),
  },
 };
 const readyForSiege=next.siege.length>0&&next.siege.some(s=>s.health>0);
 next={...next,
  phase:readyForSiege?'siege':next.heroes.length?'heroes-first':'orders',
  ...(readyForSiege?{siegeCompleted:{attacker:false,defender:false}}:{})};
 return sideInitiative(next);
}
export function warUnitSummary(unit:WarUnit):{
 position:string;health:string;discipline:number;condition:WarCondition;
}{
 return {position:unit.position.x+','+unit.position.y,
  health:unit.health+'/'+unit.maxHealth,discipline:unit.discipline+unit.disorganizations*3,
  condition:unit.condition};
}
