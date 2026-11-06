/** CRZ-1.0 · Lote 4.1: setup tático e estado de combate independente.
 * Fontes: 03 §§3–5, 9, 10, 12, 17. Nenhum import do redutor PTE-2.0.
 * Reutiliza APENAS geometria pública do motor Cormyr.
 */
import {z} from 'zod';
import type {BattleMap,Hex} from '../battle/domain/types';
import {assertBattleMap} from '../battle/geometry/map-validation';
import {axialToOffset,hexKey,hexDistance} from '../battle/geometry/hex';
import {tileAt} from '../battle/geometry/terrain';
import type {CrzCatalog} from './catalog';
import {crzPrepareArmy,type CrzArmySetup,type CrzPreparedStack} from './convert';
import {crzPreset,crzRequireKnownRuleset,crzRulesetHash,
 type CrzPresetId,type CrzRuleset} from './ruleset';
import {crzPcg32,type CrzRngState} from './rng';
import {crzClamp,crzSafe} from './stack';

export type CrzSide='attacker'|'defender';
export type CrzPhase='ready'|'active'|'completed';
export type CrzMoraleState='steady'|'shaken'|'routed';
export type CrzResolution='expected'|'rolled'|'hybrid';
export type CrzResultReason='elimination'|'rout'|'mutual-defeat'|
 'stalemate'|'round-limit';
export type CrzEffect=Readonly<{
 id:string;source:string;stat:'attack'|'ac'|'morale'|'movement'|'skip';
 modifier:number;remainingRounds:number;
}>;
export type CrzActivation=Readonly<{
 moved:boolean;attacked:boolean;waited:boolean;defendActive:boolean;
 retaliationRound:number|null;extraTurnUsedRound:number|null;
 movedPath:readonly Hex[];afterWait:boolean;
}>;
export type CrzBattleUnit=Omit<CrzPreparedStack,
 'position'|'activation'|'effects'|'moraleState'> & Readonly<{
 position:Hex;activation:CrzActivation;
 effects:readonly CrzEffect[];moraleState:CrzMoraleState;
}>;
export const crzLeaderSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
 name:z.string().trim().min(1).max(100),
 level:z.number().int().min(1).max(20),
 castingMod:z.number().int().min(-5).max(15),
 spells:z.array(z.enum(['bless','bane','shield_of_faith','cure_wounds'])).max(20),
}).strict();
export type CrzLeaderSetup=z.input<typeof crzLeaderSchema>;
export type CrzLeader=Readonly<{
 id:string;name:string;level:number;power:number;energyMax:number;
 energy:number;spells:readonly ('bless'|'bane'|'shield_of_faith'|'cure_wounds')[];
 castRound:number;
}>;
export type CrzEvent=Readonly<{
 seq:number;round:number;type:
  'BATTLE_STARTED'|'ACTIVATED'|'MOVED'|'ATTACKED'|'RETALIATED'|
  'WAITED'|'DEFENDED'|'ACTIVATION_ENDED'|'ROUND_ENDED'|
  'MORALE_CHANGED'|'TURN_SKIPPED'|'EXTRA_TURN_GRANTED'|
  'LEADER_CAST'|'VICTORY';
 actorId:string|null;targetId:string|null;
 data:Readonly<Record<string,string|number|boolean|null>>;
}>;
export type CrzBattleState=Readonly<{
 schemaVersion:1;rulesVersion:'CRZ-1.0';rulesetId:CrzPresetId;
 rulesetHash:string;catalogHash:string;seed:string;
 resolution:CrzResolution;map:BattleMap;
 phase:CrzPhase;round:number;
 stacks:readonly CrzBattleUnit[];
 leaders:Readonly<Record<CrzSide,CrzLeader|null>>;
 activeId:string|null;queue:readonly string[];waiting:readonly string[];
 rng:CrzRngState;events:readonly CrzEvent[];
 noProgressRounds:number;progressThisRound:boolean;
 winner:CrzSide|null;resultReason:CrzResultReason|null;
}>;
export type CrzBattleSetup=Readonly<{
 catalog:CrzCatalog;rulesetId:CrzPresetId;rulesetHash:string;
 seed:string;resolution:CrzResolution;map:BattleMap;
 attacker:CrzArmySetup;defender:CrzArmySetup;
 leaders?:Readonly<Partial<Record<CrzSide,CrzLeaderSetup>>>;
}>;
const SIDES=['attacker','defender'] as const;

export function crzBattleRules(state:CrzBattleState):CrzRuleset{
 return crzRequireKnownRuleset(state.rulesetId,state.rulesetHash);
}
export function crzAlive(unit:CrzBattleUnit):boolean{
 return unit.alive>0&&unit.moraleState!=='routed';
}
export function crzOrder(stacks:readonly CrzBattleUnit[],
 ruleset:CrzRuleset):string[]{
 return stacks.filter(crzAlive).sort((a,b)=>{
  if(b.initiative!==a.initiative)return b.initiative-a.initiative;
  if(a.side!==b.side)return a.side==='attacker'?-1:1;
  if(ruleset.initiative.tiebreak==='crz-dex'&&
   a.template.abilityMods.dex!==b.template.abilityMods.dex)
   return b.template.abilityMods.dex-a.template.abilityMods.dex;
  return a.id<b.id?-1:a.id>b.id?1:0;
 }).map(x=>x.id);
}
export function crzMoraleAfterDamage(
 unit:CrzBattleUnit,rules:CrzRuleset):CrzBattleUnit{
 if(unit.moraleState==='routed')return unit;
 if(['undead','construct','ooze'].includes(unit.template.creatureType.toLowerCase()))
  return unit;
 const loss=Math.floor(100*(unit.initialCount-unit.alive)/unit.initialCount);
 const morale=crzClamp(unit.morale+
  unit.effects.filter(e=>e.stat==='morale').reduce((s,e)=>s+e.modifier,0),-100,100);
 if(!rules.morale.routByCasualties){
  const shaken=crzClamp(40+Math.floor(morale/2),20,70);
  return {...unit,moraleState:loss>=shaken?'shaken':unit.moraleState};
 }
 const shaken=crzClamp(40+Math.floor(morale/2),20,70);
 const routed=crzClamp(70+Math.floor(morale/2),40,95);
 return {...unit,moraleState:loss>=routed?'routed':
  loss>=shaken?'shaken':unit.moraleState};
}
export function crzLog(state:CrzBattleState,type:CrzEvent['type'],
 actorId:string|null=null,targetId:string|null=null,
 data:CrzEvent['data']={}):CrzBattleState{
 const event:CrzEvent={seq:state.events.length+1,round:state.round,
  type,actorId,targetId,data};
 return {...state,events:[...state.events,event]};
}
export function crzFind(state:CrzBattleState,id:string):CrzBattleUnit{
 const unit=state.stacks.find(s=>s.id===id);
 if(!unit)throw new Error('E_COMMAND_UNIT: pilha não encontrada.');
 return unit;
}
export function crzReplace(state:CrzBattleState,unit:CrzBattleUnit):CrzBattleState{
 return {...state,stacks:state.stacks.map(s=>s.id===unit.id?unit:s)};
}
export function crzResult(state:CrzBattleState):{
 winner:CrzSide|null;reason:CrzResultReason;
}|null{
 const a=state.stacks.filter(s=>s.side==='attacker'),d=state.stacks.filter(s=>s.side==='defender');
 const aliveA=a.some(crzAlive),aliveD=d.some(crzAlive);
 if(aliveA&&aliveD)return null;
 if(!aliveA&&!aliveD)return {winner:null,reason:'mutual-defeat'};
 const lost=aliveA?d:a;
 return {winner:aliveA?'attacker':'defender',
  reason:lost.every(s=>s.alive===0)?'elimination':'rout'};
}
export function crzConclude(state:CrzBattleState,
 winner:CrzSide|null,reason:CrzResultReason):CrzBattleState{
 if(state.phase!=='active')throw new Error('Batalha já terminou.');
 return crzLog({...state,phase:'completed',winner,resultReason:reason,
  activeId:null,queue:[],waiting:[]},'VICTORY',null,null,{
  winner:winner??'draw',reason});
}
export function crzCheckVictory(state:CrzBattleState):CrzBattleState{
 if(state.phase!=='active')return state;
 const result=crzResult(state);
 return result?crzConclude(state,result.winner,result.reason):state;
}
export function crzLeaderFromSetup(raw:CrzLeaderSetup):CrzLeader{
 const data=crzLeaderSchema.parse(raw);
 const level=data.level,power=crzClamp(level+data.castingMod,1,40);
 const energyMax=10+3*level;
 return {id:data.id,name:data.name,level,power,energyMax,energy:energyMax,
  spells:[...new Set(data.spells)],castRound:0};
}
function autoPositions(map:BattleMap,side:CrzSide,stacks:readonly CrzPreparedStack[]):Hex[]{
 const midRow=(map.height-1)/2;
 const ordered=[...map.deployment[side]].sort((a,b)=>{
  const aa=axialToOffset(a),bb=axialToOffset(b);
  const front=side==='attacker'?bb.column-aa.column:aa.column-bb.column;
  return front||Math.abs(aa.row-midRow)-Math.abs(bb.row-midRow)||
   aa.row-bb.row||a.q-b.q;
 });
 const front=stacks.filter(s=>s.meleeRoutine!==null);
 const back=stacks.filter(s=>s.meleeRoutine===null);
 // O índice final é ligado ao ID para preservar estabilidade no replay.
 const priority=[...front,...back];
 const assigned=new Map<string,Hex>();
 const taken=new Set<string>();
 for(const s of priority){
  if(!s.position)continue;
  const ok=map.deployment[side].some(h=>hexKey(h)===hexKey(s.position!))&&
   tileAt(map,s.position)?.terrain!=='rock';
  if(!ok)throw new Error('E_SETUP_ZONE: implantação inválida '+s.id);
  if(taken.has(hexKey(s.position)))throw new Error('E_SETUP_DUP: hex '+hexKey(s.position));
  assigned.set(s.id,{...s.position});taken.add(hexKey(s.position));
 }
 for(const s of priority){
  if(assigned.has(s.id))continue;
  const h=ordered.find(hex=>!taken.has(hexKey(hex)));
  if(!h)throw new Error('E_SETUP_ZONE: espaço insuficiente para implantar.');
  assigned.set(s.id,{...h});taken.add(hexKey(h));
 }
 return stacks.map(s=>assigned.get(s.id)!);
}
export function crzPrepareBattle(input:CrzBattleSetup):CrzBattleState{
 const rules=crzRequireKnownRuleset(input.rulesetId,input.rulesetHash);
 // Matemática WotR e PTE-compat ainda NÃO são redutores; não fingir paridade.
 if(rules.id!=='CRZ-5E')throw new Error('E_SETUP_RULESET: redutor deste lote suporta somente CRZ-5E.');
 if(!['expected','rolled','hybrid'].includes(input.resolution))
  throw new Error('Modo de resolução inválido.');
 if(!/^[a-f0-9]{1,16}$/i.test(input.seed))
  throw new Error('E_SETUP_SEED: seed hexadecimal obrigatória, sem sorteio implícito.');
 try{assertBattleMap(input.map);}catch(e){
  throw new Error('E_SETUP_MAP: '+(e instanceof Error?e.message:'mapa inválido'));
 }
 const armies={
  attacker:crzPrepareArmy({ruleset:rules,catalog:input.catalog,setup:input.attacker}),
  defender:crzPrepareArmy({ruleset:rules,catalog:input.catalog,setup:input.defender}),
 };
 if(armies.attacker.side!=='attacker'||armies.defender.side!=='defender')
  throw new Error('E_SETUP_SOURCE: lado divergente da preparação.');
 const taken=new Set<string>(),ids=new Set<string>();
 const stacks:CrzBattleUnit[]=[];
 for(const side of SIDES){
  const prepared=armies[side].stacks;
  const coords=autoPositions(input.map,side,prepared);
  for(const [i,s] of prepared.entries()){
   if(ids.has(s.id))throw new Error('E_SETUP_DUP: ID de pilha entre exércitos.');
   ids.add(s.id);
   const position=coords[i]!,key=hexKey(position);
   if(taken.has(key))throw new Error('E_SETUP_DUP: implantação global.');
   taken.add(key);
   const {activation:_,effects:__,moraleState:___,position:____,...rest}=s;
   stacks.push({...rest,position,
    activation:{moved:false,attacked:false,waited:false,defendActive:false,
     retaliationRound:null,extraTurnUsedRound:null,movedPath:[],afterWait:false},
    effects:[],moraleState:'steady'});
  }
 }
 const leaders:Record<CrzSide,CrzLeader|null>={
  attacker:input.leaders?.attacker?crzLeaderFromSetup(input.leaders.attacker):null,
  defender:input.leaders?.defender?crzLeaderFromSetup(input.leaders.defender):null,
 };
 return {schemaVersion:1,rulesVersion:'CRZ-1.0',
  rulesetId:rules.id,rulesetHash:crzRulesetHash(rules),
  catalogHash:input.catalog.catalogHash,seed:input.seed.toLowerCase(),
  resolution:input.resolution,map:input.map,
  phase:'ready',round:0,stacks,leaders,activeId:null,
  queue:[],waiting:[],rng:crzPcg32(input.seed).state(),events:[],
  noProgressRounds:0,progressThisRound:false,winner:null,resultReason:null};
}
export function crzScore(state:CrzBattleState,side:CrzSide):number{
 const own=state.stacks.filter(s=>s.side===side);
 const total=own.reduce((n,s)=>crzSafe(n+s.initialCount*s.hpPerCreature,'initial hp'),0);
 const live=own.reduce((n,s)=>crzSafe(n+(crzAlive(s)?s.hpPool:0),'live hp'),0);
 return total?Math.floor(live*10000/total):0;
}
