/** CRZ-1.0 · Lote 9 — somente leitura: observação e pós-ação auditada.
 * Não é um segundo redutor e não decreta vitória por objetivo.
 */
import {crzVerifyReplay,type CrzReplay} from './replay';
import {crzGridToOffset,crzHexKey,type CrzHex,type CrzSide}
 from './geometry';
import {crzCapable,type CrzBattleState} from './battle-state';

export const CRZ_TRAINING_REPORT_VERSION='CRZ-REPORT-1' as const;
export type CrzObservedObjective=Readonly<{
 id:'crossroads'|'watchpoint'|'supplies';
 title:string;position:CrzHex;holder:CrzSide|null;
}>;
const OBJECTIVES=[
 {id:'crossroads',title:'Estrada de Cormyr',row:0.5},
 {id:'watchpoint',title:'Colina de vigia',row:0.23},
 {id:'supplies',title:'Depósito de suprimentos',row:0.77},
] as const;
/** Marcos informativos determinísticos, sem alteração do tabuleiro ou regras de vitória. */
export function crzObservedObjectives(state:CrzBattleState):CrzObservedObjective[]{
 const deployment=new Set([
  ...state.map.deployment.attacker,...state.map.deployment.defender,
 ].map(crzHexKey));
 const candidates=state.map.tiles.filter(t=>t.terrain!=='rock'&&
  !deployment.has(crzHexKey(t)));
 const claimed=new Set<string>();
 return OBJECTIVES.map(spec=>{
  const targetCol=Math.floor(state.map.width/2);
  const targetRow=Math.round((state.map.height-1)*spec.row);
  const eligible=candidates.filter(t=>!claimed.has(crzHexKey(t)));
  eligible.sort((a,b)=>{
   const p=crzGridToOffset(state.map,a),q=crzGridToOffset(state.map,b);
   const score=(col:number,row:number)=>
    Math.abs(col-targetCol)*2+Math.abs(row-targetRow);
   return score(p.column,p.row)-score(q.column,q.row)||
    p.row-q.row||p.column-q.column;
  });
  const chosen=eligible[0];
  if(!chosen)throw new Error('CRZ: mapa não possui marcos de observação livres.');
  const position={q:chosen.q,r:chosen.r};
  claimed.add(crzHexKey(position));
  const occupant=state.stacks.find(s=>crzCapable(s)&&
   crzHexKey(s.position)===crzHexKey(position));
  return {id:spec.id,title:spec.title,position,holder:occupant?.side??null};
 });
}

export type CrzSideReport=Readonly<{
 side:CrzSide;initialCreatures:number;survivors:number;casualties:number;
 initialHp:number;remainingHp:number;routedStacks:number;
 inflictedDamage:number;receivedDamage:number;spellsCast:number;
}>;
export type CrzAfterActionReport=Readonly<{
 schemaVersion:1;reportVersion:typeof CRZ_TRAINING_REPORT_VERSION;
 battleId:string;rulesVersion:'CRZ-1.0';rulesetId:string;
 rulesetHash:string;seed:string;round:number;
 phase:'active'|'completed';winner:CrzSide|null;resultReason:string|null;
 replayHeadHash:string;replayCommands:number;events:number;
 sides:Readonly<Record<CrzSide,CrzSideReport>>;
 objectives:readonly CrzObservedObjective[];
}>;

/** Relatório reproduzível derivado APENAS de replay validado integralmente. */
export function crzAfterActionReport(replay:CrzReplay):CrzAfterActionReport{
 const checked=crzVerifyReplay(replay);
 if(!checked.ok)throw new Error(checked.error);
 const state=checked.state;
 const sides=Object.fromEntries((['attacker','defender'] as const).map(side=>{
  const units=state.stacks.filter(s=>s.side===side);
  const initialCreatures=units.reduce((n,s)=>n+s.initialCount,0);
  const survivors=units.reduce((n,s)=>n+s.alive,0);
  const ownIds=new Set(units.map(s=>s.id));
  const inflictedDamage=state.events.reduce((n,e)=>{
   if((e.type==='ATTACK_RESOLVED'||e.type==='RETALIATION_RESOLVED')&&
     ownIds.has(e.unitId))return n+e.appliedDamage;
   if(e.type==='SPELL_DAMAGE'&&state.leaders[side]?.id===e.leaderId)
    return n+e.amount;
   return n;
  },0);
  const receivedDamage=state.events.reduce((n,e)=>{
   if((e.type==='ATTACK_RESOLVED'||e.type==='RETALIATION_RESOLVED')&&
     ownIds.has(e.targetId))return n+e.appliedDamage;
   if(e.type==='SPELL_DAMAGE'&&ownIds.has(e.unitId))return n+e.amount;
   return n;
  },0);
  const data:CrzSideReport={
   side,initialCreatures,survivors,casualties:initialCreatures-survivors,
   initialHp:units.reduce((n,s)=>n+s.initialCount*s.hpPerCreature,0),
   remainingHp:units.reduce((n,s)=>n+s.hpPool,0),
   routedStacks:units.filter(s=>s.moraleState==='routed'&&s.alive>0).length,
   inflictedDamage,receivedDamage,
   spellsCast:state.events.filter(e=>e.type==='SPELL_CAST'&&e.side===side).length,
  };
  return [side,data] as const;
 })) as Record<CrzSide,CrzSideReport>;
 return {
  schemaVersion:1,reportVersion:CRZ_TRAINING_REPORT_VERSION,
  battleId:state.id,rulesVersion:'CRZ-1.0',
  rulesetId:state.rulesetId,rulesetHash:state.rulesetHash,
  seed:state.seed,round:state.round,phase:state.phase,
  winner:state.winner,resultReason:state.resultReason,
  replayHeadHash:checked.headHash,replayCommands:checked.commands,
  events:state.events.length,sides,
  objectives:crzObservedObjectives(state),
 };
}
/** Usa somente JSON seguro derivado do replay íntegro. */
export function crzAfterActionSerialize(replay:CrzReplay):string{
 return JSON.stringify(crzAfterActionReport(replay),null,2);
}
