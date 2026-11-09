/** CRZ-1.0 · Conversor puro de fichas-modelo em pilhas de treino.
 * 03 §§3–4; 06 §6.3.5. Não substitui nem consulta HouseState.
 */
import {z} from 'zod';
import {crzHitFactorBP} from './damage';
import {crzClamp,crzMakeStack,crzSafe,type CrzStack} from './stack';
import {tableFeetToDecimetres} from '@/lib/units/metric';
import {crzDecimetresPerCell,crzRequireKnownRuleset,crzRulesetHash,type CrzPresetId,type CrzRuleset} from './ruleset';
import {crzTrainingSchema,type CrzCreature,type CrzAttackProfile} from './creatures';
import {crzGetCreature,type CrzCatalog} from './catalog';

const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const safe=z.number().int().safe();
const sourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('fictional')}).strict(),
 z.object({kind:z.literal('monster-library'),catalogHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({kind:z.literal('house-readonly'),houseId:id,unitId:id,
  version:safe.min(1)}).strict(),
]);
const modifiersSchema=z.object({
 attack:safe.min(-30).max(30).optional(),
 ac:safe.min(-30).max(30).optional(),
 hpPct:safe.min(-90).max(500).optional(),
 dmgPct:safe.min(-90).max(500).optional(),
}).strict();
export const crzStackSetupSchema=z.object({
 id,templateId:z.string().regex(/^[a-z0-9-]+\|[a-z0-9-]+$/),
 count:safe.min(1).max(1000),
 name:z.string().trim().min(1).max(120).optional(),
 training:crzTrainingSchema.optional(),
 position:z.object({q:safe,r:safe}).strict().optional(),
 modifiers:modifiersSchema.optional(),
 source:sourceSchema,
}).strict();
export type CrzStackSetup=z.infer<typeof crzStackSetupSchema>;
export const crzLeaderModifiersSchema=z.object({
 attackBonus:safe.min(-50).max(50).default(0),
 initBonus:safe.min(-50).max(50).default(0),
 moraleAura:safe.min(-100).max(100).default(0),
}).strict();
export type CrzLeaderModifiers=z.infer<typeof crzLeaderModifiersSchema>;
export const crzArmySetupSchema=z.object({
 side:z.enum(['attacker','defender']),name:z.string().trim().min(1).max(120),
 stacks:z.array(crzStackSetupSchema).min(1).max(1000),
 leaderModifiers:crzLeaderModifiersSchema.optional(),
}).strict();
export type CrzArmySetup=z.input<typeof crzArmySetupSchema>;
export type CrzAttackRoutine=Readonly<{
 origin:'multiattack'|'fallback';
 steps:readonly Readonly<{attackId:string;count:number}>[];
 expectedPerCreatureX100:number;
}>;
export type CrzPreparedStack=CrzStack&Readonly<{
 side:'attacker'|'defender';name:string;templateId:string;
 template:CrzCreature;source:CrzStackSetup['source'];
 position?:Readonly<{q:number;r:number}>;
 training:'green'|'trained'|'veteran'|'elite';
 acBase:number;atkMod:number;movementHex:number;rangeHex:number;
 initiative:number;stackValue:number;valuePerCreature:number;
 damageBonusBP:number;morale:number;moraleState:'steady';
 activation:Readonly<{moved:false;attacked:false;guard:false;waited:false;
  retaliationRound:null}>;
 effects:readonly never[];usage:Readonly<Record<string,number>>;
 meleeRoutine:CrzAttackRoutine|null;rangedRoutine:CrzAttackRoutine|null;
 warnings:readonly string[];
}>;
export type CrzPreparedArmy=Readonly<{
 side:'attacker'|'defender';name:string;
 stacks:readonly CrzPreparedStack[];
 totalValue:number;warnings:readonly string[];
}>;
/** Faixas de alcance em metros (escala de mesa): 9/24/45/90 m. */
export function crzRangeHexFromDecimetres(dm:number):number{
 crzSafe(dm,'range dm');
 if(dm<=0)throw new Error('Alcance inválido.');
 return dm<=90?2:dm<=240?3:dm<=450?4:dm<=900?5:6;
}
export const crzRangeHexFromMetres=(m:number):number=>{
 if(!Number.isFinite(m)||m<=0)throw new Error('Alcance inválido.');
 return crzRangeHexFromDecimetres(Math.ceil(m*10-1e-9));
};
/** Adaptador legado: alcance da ficha (pés) → faixa métrica. Resultado idêntico ao histórico. */
export function crzRangeHex(legacyFt:number):number{
 crzSafe(legacyFt,'range');
 if(legacyFt<=0)throw new Error('Alcance inválido.');
 return crzRangeHexFromDecimetres(tableFeetToDecimetres(legacyFt));
}
function diceAverageX100(raw:string):number{
 const match=/^([1-9][0-9]{0,2})d([1-9][0-9]{0,3})$/.exec(raw);
 if(!match)throw new Error('Dado de ataque não normalizado.');
 const count=Number(match[1]),sides=Number(match[2]);
 return crzSafe(count*(sides+1)*50,'dice average');
}
function strikeScore(attack:CrzAttackProfile,modifier:number,ruleset:CrzRuleset):number{
 if(attack.toHit===undefined)return -1;
 const chance=crzHitFactorBP(ruleset,attack.toHit+modifier,15);
 return attack.damage.reduce((total,p)=>{
  const normal=Math.floor(chance*p.avg*100/10000);
  const critical=ruleset.hit.critEnabled?
   Math.floor(ruleset.hit.critBP*diceAverageX100(p.dice)/10000):0;
  return crzSafe(total+normal+critical,'attack score');
 },0);
}
function routineFor(template:CrzCreature,kind:'melee'|'ranged',
 modifier:number,ruleset:CrzRuleset,warnings:string[]):CrzAttackRoutine|null{
 const available=template.attacks.filter(a=>a.kind===kind);
 if(!available.length)return null;
 const matching=template.multiattack.steps.map(step=>({
  step,attack:template.attacks.find(a=>a.id===step.attackId)!,
 }));
 const complete=template.multiattack.origin!=='fallback'&&matching.length>0&&
  matching.every(({attack})=>attack.kind===kind);
 if(complete){
  const expected=matching.reduce((total,{step,attack})=>
   crzSafe(total+step.count*strikeScore(attack,modifier,ruleset),'routine score'),0);
  return {origin:'multiattack',steps:matching.map(({step})=>({...step})),
   expectedPerCreatureX100:expected};
 }
 if(template.multiattack.origin!=='fallback'&&matching.some(x=>x.attack.kind===kind))
  warnings.push('Multiattack misto: rotina '+kind+' reduzida a um ataque; revisar override.');
 const ranked=[...available].sort((a,b)=>
  strikeScore(b,modifier,ruleset)-strikeScore(a,modifier,ruleset)||
  (a.id<b.id?-1:a.id>b.id?1:0));
 const best=ranked[0]!;
 return {origin:'fallback',steps:[{attackId:best.id,count:1}],
  expectedPerCreatureX100:strikeScore(best,modifier,ruleset)};
}
function genericWarnings(template:CrzCreature):string[]{
 const warnings=[...template.warnings];
 for(const trait of template.traits)
  if(trait!=='charge'&&trait!=='nimble-escape')warnings.push('Traço ainda não executável no CRZ: '+trait);
 if(template.flags.caster)warnings.push('Magias da criatura aguardam redutor de habilidades.');
 if(template.flags.legendary)warnings.push('Ações lendárias ignoradas nesta fase.');
 if(template.flags.swarm)warnings.push('Regras específicas de enxame pendentes.');
 if(template.conditionImmunities.length)
  warnings.push('Imunidades de condição aguardam sistema de efeitos.');
 if(template.attacks.some(a=>a.kind==='save'||a.kind==='area'))
  warnings.push('Ataques de salvaguarda/área aguardam redutor CRZ.');
 return [...new Set(warnings)];
}
export function crzPrepareStack(args:{
 ruleset:CrzRuleset;catalog:CrzCatalog;setup:CrzStackSetup;
 side:'attacker'|'defender';leaderModifiers?:CrzLeaderModifiers;
}):CrzPreparedStack{
 const {ruleset,catalog,side}=args;
 // Recusar configurações modificadas em jogo: hash deve ser o preset desta release.
 crzRequireKnownRuleset(ruleset.id as CrzPresetId,crzRulesetHash(ruleset));
 const setup=crzStackSetupSchema.parse(args.setup);
 if(setup.source.kind==='house-readonly')
  throw new Error('E_SETUP_SOURCE: unidades oficiais requerem adaptador autorizado.');
 if(setup.source.kind==='monster-library'&&
   setup.source.catalogHash!==catalog.catalogHash)
  throw new Error('E_SETUP_SOURCE: catálogo de origem não corresponde.');
 const template=crzGetCreature(catalog,setup.templateId);
 const training=setup.training??'trained';
 const train=ruleset.training[training];
 const leader=crzLeaderModifiersSchema.parse(args.leaderModifiers??{});
 const mods=modifiersSchema.parse(setup.modifiers??{});
 const hpPerCreature=Math.max(1,Math.floor(
  template.hp.average*(100+(mods.hpPct??0))/100));
 const base=crzMakeStack({id:setup.id,size:template.size,count:setup.count,
  hpPerCreature,ruleset});
 const movementFt=Math.max(template.speedFt.walk,
  template.flags.flying?(template.speedFt.fly??0):0);
 const movementHex=template.tags.includes('immobile')&&movementFt===0?0:
  crzClamp(Math.round(tableFeetToDecimetres(movementFt)/crzDecimetresPerCell(ruleset)),
   1,ruleset.movement.maxBudget);
 const atkMod=train.attack+(mods.attack??0)+leader.attackBonus;
 const acBase=template.ac+train.ac+(mods.ac??0);
 const initiative=crzSafe(2*movementHex+template.abilityMods.dex+
  train.initiative+leader.initBonus,'initiative');
 const ranged=template.attacks.filter(a=>a.kind==='ranged'&&a.rangeFt);
 const rangeHex=ranged.length?crzRangeHex(Math.max(
  ...ranged.map(a=>a.rangeFt!.normal))):1;
 const warnings=genericWarnings(template);
 const meleeRoutine=routineFor(template,'melee',atkMod,ruleset,warnings);
 const rangedRoutine=routineFor(template,'ranged',atkMod,ruleset,warnings);
 const stackValue=crzSafe(setup.count*template.xp,'stack value');
 const morale=crzClamp(train.morale+leader.moraleAura,-100,100);
 return {...base,side,name:setup.name??template.name,
  templateId:template.id,template,source:setup.source,
  ...(setup.position?{position:{...setup.position}}:{}),
  training,acBase,atkMod,movementHex,rangeHex,initiative,stackValue,
  valuePerCreature:template.xp,damageBonusBP:(mods.dmgPct??0)*100,
  morale,moraleState:'steady',
  activation:{moved:false,attacked:false,guard:false,waited:false,retaliationRound:null},
  effects:[],usage:{},meleeRoutine,rangedRoutine,warnings};
}
export function crzPrepareArmy(args:{
 ruleset:CrzRuleset;catalog:CrzCatalog;setup:CrzArmySetup;
}):CrzPreparedArmy{
 const setup=crzArmySetupSchema.parse(args.setup);
 if(setup.stacks.length>args.ruleset.army.maxStacks)
  throw new Error('E_SETUP_STACKS: limite de pilhas excedido.');
 const ids=new Set<string>(),positions=new Set<string>();
 for(const item of setup.stacks){
  if(ids.has(item.id))throw new Error('E_SETUP_DUP: pilha '+item.id);
  ids.add(item.id);
  if(item.position){
   const key=item.position.q+','+item.position.r;
   if(positions.has(key))throw new Error('E_SETUP_DUP: hexágono '+key);
   positions.add(key);
  }
 }
 const stacks=setup.stacks.map(item=>crzPrepareStack({
  ruleset:args.ruleset,catalog:args.catalog,setup:item,side:setup.side,
  ...(setup.leaderModifiers?{leaderModifiers:setup.leaderModifiers}:{}),
 }));
 const totalValue=stacks.reduce((total,item)=>
  crzSafe(total+item.stackValue,'army value'),0);
 return {side:setup.side,name:setup.name,stacks,totalValue,
  warnings:stacks.flatMap(stack=>
   stack.warnings.map(w=>stack.id+': '+w))};
}
