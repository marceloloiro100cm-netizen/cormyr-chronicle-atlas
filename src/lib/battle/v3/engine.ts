import type {BattleCommand,BattleStack,BattleState,Side} from '../domain/types';
import {makeBattleSetup,makeFictionalStack} from '../domain/setup';
import {startBattle,applyBattleCommand,getLegalActions} from '../domain/turns';
import {createScenario,type BattleScenarioId} from '../geometry/map-fixtures';
import {hexDistance,hexKey} from '../geometry/hex';
import {tileAt} from '../geometry/terrain';
import {livingCount,stateAfterDamage} from '../domain/morale';
import {battleOutcome} from '../domain/victory';
import {runAiUntilHuman} from '../domain/ai';
import {commander,applyCommanderPassive,type CommanderId} from './commanders';
import {modelHouse,type PresetUnit} from './model-houses';

export type V3PowerTarget='ally'|'enemy';
export type V3UnitSkill='CHARGE'|'VOLLEY'|'SHIELD_WALL'|'AMBUSH'|'SAPPERS';
export type V3Log=Readonly<{round:number;side:Side;label:string}>;
/** PTE-3.0-SANDBOX uses the audited PTE-2.0 mechanics as its foundation.
 * This wrapper is deliberately not a PTE-2.0 replay or a server persistence format.
 * It never accepts official HouseState and has no Supabase dependencies.
 */
export type V3Game=Readonly<{
 mode:'PTE-3.0-SANDBOX';battle:BattleState;
 commanders:Readonly<Record<Side,CommanderId>>;
 usedPowers:Readonly<Record<Side,boolean>>;
 log:readonly V3Log[];
}>;
export type V3ScenarioOptions=Readonly<{
 attackerHouseId:string;defenderHouseId:string;
 attackerCommander:CommanderId;defenderCommander:CommanderId;
 scenario:BattleScenarioId;opponent:'ai'|'human';
 /** Apenas composição fictícia do quartel, nunca snapshots de casas oficiais. */
 rosters?:Readonly<Record<Side,readonly PresetUnit[]>>;
}>;
const sideList=['attacker','defender'] as const;
const LINE=new Set(['infantry','garrison','personal-guard','crusaders','mercenaries','levies']);
export function createV3Game(options:V3ScenarioOptions):V3Game{
 const map=createScenario(options.scenario);
 const roster:BattleStack[]=[];
 for(const side of sideList){
  const house=modelHouse(side==='attacker'?options.attackerHouseId:options.defenderHouseId);
  const deployment=map.deployment[side].filter(h=>tileAt(map,h)?.terrain!=='rock')
    .sort((a,b)=>a.r-b.r||a.q-b.q);
  const taken=new Set<string>();
  const units=options.rosters?.[side]??house.units;
  if(units.length<1||units.length>5)throw new Error('É preciso escalar de 1 a 5 pilhas por exército.');
  units.forEach((unit,index)=>{
   const desired=[1,5,9,13][index]??index;
   const hex=deployment[desired]??deployment.find(h=>!taken.has(hexKey(h)));
   if(!hex||taken.has(hexKey(hex)))throw new Error('Mapa não possui espaço para o exército-modelo.');
   taken.add(hexKey(hex));
   roster.push(makeFictionalStack({
    id:side+'-'+index,side,name:unit.name,typeId:unit.typeId,
    training:unit.training,count:unit.count,position:hex,
   }));
  });
 }
 const attacker=modelHouse(options.attackerHouseId),defender=modelHouse(options.defenderHouseId);
 const draft=makeBattleSetup({
  id:'v3-'+attacker.id+'-'+defender.id+'-'+options.scenario,
  name:attacker.subtitle+' contra '+defender.subtitle,
  seed:'v3-'+options.scenario, map,
  controls:{attacker:'human',defender:options.opponent},
  stacks:roster,
 });
 const started=startBattle(draft);
 const commanders={attacker:options.attackerCommander,defender:options.defenderCommander};
 const stacks=started.stacks.map(s=>applyCommanderPassive(s,commanders[s.side]));
 return {mode:'PTE-3.0-SANDBOX',battle:{...started,stacks},
  commanders,usedPowers:{attacker:false,defender:false},log:[]};
}
function append(game:V3Game,side:Side,label:string,battle=game.battle):V3Game{
 return {...game,battle,log:[...game.log,{round:game.battle.round,side,label}].slice(-100)};
}
export function v3LegalSkills(game:V3Game):readonly V3UnitSkill[]{
 const state=game.battle,id=state.activeUnitId;
 if(state.phase!=='active'||!id)return [];
 const actor=state.stacks.find(s=>s.id===id)!;
 const legal=getLegalActions(state);
 const attacks=legal.some(c=>c.type==='ATTACK');
 const skills:V3UnitSkill[]=[];
 if(['cavalry','raiders'].includes(actor.primaryTypeId)&&actor.movedThisActivation&&attacks)
  skills.push('CHARGE');
 if(['archers','scouts','guerrillas'].includes(actor.primaryTypeId)&&
    !actor.attackedThisActivation&&legal.some(c=>c.type==='ATTACK'&&
      hexDistance(actor.position,state.stacks.find(s=>s.id===c.targetId)!.position)>1))
  skills.push('VOLLEY');
 if(LINE.has(actor.primaryTypeId)&&legal.some(c=>c.type==='DEFEND'))
  skills.push('SHIELD_WALL');
 if(['scouts','guerrillas','raiders'].includes(actor.primaryTypeId)&&attacks&&
   ['forest','hill'].includes(tileAt(state.map,actor.position)?.terrain??''))
  skills.push('AMBUSH');
 if(actor.primaryTypeId==='engineers'&&attacks)skills.push('SAPPERS');
 return skills;
}
export function v3SkillName(skill:V3UnitSkill):string{
 return {CHARGE:'Investida',VOLLEY:'Salva Coordenada',
  SHIELD_WALL:'Muralha de Escudos',AMBUSH:'Emboscada',SAPPERS:'Desmantelar Armadura'}[skill];
}
export function v3PlayCommand(game:V3Game,cmd:BattleCommand,actor:'narrator'|'ai'='narrator'):V3Game{
 const side=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)?.side??'attacker';
 const battle=applyBattleCommand(game.battle,cmd,actor);
 return append(game,side,cmd.type==='ATTACK'?'Ataque ordinário':cmd.type==='MOVE'?'Marcha':cmd.type==='DEFEND'?'Defesa':cmd.type==='WAIT'?'Esperar':cmd.type==='MANUAL_FINISH'?'Encerramento':'Fim da ativação',battle);
}
export function v3UseUnitSkill(game:V3Game,skill:V3UnitSkill,targetId?:string):V3Game{
 if(!v3LegalSkills(game).includes(skill))throw new Error('Habilidade militar indisponível nesta ativação.');
 const battle=game.battle,active=battle.stacks.find(s=>s.id===battle.activeUnitId)!;
 if(skill==='SHIELD_WALL'){
  const defended=applyBattleCommand(battle,{type:'DEFEND',unitId:active.id});
  const stacks=defended.stacks.map(s=>s.side===active.side&&s.currentHp>0&&
    hexDistance(s.position,active.position)<=1?{...s,defenseGuard:true}:s);
  return append(game,active.side,'Muralha de Escudos', {...defended,stacks});
 }
 if(!targetId)throw new Error('Selecione um alvo inimigo para a habilidade.');
 const valid=getLegalActions(battle).some(c=>c.type==='ATTACK'&&c.targetId===targetId);
 if(!valid)throw new Error('Alvo fora do alcance ou sem linha de visão.');
 const target=battle.stacks.find(s=>s.id===targetId);
 if(!target||target.side===active.side)throw new Error('Alvo não é inimigo.');
 const boost=skill==='CHARGE'?{attack:Math.min(15,active.attack+3)}:
   skill==='VOLLEY'?{damagePerSoldier:active.damagePerSoldier+1}:
   skill==='AMBUSH'?{attack:Math.min(15,active.attack+2)}:{};
 const changed=battle.stacks.map(s=>s.id===active.id?{...s,...boost}:
  skill==='SAPPERS'&&s.id===targetId?{...s,armor:Math.max(0,s.armor-2)}:s);
 const result=applyBattleCommand({...battle,stacks:changed},
  {type:'ATTACK',unitId:active.id,targetId});
 // Bonuses apply to this one attack only; reduction of armor from sappers persists.
 const restored=result.stacks.map(s=>s.id===active.id?{...s,attack:active.attack,
  damagePerSoldier:active.damagePerSoldier}:s);
 return append(game,active.side,v3SkillName(skill)+' · '+target.name,{...result,stacks:restored});
}
export function v3CanUseCommander(game:V3Game):boolean{
 const b=game.battle,active=b.stacks.find(s=>s.id===b.activeUnitId);
 return b.phase==='active'&&Boolean(active)&&!game.usedPowers[active!.side];
}
export function v3UseCommander(game:V3Game,targetId:string):V3Game{
 if(!v3CanUseCommander(game))throw new Error('O comandante já utilizou seu poder ou a batalha terminou.');
 const battle=game.battle,acting=battle.stacks.find(s=>s.id===battle.activeUnitId)!;
 const side=acting.side,c=commander(game.commanders[side]);
 const target=battle.stacks.find(s=>s.id===targetId);
 if(!target||target.currentHp<=0||target.moraleState==='routed')
  throw new Error('Selecione um agrupamento ativo para o poder.');
 if(c.powerTarget==='ally'&&target.side!==side||c.powerTarget==='enemy'&&target.side===side)
  throw new Error('O poder foi usado em um lado inválido.');
 if(c.power==='arcane-lance'&&hexDistance(acting.position,target.position)>4)
  throw new Error('O feitiço exige alcance de até 4 hexágonos.');
 let changed:BattleStack=target;
 switch(c.power){
  case 'rally':changed={...target,moraleState:'steady',defenseGuard:true};break;
  case 'blessing':changed={...target,damagePerSoldier:Math.min(15,target.damagePerSoldier+1)};break;
  case 'mounted-order':changed={...target,attack:Math.min(15,target.attack+2)};break;
  case 'arcane-lance':{
   const damage=Math.max(12,Math.floor(livingCount(acting)*0.35));
   changed=stateAfterDamage(target,Math.max(0,target.currentHp-damage));break;
  }
  case 'shield-drill':changed={...target,armor:Math.min(10,target.armor+2),defenseGuard:true};break;
  case 'smoke':changed={...target,rangeHex:Math.max(1,target.rangeHex-1)};break;
  case 'field-medicine':{
   const maxWithoutRevive=livingCount(target)*target.hpPerSoldier;
   changed={...target,currentHp:Math.min(maxWithoutRevive,target.currentHp+60)};break;
  }
  case 'sabotage':changed={...target,armor:Math.max(0,target.armor-2)};break;
  case 'supplies':changed={...target,movementHex:Math.min(6,target.movementHex+2),moraleState:'steady'};break;
  case 'dread':changed={...target,moraleState:'shaken'};break;
 }
 let next:BattleState={...battle,stacks:battle.stacks.map(s=>s.id===target.id?changed:s)};
 const outcome=battleOutcome(next.stacks);
 if(outcome)next={...next,phase:'completed',winner:outcome.winner,
   resultReason:outcome.reason,activeUnitId:null,activationQueue:[],waitingQueue:[]};
 return {...append(game,side,c.powerName+' em '+target.name,next),
  usedPowers:{...game.usedPowers,[side]:true}};
}
export function v3RunAi(game:V3Game):V3Game{
 const battle=game.battle;
 if(battle.phase!=='active'||!battle.activeUnitId)return game;
 const active=battle.stacks.find(s=>s.id===battle.activeUnitId);
 if(!active||battle.controls[active.side]!=='ai')return game;
 let next=game;
 if(v3CanUseCommander(next)){
  const c=commander(next.commanders[active.side]);
  const targets=next.battle.stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
   (c.powerTarget==='ally'?s.side===active.side:s.side!==active.side)&&
   (c.power!=='arcane-lance'||hexDistance(active.position,s.position)<=4));
  if(targets.length)next=v3UseCommander(next,targets[0]!.id);
 }
 if(next.battle.phase==='active'){
  const result=runAiUntilHuman(next.battle);
  next={...next,battle:result.state};
  if(result.commands.length)next=append(next,active.side,
    'IA executou '+result.commands.length+' comandos.');
 }
 return next;
}
