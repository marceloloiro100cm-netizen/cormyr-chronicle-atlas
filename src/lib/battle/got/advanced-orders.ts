import {degreesOfSuccess,rollDice} from './dice';
import {fortDefense,fortForUnit,sabotageFortification} from './fortifications';
import type {WarBattle,WarOrder,WarUnit} from './types';

export const WAR_ADVANCED_ORDER_DIFFICULTY={
 'suppress':3,'probe':6,'counter-charge':3,'sabotage':3,'ambush':3,'join':3,
} as const;
export type WarAdvancedKind=keyof typeof WAR_ADVANCED_ORDER_DIFFICULTY;

type Helpers=Readonly<{
 attack:(battle:WarBattle,attacker:WarUnit,target:WarUnit,ranged:boolean,
  options?:{charge?:boolean;penalty?:number;counterCharge?:boolean})=>WarBattle;
}>;
const distance=(a:WarUnit['position'],b:WarUnit['position'])=>
 Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const alive=(u:WarUnit)=>u.condition==='organized'||u.condition==='disorganized';
const targetOf=(battle:WarBattle,attacker:WarUnit,order:WarOrder):WarUnit=>{
 const target=battle.units.find(u=>u.id===order.targetId);
 if(!target||target.id===attacker.id||!alive(target))
  throw new Error('Ordem avançada exige unidade-alvo válida.');
 return target;
};
const log=(battle:WarBattle,kind:string,text:string,actor:WarUnit,meta:{
 roll?:readonly number[];total?:number;difficulty?:number;degrees?:number;
}={}):WarBattle=>({...battle,events:[...battle.events,{
 seq:battle.events.length+1,round:battle.round,side:actor.side,kind,text,...meta,
}]});
const replace=(battle:WarBattle,unit:WarUnit):WarBattle=>({
 ...battle,units:battle.units.map(u=>u.id===unit.id?unit:u),
});
export function executeAdvancedWarOrder(
 battle:WarBattle,actor:WarUnit,order:WarOrder,helpers:Helpers,
):WarBattle|null{
 if(!(order.kind in WAR_ADVANCED_ORDER_DIFFICULTY))return null;
 if(!battle.advancedFormations)throw new Error('Ative as regras avançadas de Guerra.');
 if(order.kind==='probe'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||distance(actor.position,target.position)>1)
   throw new Error('Ataque exploratório exige inimigo adjacente.');
  const attacked=helpers.attack(battle,actor,target,false,{penalty:1});
  const current=attacked.units.find(u=>u.id===actor.id)!;
  return log(replace(attacked,{...current,probeDefenseRound:battle.round}),
   'probe',actor.name+' recebeu +2 Defesa até a próxima rodada.',actor);
 }
 if(order.kind==='suppress'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||actor.range==='none'||
   distance(actor.position,target.position)>(actor.range==='long'?20:2))
   throw new Error('Fogo de supressão exige Pontaria e inimigo no alcance.');
  const roll=rollDice(battle.seed,actor.ability.marksmanship,actor.rangedBonusDice??0,
   actor.condition==='disorganized'?1:0);
  const fort=fortForUnit(battle.fortifications,target);
  const difficulty=target.defense+(fort?fortDefense(fort):0);
  const degrees=degreesOfSuccess(roll.total,difficulty);
  let next:WarBattle=log({...battle,seed:roll.nextSeed},'suppress',
   actor.name+' fez fogo de supressão contra '+target.name+'.',actor,{
    roll:roll.dice,total:roll.total,difficulty,degrees});
  if(degrees>0){
   const penalized={...target,suppressionPenalty:3+degrees-1,suppressionRound:battle.round};
   next=replace(next,penalized);
   if(degrees>=2){
    // No livro, dois ou mais graus causam o mesmo dano de um ataque normal.
    // A supressão nunca ganha dano extra de um terceiro ou quarto grau.
    const damage=Math.max(0,actor.rangedDamage*2-target.armor);
    if(damage>0){
     const hp=penalized.health-damage;
     next=replace(next,{...penalized,health:Math.max(0,hp),
      ...(hp<=0?{condition:'disorganized' as const,
       disorganizations:penalized.disorganizations+1}:{})});
     next=log(next,'suppress-damage',actor.name+' causou '+damage+
      ' de dano sob supressão em '+target.name+'.',actor);
    }
   }
  }
  return next;
 }
 if(order.kind==='counter-charge'){
  return log(replace(battle,{...actor,counterChargeReady:true}), 'counter-charge',
   actor.name+' está preparada para responder à próxima carga da rodada.',actor);
 }
 if(order.kind==='ambush'){
  if(!actor.hidden||battle.round!==1)throw new Error('Emboscada exige unidade escondida na primeira rodada.');
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side)throw new Error('Emboscada exige inimigo.');
  const ranged=Boolean(order.ranged);
  const boosted={...actor,hidden:false,
   meleeDamage:actor.meleeDamage+(ranged?0:2),
   rangedDamage:actor.rangedDamage+(ranged?2:0)};
  const attacked=helpers.attack(replace(battle,boosted),boosted,target,ranged);
  const current=attacked.units.find(u=>u.id===actor.id)!;
  return replace(attacked,{...current,meleeDamage:actor.meleeDamage,rangedDamage:actor.rangedDamage});
 }
 if(order.kind==='join'){
  const target=targetOf(battle,actor,order);
  if(target.side!==actor.side||distance(target.position,actor.position)>1||
   actor.health>=actor.maxHealth||target.health>=target.maxHealth)
   throw new Error('Junção exige unidades aliadas adjacentes e ambas feridas.');
  const lost=actor.health<=target.health?actor:target;
  const survivor=lost.id===actor.id?target:actor;
  let next=replace(battle,{...lost,health:0,condition:'destroyed',standing:null});
  next=replace(next,{...survivor,health:survivor.maxHealth,condition:'organized',standing:null});
  return log(next,'join',lost.name+' foi absorvida por '+survivor.name+
   '. A unidade absorvida conta como destruída.',actor);
 }
 if(order.kind==='sabotage'){
  if(actor.typeId!=='engineers')throw new Error('Sabotagem exige uma unidade de engenheiros.');
  const fort=battle.fortifications.find(f=>f.id===order.fortId&&f.side!==actor.side);
  if(!fort||!fort.cells.some(cell=>distance(cell,actor.position)<=1))
   throw new Error('Sabotagem exige fortificação inimiga adjacente.');
  const roll=rollDice(battle.seed,actor.ability.warfare??2,0,
   actor.condition==='disorganized'?1:0);
  const degrees=degreesOfSuccess(roll.total,12);
  let next:WarBattle={...battle,seed:roll.nextSeed};
  if(degrees>0)next={...next,fortifications:next.fortifications.map(f=>
   f.id===fort.id?sabotageFortification(f,degrees):f)};
  return log(next,'sabotage',actor.name+' sabotou '+fort.name+
   ', reduzindo a Defesa em '+degrees+'.',actor,{
   roll:roll.dice,total:roll.total,difficulty:12,degrees});
 }
 return null;
}
