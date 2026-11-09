import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {makeTacticalObjective,evaluateTacticalObjective,attackerControlledPoints,
 defaultMissionPositions,tacticalObjectiveDescription} from '@/lib/battle/domain/objectives';
import {makeFictionalStack,makeBattleSetup,validateBattleDraft} from '@/lib/battle/domain/setup';
import {startBattle,getLegalActions,applyBattleCommand} from '@/lib/battle/domain/turns';
import {chooseAiCommand} from '@/lib/battle/domain/ai';
import {captureReplay,verifyReplay,commandsFromState} from '@/lib/battle/domain/replay';
import {battleTacticalMetrics,formatSessionDuration} from '@/lib/battle/domain/metrics';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {BattleMetricsPanel} from '@/components/battle/BattleMetricsPanel';
import type {AiProfile,BattleState,Hex,TacticalObjective} from '@/lib/battle/domain/types';

afterEach(()=>cleanup());
const positions:{attacker:Hex;defender:Hex}={
 attacker:{q:0,r:0},defender:{q:10,r:0}};
function fixture(objective?:TacticalObjective,style?:AiProfile){
 const map=createScenario('bridge-crossing',11,'square');
 const attacker=makeFictionalStack({id:'a',side:'attacker',name:'A',
  typeId:'infantry',training:'trained',count:20,position:positions.attacker});
 const defender=makeFictionalStack({id:'d',side:'defender',name:'D',
  typeId:'infantry',training:'trained',count:20,position:positions.defender});
 return makeBattleSetup({id:'p3-fixture',name:'P3 fictício',seed:'p3-test',
  map,controls:{attacker:style?'ai':'human',defender:'human'},
  stacks:[attacker,defender],...(objective?{objective}:{}),
  ...(style?{aiProfiles:{attacker:style}}:{})});
}
function draft(s:BattleState){
 return {id:s.id,name:s.name,schemaVersion:s.schemaVersion,
  rulesVersion:s.rulesVersion,seed:s.seed,map:s.map,
  controls:s.controls,stacks:s.stacks,
  ...(s.objective?{objective:s.objective}:{}),
  ...(s.aiProfiles?{aiProfiles:s.aiProfiles}:{})};
}
function skipTurns(initial:BattleState,max=45){
 let s=startBattle(initial);
 for(let i=0;i<max&&s.phase==='active';i++){
  const cmd=getLegalActions(s).find(c=>c.type==='END_ACTIVATION');
  if(!cmd)throw Error('Sem ação terminal');
  const actor=s.stacks.find(u=>u.id===s.activeUnitId)!;
  s=applyBattleCommand(s,cmd,s.controls[actor.side]==='ai'?'ai':'narrator');
 }
 return s;
}

describe('P3 · ponte, portão e múltiplos objetivos',()=>{
 it('gera mapas quadrados com corredor legal e metas transitáveis distintas',()=>{
  for(const mode of ['bridge','fortress','outposts'] as const){
   const map=createScenario(mode==='bridge'?'bridge-crossing':
    mode==='fortress'?'fortress-gate':'contested-woods',11,'square');
   const mission=makeTacticalObjective(mode,map);
   expect(mission?.kind).toBe('multi-capture');
   if(mission?.kind!=='multi-capture')throw Error('expected multiple goals');
   expect(mission.positions).toHaveLength(3);
   expect(new Set(mission.positions.map(p=>p.q+','+p.r)).size).toBe(3);
   for(const p of mission.positions)
    expect(map.tiles.find(t=>t.q===p.q&&t.r===p.r)?.terrain).not.toBe('rock');
   expect(defaultMissionPositions(map,mode)).toEqual(mission.positions);
  }
 });
 it('validates duplicate points, blocked points, required quota and deadlines',()=>{
  const initial=fixture(makeTacticalObjective('bridge',createScenario('bridge-crossing'))!);
  const g=initial.objective;
  if(g?.kind!=='multi-capture')throw Error('multi');
  expect(validateBattleDraft(draft(initial)).objective).toEqual(g);
  expect(()=>validateBattleDraft({...draft(initial),objective:{...g,
   positions:[g.positions[0],g.positions[0],g.positions[2]]}})).toThrow();
  expect(()=>validateBattleDraft({...draft(initial),objective:{...g,
   requiredPositions:4}})).toThrow();
  expect(()=>validateBattleDraft({...draft(initial),objective:{...g,
   holdRounds:11,deadlineRound:10}})).toThrow();
  const rock=initial.map.tiles.find(t=>t.terrain==='rock')!;
  expect(()=>validateBattleDraft({...draft(initial),objective:{...g,
   positions:[rock,...g.positions.slice(1)]}})).toThrow();
 });
 it('counts attack-held points and two consecutive full rounds',()=>{
  const initial=fixture(makeTacticalObjective('bridge',createScenario('bridge-crossing'))!);
  const g=initial.objective;if(g?.kind!=='multi-capture')throw Error('multi');
  const started=startBattle(initial);
  const held={...started,stacks:started.stacks.map((s,i)=>i===0?{
   ...s,position:g.positions[0]!}:s),objectiveProgress:{holder:null,consecutiveRounds:0}} satisfies BattleState;
  expect(attackerControlledPoints(held)).toBe(1);
  expect(evaluateTacticalObjective(held).reason).toBeNull();
  const heldTwo={...held,stacks:[{...held.stacks[0]!,position:g.positions[0]!},
   {...held.stacks[1]!,side:'attacker' as const,position:g.positions[1]!}]};
  expect(attackerControlledPoints(heldTwo)).toBe(2);
  const a=evaluateTacticalObjective(heldTwo);
  expect(a.progress.consecutiveRounds).toBe(1);
  const b=evaluateTacticalObjective({...heldTwo,round:2,objectiveProgress:a.progress});
  expect(b.reason).toBe('objective-multi-capture');
  expect(b.winner).toBe('attacker');
  expect(tacticalObjectiveDescription({...heldTwo,objectiveProgress:a.progress})).toContain('2/2');
 });
 it('defender wins by round limit and deterministic replay verifies exact state',()=>{
  const initial=fixture(makeTacticalObjective('bridge',createScenario('bridge-crossing'))!);
  const final=skipTurns(initial);
  expect(final.phase).toBe('completed');
  expect(final.round).toBe(10);
  expect(final.winner).toBe('defender');
  expect(final.resultReason).toBe('objective-multi-defense');
  expect(verifyReplay(captureReplay(initial,commandsFromState(final))).state).toEqual(final);
 });
 it('preserves exact old-mode shape and new strategy state in replays',()=>{
  const legacy=fixture();
  expect(legacy).not.toHaveProperty('objective');
  expect(legacy).not.toHaveProperty('aiProfiles');
  const legacyReplay=captureReplay(legacy,[]);
  expect(legacyReplay.initial).not.toHaveProperty('aiProfiles');
  const scenario=fixture(makeTacticalObjective('fortress',createScenario('bridge-crossing'))!,'aggressive');
  expect(verifyReplay(captureReplay(scenario,[])).state.aiProfiles?.attacker).toBe('aggressive');
 });
});

describe('P3 · AI profiles preserve legal deterministic commands',()=>{
 it.each(['balanced','aggressive','defensive','ranged'] as const)(
  '%s chooses a legal and repeatable command',style=>{
   const initial=fixture(makeTacticalObjective('outposts',
    createScenario('bridge-crossing'))!,style);
   const state=startBattle(initial);
   expect(state.activeUnitId).toBe('a');
   const command=chooseAiCommand(state);
   expect(getLegalActions(state)).toContainEqual(command);
   expect(chooseAiCommand(state)).toEqual(command);
  });
});

describe('P3 · relative challenge and transparent session metrics',()=>{
 it('counts non-retaliation actions and formats actual elapsed time',()=>{
  const initial=fixture();
  const s=startBattle(initial);
  expect(battleTacticalMetrics(s)).toMatchObject({
   balance:'próximo',commands:0,attacks:0,movements:0});
  const cmd=getLegalActions(s).find(x=>x.type==='MOVE')!;
  const moved=applyBattleCommand(s,cmd);
  expect(battleTacticalMetrics(moved).movements).toBe(1);
  expect(battleTacticalMetrics(moved).commands).toBe(1);
  expect(formatSessionDuration(125)).toBe('2 min 5 s');
 });
 it('shows metrics only in a collapsed details, without claiming winning odds',()=>{
  const s=startBattle(fixture());
  render(<BattleMetricsPanel state={s} elapsedSeconds={67}/>);
  const trigger=screen.getByText('Indicadores de combate');
  fireEvent.click(trigger);
  expect(screen.getByText(/1 min 7 s/)).toBeInTheDocument();
  expect(screen.getByText(/não estima/)).toBeInTheDocument();
 });
 it('renders three tactical markers in a real square board',()=>{
  const map=createScenario('bridge-crossing');
  const points=defaultMissionPositions(map,'bridge');
  const {container}=render(<BattleBoard map={map} objectivePositions={points}/>);
  expect(container.querySelectorAll('.battle-goal-marker')).toHaveLength(3);
 });
});
