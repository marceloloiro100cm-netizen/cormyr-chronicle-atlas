import {degreesOfSuccess} from './dice';
import {executePersonalWarAction} from './personal-combat';
import type {PersonalWarAction} from './personal-combat';
import type {WarPersonalWeapon} from './personal-weapons';
import type {WarPersonalMount} from './personal-mounts';
import {assertPersonalTurn,settlePersonalTurn} from './personal-initiative';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import type {WarBattle,WarPosition,WarSide,WarUnit} from './types';

/** Capítulo 10, passos 6 e 8: uma fase corresponde a cinco rodadas individuais.
 * O combate completo entre personagens deve ser resolvido pelo capítulo 9.
 */
export type WarHero=Readonly<{
 id:string;name:string;side:WarSide;position:WarPosition;unitId:string|null;
 role:'hero'|'commander'|'subcommander';commanderId?:string;
 warfare:number;status:number;fighting:number;marksmanship:number;
 defense:number;armor:number;meleeDamage:number;rangedDamage:number;
 health:number;maxHealth:number;active:boolean;usedActions:number;
 lockedUntilRound:number|null;
 // Campos da escala pessoal: um quadrado da guerra contém 10 × 10 posições de 1 m.
 personalPosition?:WarPosition;
 agility?:number;athletics?:number;awareness?:number;endurance?:number;
 animalHandling?:number;
 runningBonusDice?:number;quicknessBonusDice?:number;meleeBonusDice?:number;rangedBonusDice?:number;
 shieldBonusDice?:number;defensiveBonus?:number;armorPenalty?:number;bulk?:number;
 rangedRange?:'none'|'short'|'long';
 wounds?:number;injuries?:number;passBonusDice?:number;
 dodgeDefense?:number|null;minorActionsUsed?:number;surrendered?:boolean;
 defeatOutcome?:'death'|'unconscious'|'captured'|'escaped'|undefined;
 attackedThisTurn?:boolean;
 aimBonusDice?:number; cautiousDefenseBonus?:number; recklessDefensePenalty?:number;
 fateAvailable?:number;fateSpent?:number;fateBurned?:number;
 fateBonusDice?:number;fatePenaltyReduction?:number;removedFromStory?:boolean;
 squadId?:string;meleeWeapon?:WarPersonalWeapon;rangedWeapon?:WarPersonalWeapon;
 rangedLoaded?:boolean;
 mount?:WarPersonalMount;mounted?:boolean;mountControlledTurn?:number|undefined;
 mountMovedTurn?:number;
 pinnedByMount?:boolean;prone?:boolean;
 counterattackReady?:Readonly<{ranged:boolean;vsCharge:boolean}>|undefined;
}>;
export type WarHeroAction=Readonly<{
 kind:'join'|'leave'|'rally'|'revive'|'abdicate'|'assume'|PersonalWarAction['kind'];
 unitId?:string;targetHeroId?:string;toMetres?:WarPosition;ranged?:boolean;vsCharge?:boolean;
 escapeUsing?:'agility'|'athletics';
}>;
const distance=(a:WarPosition,b:WarPosition)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const log=(battle:WarBattle,kind:string,text:string,side:WarSide,meta:{
 roll?:readonly number[];total?:number;difficulty?:number;degrees?:number;
}={}):WarBattle=>({...battle,events:[...battle.events,{
 seq:battle.events.length+1,round:battle.round,side,kind,text,...meta,
}]});
function replace(battle:WarBattle,hero:WarHero):WarBattle{
 return {...battle,heroes:battle.heroes.map(h=>h.id===hero.id?hero:h)};
}
const alive=(unit:WarUnit)=>unit.condition==='organized'||unit.condition==='disorganized';
export function makeModelWarHero(input:{
 id:string;name:string;side:WarSide;position:WarPosition;role?:WarHero['role'];
 commanderId?:string;
}):WarHero{
 if(!input.id.trim()||!input.name.trim())throw new Error('Identificação de herói inválida.');
 return {id:input.id,name:input.name,side:input.side,position:{...input.position},
  unitId:null,role:input.role??'hero',
  ...(input.commanderId?{commanderId:input.commanderId}:{}),
  warfare:3,status:3,fighting:3,marksmanship:3,defense:8,armor:3,
  meleeDamage:3,rangedDamage:2,health:9,maxHealth:9,
  agility:3,athletics:3,awareness:3,endurance:3,animalHandling:3,armorPenalty:0,bulk:0,
  runningBonusDice:0,quicknessBonusDice:0,meleeBonusDice:0,rangedBonusDice:0,rangedRange:'long',
  wounds:0,injuries:0,minorActionsUsed:0,surrendered:false,
  fateAvailable:2,fateSpent:0,fateBurned:0,
  personalPosition:{x:input.position.x*10+5,y:input.position.y*10+5},
  active:true,usedActions:0,lockedUntilRound:null};
}
export function validateWarHeroes(
 heroes:readonly WarHero[],units:readonly WarUnit[],width:number,height:number,
):void{
 const ids=new Set([...units.map(u=>u.id)]);
 for(const hero of heroes){
  if(ids.has(hero.id)||!hero.id.trim()||!hero.name.trim()||hero.health<0||
   hero.health>hero.maxHealth||hero.usedActions<0||hero.usedActions>5||
   hero.position.x<0||hero.position.x>=width||hero.position.y<0||hero.position.y>=height)
   throw new Error('Herói ou posição inválidos.');
  ids.add(hero.id);
  if(hero.minorActionsUsed!==undefined&&![0,1].includes(hero.minorActionsUsed))
   throw new Error('Orçamento de ações menores inválido.');
  if(hero.personalPosition&&(
   !Number.isInteger(hero.personalPosition.x)||!Number.isInteger(hero.personalPosition.y)||
   hero.personalPosition.x<0||hero.personalPosition.y<0||
   hero.personalPosition.x>=width*10||hero.personalPosition.y>=height*10||
   Math.floor(hero.personalPosition.x/10)!==hero.position.x||
   Math.floor(hero.personalPosition.y/10)!==hero.position.y))
   throw new Error('Posição pessoal deve corresponder ao quadrado de guerra.');
  if(hero.unitId&&!units.some(u=>u.id===hero.unitId&&u.side===hero.side))
   throw new Error('Herói associado a unidade de outro exército.');
 }
}
export function heroUnitDefenseBonus(battle:WarBattle,unit:WarUnit):number{
 return battle.heroes.some(h=>h.active&&h.unitId===unit.id&&h.side===unit.side)?-3:0;
}
export function heroUnitBonusDice(battle:WarBattle,unit:WarUnit):number{
 return battle.heroes.some(h=>h.active&&h.unitId===unit.id&&h.side===unit.side)?1:0;
}
export function applyDamageToEmbeddedHeroes(battle:WarBattle,
 unitBefore:WarUnit,unitAfter:WarUnit,damage:number):WarBattle{
 const conditionChanged=unitBefore.condition!==unitAfter.condition;
 const injury=unitAfter.condition==='destroyed'?10:unitAfter.condition==='routed'?5:
  unitAfter.condition==='disorganized'&&conditionChanged?2:damage>0?1:0;
 if(!injury)return battle;
 const injured=battle.heroes.filter(h=>h.active&&h.unitId===unitBefore.id);
 if(!injured.length)return battle;
 const ids=new Set(injured.filter(h=>h.health<=injury).map(h=>h.id));
 const next={...battle,heroes:battle.heroes.map(h=>{
  if(!h.active||h.unitId!==unitBefore.id)return h;
  const health=Math.max(0,h.health-injury);
  return {...h,health,active:health>0,unitId:health>0?h.unitId:null};
 }),commanders:battle.commanders.map(c=>
  injured.some(h=>ids.has(h.id)&&h.commanderId===c.id)?{...c,active:false}:c)};
 return log(next,'hero-injury',injured.map(h=>h.name).join(', ')+
  ' sofreu '+injury+' de dano ignorando VA devido ao estado da unidade.',unitBefore.side);
}
export function executeWarHeroAction(
 battle:WarBattle,input:{heroId:string;action:WarHeroAction},
):WarBattle{
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('As ações de heróis só ocorrem nos passos 6 e 8.');
 const hero=battle.heroes.find(h=>h.id===input.heroId);
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 if(!hero||!hero.active||hero.usedActions>=5||hero.lockedUntilRound===battle.round)
  throw new Error('Este herói não tem ações individuais disponíveis.');
 assertPersonalTurn(battle,hero.id);
 const finish=(next:WarBattle)=>settlePersonalTurn(battle,next,hero.id);
 const action=input.action;
 if(action.kind.startsWith('personal-'))
  return finish(executePersonalWarAction(battle,hero,action as PersonalWarAction));
 if(hero.role!=='hero'&&action.kind!=='abdicate')
  throw new Error('Comandantes ativos devem abdicar antes de realizar ações individuais.');
 if(hero.unitId&&action.kind!=='leave')
  throw new Error('Um herói dentro de uma unidade só pode sair na segunda fase.');
 const used={...hero,usedActions:hero.usedActions+1};
 if(action.kind==='join'){
  const unit=battle.units.find(u=>u.id===action.unitId);
  if(!unit||unit.side!==hero.side||!alive(unit)||distance(hero.position,unit.position)>1)
   throw new Error('Entrar exige unidade aliada adjacente e organizada.');
  return finish(log(replace(battle,{...used,position:unit.position,unitId:unit.id,usedActions:5}),
   'hero-join',hero.name+' entrou na unidade '+unit.name+
    ' (Disciplina −3, +1D em Luta e Pontaria, sem acúmulo).',hero.side));
 }
 if(action.kind==='leave'){
  if(battle.phase!=='heroes-second'||!hero.unitId)
   throw new Error('Sair de unidade ocorre no segundo passo de ações.');
  return finish(log(replace(battle,{...used,unitId:null,usedActions:5,
   lockedUntilRound:battle.round}),'hero-leave',
   hero.name+' deixou sua unidade; não poderá agir até a próxima rodada de batalha.',hero.side));
 }
 if(action.kind==='rally'||action.kind==='revive'){
  const unit=battle.units.find(u=>u.id===action.unitId&&u.side===hero.side);
  if(!unit||!(action.kind==='rally'?unit.condition==='disorganized':unit.condition==='routed'))
   throw new Error('Escolha uma unidade aliada na condição adequada.');
  if(distance(hero.position,unit.position)>1)
   throw new Error('Reorganizar/Reanimar exige proximidade da unidade.');
  const difficulty=unit.discipline+unit.disorganizations*3;
  const roll=rollPersonalWithFate(battle.seed,hero,hero.warfare);
  const passed=roll.total>=difficulty;
  let next=replace({...battle,seed:roll.nextSeed},consumePersonalFateRoll(used));
  if(passed)next={...next,units:next.units.map(u=>u.id===unit.id?({
   ...u,condition:action.kind==='rally'?'organized' as const:'disorganized' as const,
   health:action.kind==='rally'?u.maxHealth:0,
  }):u)};
  return finish(log(next,'hero-'+action.kind,hero.name+(passed?' recuperou ':' falhou em recuperar ')+
   unit.name+'.',hero.side,{roll:roll.dice,total:roll.total,difficulty,
    degrees:degreesOfSuccess(roll.total,difficulty)}));
 }
 if(action.kind==='abdicate'){
  const commander=battle.commanders.find(c=>c.id===hero.commanderId&&c.active&&
   c.side===hero.side);
  if(!commander)throw new Error('O herói não exerce comando ativo.');
  const successor=battle.commanders.filter(c=>c.side===hero.side&&c.active&&
   c.role==='subcommander').sort((a,b)=>b.status-a.status)[0];
  if(!successor)throw new Error('Abdicar exige subcomandante capaz de assumir o exército.');
  const {commanderId:_formerCommander,...released}=used;
  const next=replace(battle,{...released,role:'hero'});
  return finish(log({...next,commanders:next.commanders.map(c=>
   c.id===commander.id?{...c,active:false}:c.id===successor.id?{...c,role:'commander'}:c),
   ordersRemaining:{...next.ordersRemaining,[commander.id]:0,
    [successor.id]:successor.warfare},
  },'hero-abdicate',hero.name+' abdicou; '+successor.name+' assumiu o comando.',hero.side));
 }
 if(action.kind==='assume'){
  if(battle.commanders.some(c=>c.side===hero.side&&c.role==='commander'&&c.active))
   throw new Error('Há um comandante ativo. Não é necessário substituí-lo.');
  const newCommander={id:'hero-command-'+hero.id,name:hero.name,side:hero.side,
   role:'commander' as const,warfare:hero.warfare,status:hero.status,strategy:0,active:true};
  const next=replace(battle,{...used,role:'commander',commanderId:newCommander.id,
   usedActions:5});
  return finish(log({...next,commanders:[...next.commanders,newCommander],
   ordersRemaining:{...next.ordersRemaining,[newCommander.id]:hero.warfare}},
  'hero-assume',hero.name+' assumiu o comando do exército.',hero.side));
 }
 throw new Error('Ação de herói não suportada.');
}
