import type {Side,BattleStack,BattleState} from '../domain/types';
import {livingCount,stateAfterDamage} from '../domain/morale';
import {battleOutcome} from '../domain/victory';
import {runAiUntilHuman} from '../domain/ai';
import {commander,type CommanderId} from './commanders';
import {v3CanUseCommander,v3UseCommander,type V3Game} from './engine';
import {v3CommanderPowerLimit} from './commander-progression';

/** V3.7 é uma EXTENSÃO opt-in do modo de treino. Nunca alterar replay V3.4 legado. */
export const V37_RULES_VERSION='CCA-V37-COMMAND-1' as const;
const INITIAL_ENERGY=24;
const SIGNATURE_COST=8;
export type V37Effect='guard'|'inspire'|'march'|'rally'|'weaken'|'sunder'|'heal'|'arcane';
export type V37Ability=Readonly<{
 id:string;commanderId:CommanderId;name:string;description:string;
 target:'ally'|'enemy';cost:number;cooldownRounds:number;effect:V37Effect;
}>;
export const V37_ABILITIES:readonly V37Ability[]=Object.freeze([
 {id:'tillet-formation',commanderId:'tillet',name:'Linhas de Instrução',target:'ally',cost:5,cooldownRounds:2,effect:'guard',description:'Uma unidade aliada entra em guarda com +1 de armadura.'},
 {id:'tillet-courage',commanderId:'tillet',name:'Voz do Preceptor',target:'ally',cost:4,cooldownRounds:2,effect:'rally',description:'Recupera a moral e a disciplina de uma unidade.'},
 {id:'noble-banner',commanderId:'noble',name:'Erguer Estandarte',target:'ally',cost:5,cooldownRounds:2,effect:'inspire',description:'Uma unidade aliada recebe +1 de ataque.'},
 {id:'noble-rally',commanderId:'noble',name:'Juramento da Casa',target:'ally',cost:4,cooldownRounds:2,effect:'rally',description:'Restabelece o ânimo da tropa.'},
 {id:'knight-charge',commanderId:'knight',name:'Alas à Frente',target:'ally',cost:5,cooldownRounds:2,effect:'march',description:'Uma unidade aliada recebe +1 de movimento até o fim da batalha.'},
 {id:'knight-guard',commanderId:'knight',name:'Vigília da Coroa',target:'ally',cost:5,cooldownRounds:2,effect:'guard',description:'Uma unidade aliada entra em guarda com +1 de armadura.'},
 {id:'war-mage-spark',commanderId:'war-mage',name:'Centelha de Mystra',target:'enemy',cost:8,cooldownRounds:2,effect:'arcane',description:'Dano arcano determinístico limitado a um inimigo.'},
 {id:'war-mage-sigil',commanderId:'war-mage',name:'Selo de Desgaste',target:'enemy',cost:6,cooldownRounds:2,effect:'weaken',description:'Reduz o ataque do inimigo em 1.'},
 {id:'purple-dragon-guard',commanderId:'purple-dragon',name:'Escudos Púrpuras',target:'ally',cost:5,cooldownRounds:2,effect:'guard',description:'Uma unidade aliada entra em guarda com +1 de armadura.'},
 {id:'purple-dragon-rally',commanderId:'purple-dragon',name:'Disciplina Real',target:'ally',cost:4,cooldownRounds:2,effect:'rally',description:'Recupera a moral e a organização de uma unidade.'},
 {id:'ranger-path',commanderId:'ranger',name:'Trilha Oculta',target:'ally',cost:5,cooldownRounds:2,effect:'march',description:'Amplia o movimento de uma unidade em 1.'},
 {id:'ranger-disrupt',commanderId:'ranger',name:'Alvos Marcados',target:'enemy',cost:6,cooldownRounds:2,effect:'weaken',description:'Reduz o ataque inimigo em 1.'},
 {id:'priest-mend',commanderId:'priest',name:'Bênção dos Feridos',target:'ally',cost:7,cooldownRounds:3,effect:'heal',description:'Recupera até 36 PV de combatentes vivos, sem ressuscitar.'},
 {id:'priest-faith',commanderId:'priest',name:'Fé de Helm',target:'ally',cost:4,cooldownRounds:2,effect:'rally',description:'Restabelece a coragem e a disciplina.'},
 {id:'engineer-breach',commanderId:'engineer',name:'Identificar Brecha',target:'enemy',cost:6,cooldownRounds:2,effect:'sunder',description:'Reduz em 1 a armadura da unidade inimiga.'},
 {id:'engineer-shelter',commanderId:'engineer',name:'Abrigo de Campanha',target:'ally',cost:5,cooldownRounds:2,effect:'guard',description:'Uma unidade aliada entra em guarda e ganha +1 de armadura.'},
 {id:'quartermaster-march',commanderId:'quartermaster',name:'Caravana Apressada',target:'ally',cost:5,cooldownRounds:2,effect:'march',description:'Aumenta em 1 o movimento de uma tropa.'},
 {id:'quartermaster-inspire',commanderId:'quartermaster',name:'Rações e Esperança',target:'ally',cost:5,cooldownRounds:2,effect:'inspire',description:'Melhora em 1 o ataque de uma unidade.'},
 {id:'ashkar-raider-dread',commanderId:'ashkar-raider',name:'Sombra da Fênix',target:'enemy',cost:6,cooldownRounds:2,effect:'weaken',description:'Reduz em 1 o ataque de um inimigo.'},
 {id:'ashkar-raider-assault',commanderId:'ashkar-raider',name:'Fúria das Cinzas',target:'ally',cost:5,cooldownRounds:2,effect:'inspire',description:'Concede +1 de ataque a uma unidade aliada.'},
]);
export type V37CommanderPool=Readonly<{
 energy:number;maxEnergy:number;actedRound:number;
 lastUsed:Readonly<Record<string,number>>;
}>;
export type V37Tactics=Readonly<{
 rulesVersion:typeof V37_RULES_VERSION;
 attacker:V37CommanderPool;defender:V37CommanderPool;
}>;
const newPool=():V37CommanderPool=>({
 energy:INITIAL_ENERGY,maxEnergy:INITIAL_ENERGY,actedRound:0,lastUsed:{},
});
export function v37Enable(game:V3Game):V3Game{
 if(game.mode!=='PTE-3.0-SANDBOX'||game.tactics)throw new Error('Treino V3.7 inválido ou já iniciado.');
 return {...game,tactics:{rulesVersion:V37_RULES_VERSION,attacker:newPool(),defender:newPool()}};
}
export function v37Abilities(id:CommanderId):readonly V37Ability[]{
 return V37_ABILITIES.filter(a=>a.commanderId===id);
}
function current(game:V3Game):{side:Side;active:BattleStack;pool:V37CommanderPool}{
 const state=game.battle,tactics=game.tactics;
 if(tactics?.rulesVersion!==V37_RULES_VERSION||state.phase!=='active'||!state.activeUnitId)
  throw new Error('Modo de comandos V3.7 inativo.');
 const active=state.stacks.find(s=>s.id===state.activeUnitId);
 if(!active||active.currentHp<=0||active.moraleState==='routed')
  throw new Error('Comandante sem turno aliado válido.');
 return {active,side:active.side,pool:tactics[active.side]};
}
function validateResource(game:V3Game,ability:V37Ability|undefined,signature=false){
 const {side,pool}=current(game),round=game.battle.round;
 if(!ability&&!signature)throw new Error('Estratagema desconhecido.');
 if(ability&&ability.commanderId!==game.commanders[side])
  throw new Error('Habilidade de outro comandante.');
 const cost=signature?SIGNATURE_COST:ability!.cost;
 if(pool.actedRound===round)throw new Error('O comandante já agiu nesta rodada.');
 if(pool.energy<cost)throw new Error('Energia de comando insuficiente.');
 if(ability&&round-(pool.lastUsed[ability.id]??-1000)<ability.cooldownRounds)
  throw new Error('Habilidade ainda em recarga.');
 return {side,pool,round,cost};
}
export function v37CanCast(game:V3Game,abilityId:string):boolean{
 try{validateResource(game,V37_ABILITIES.find(a=>a.id===abilityId));return true;}
 catch{return false;}
}
export function v37CanSignature(game:V3Game):boolean{
 try{validateResource(game,undefined,true);return v3CanUseCommander(game);}
 catch{return false;}
}
function spent(game:V3Game,side:Side,pool:V37CommanderPool,round:number,cost:number,
 abilityId:string):V37Tactics{
 if(!game.tactics)throw new Error('Modo V3.7 indisponível.');
 return {...game.tactics,[side]:{...pool,energy:pool.energy-cost,
  actedRound:round,lastUsed:{...pool.lastUsed,[abilityId]:round}}};
}
function withEffect(target:BattleStack,effect:V37Effect,active:BattleStack):BattleStack{
 switch(effect){
  case 'guard':return {...target,defenseGuard:true,armor:Math.min(10,target.armor+1)};
  case 'inspire':return {...target,attack:Math.min(15,target.attack+1)};
  case 'march':return {...target,movementHex:Math.min(6,target.movementHex+1)};
  case 'rally':return {...target,moraleState:'steady',defenseGuard:true};
  case 'weaken':return {...target,attack:Math.max(0,target.attack-1)};
  case 'sunder':return {...target,armor:Math.max(0,target.armor-1)};
  case 'heal':return {...target,currentHp:Math.min(
   livingCount(target)*target.hpPerSoldier,target.currentHp+36)};
  case 'arcane':return stateAfterDamage(target,Math.max(0,target.currentHp-
    Math.min(42,12+Math.floor(livingCount(active)/15))));
 }
}
export function v37Cast(game:V3Game,abilityId:string,targetId:string):V3Game{
 const ability=V37_ABILITIES.find(a=>a.id===abilityId);
 const {side,pool,round,cost,active}=(()=>({
  ...validateResource(game,ability),active:current(game).active,
 }))();
 const target=game.battle.stacks.find(s=>s.id===targetId);
 if(!target||target.currentHp<=0||target.moraleState==='routed')
  throw new Error('Alvo não está disponível.');
 if(ability!.target==='ally'&&target.side!==side||
    ability!.target==='enemy'&&target.side===side)
  throw new Error('Estratagema usado no lado incorreto.');
 const changed=withEffect(target,ability!.effect,active);
 let battle:BattleState={...game.battle,stacks:game.battle.stacks.map(s=>
  s.id===targetId?changed:s)};
 const outcome=battleOutcome(battle.stacks);
 if(outcome)battle={...battle,phase:'completed',winner:outcome.winner,
  resultReason:outcome.reason,activeUnitId:null,activationQueue:[],waitingQueue:[]};
 return {...game,battle,tactics:spent(game,side,pool,round,cost,abilityId),log:[
  ...game.log,{round,side,label:ability!.name+' · '+target.name+' (−'+cost+' energia)'},
 ].slice(-100)};
}
export function v37CastSignature(game:V3Game,targetId:string):V3Game{
 const {side,pool,round,cost}=validateResource(game,undefined,true);
 if(!v3CanUseCommander(game))throw new Error('Poder de assinatura indisponível.');
 // A regra antiga continua intocada para replays V3.4, removemos a camada
 // somente durante a chamada ao redutor legado e devolvemos a camada versionada.
 const legacy:V3Game={...game,tactics:undefined};
 const after=v3UseCommander(legacy,targetId);
 return {...after,tactics:spent(game,side,pool,round,cost,'signature'),
  log:[...after.log.slice(0,-1),
   {round,side,label:commander(game.commanders[side]).powerName+
    ' · comando de assinatura (−'+cost+' energia)'}].slice(-100)};
}
function usefulTarget(ability:V37Ability,stack:BattleStack):boolean{
 switch(ability.effect){
  case 'guard':return !stack.defenseGuard||stack.armor<10;
  case 'inspire':return stack.attack<15;
  case 'march':return stack.movementHex<6;
  case 'rally':return stack.moraleState!=='steady'||!stack.defenseGuard;
  case 'weaken':return stack.attack>0;
  case 'sunder':return stack.armor>0;
  case 'heal':return stack.currentHp<livingCount(stack)*stack.hpPerSoldier;
  case 'arcane':return stack.currentHp>0;
 }
}
export function v37RunAi(game:V3Game):V3Game{
 const {side}=current(game);
 if(game.battle.controls[side]!=='ai')return game;
 let next=game;
 if(v37CanSignature(next)){
  const leader=commander(next.commanders[side]);
  const targets=next.battle.stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
   (leader.powerTarget==='ally'?s.side===side:s.side!==side));
  for(const target of targets){
   try{next=v37CastSignature(next,target.id);break;}catch{/* alvo fora do alcance */}
  }
 }
 if(next.battle.phase==='active'&&
  next.tactics?.[side].actedRound!==next.battle.round){
  for(const ability of v37Abilities(next.commanders[side])){
   if(!v37CanCast(next,ability.id))continue;
   const candidates=next.battle.stacks
    .filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
     (ability.target==='ally'?s.side===side:s.side!==side)&&usefulTarget(ability,s))
    .sort((a,b)=>a.id.localeCompare(b.id));
   if(candidates.length){
    next=v37Cast(next,ability.id,candidates[0]!.id);
    break;
   }
  }
 }
 if(next.battle.phase==='active'){
  const result=runAiUntilHuman(next.battle);
  next={...next,battle:result.state,log:result.commands.length?[
   ...next.log,{round:next.battle.round,side,
    label:'IA executou '+result.commands.length+' ordens de tropa.'},
  ].slice(-100):next.log};
 }
 return next;
}
