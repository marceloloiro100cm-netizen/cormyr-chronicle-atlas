import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {gridDistance} from '@/lib/battle/geometry/grid';
import {makeFictionalStack,makeBattleSetup,validateBattleDraft} from '@/lib/battle/domain/setup';
import {startBattle,applyBattleCommand,getLegalActions} from '@/lib/battle/domain/turns';
import {captureReplay,verifyReplay,commandsFromState} from '@/lib/battle/domain/replay';
import {chooseAiCommand} from '@/lib/battle/domain/ai';
import {evaluateTacticalObjective,makeTacticalObjective} from '@/lib/battle/domain/objectives';
import {BattleFirstBattleGuide,BATTLE_FIRST_GUIDE_KEY} from '@/components/battle/BattleFirstBattleGuide';
import type {BattleState,TacticalObjective} from '@/lib/battle/domain/types';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});

function fixture(objective?:TacticalObjective,aiSide:'none'|'attacker'|'defender'='none'){
 const map=createScenario('plain-open',11,'square');
 const attacker=makeFictionalStack({id:'a',side:'attacker',name:'Guarda atacante',
  typeId:'infantry',training:'trained',count:20,position:map.deployment.attacker[0]!});
 const defender=makeFictionalStack({id:'d',side:'defender',name:'Guarda defensor',
  typeId:'infantry',training:'trained',count:20,position:map.deployment.defender[0]!});
 const initial=makeBattleSetup({id:'p2-fixture',name:'Objetivo sintético',seed:'v4-fixture',
  map,controls:{attacker:aiSide==='attacker'?'ai':'human',
   defender:aiSide==='defender'?'ai':'human'},stacks:[attacker,defender],
  ...(objective?{objective}:{})});
 return {map,initial};
}

function runRounds(initial:BattleState,maxActions=150){
 let s=startBattle(initial);
 for(let i=0;i<maxActions&&s.phase==='active';i++){
  const action=getLegalActions(s).find(a=>a.type==='END_ACTIVATION');
  if(!action)throw Error('No end-turn action.');
  s=applyBattleCommand(s,action,s.controls[
   s.stacks.find(x=>x.id===s.activeUnitId)!.side]==='ai'?'ai':'narrator');
 }
 return s;
}

describe('P2 — objetivos reais, resolvidos no motor Adaptado',()=>{
 it('mantém eliminação como padrão sem modificar formatos legados',()=>{
  const {initial}=fixture();
  expect(makeTacticalObjective('elimination',initial.map)).toBeUndefined();
  expect(initial.objective).toBeUndefined();
  expect(startBattle(initial).objectiveProgress).toBeUndefined();
 });
 it('valida ponto transitável perto do centro e prazo de captura',()=>{
  const map=createScenario('narrow-passage',11,'square');
  const goal=makeTacticalObjective('capture',map);
  expect(goal?.kind).toBe('capture');
  if(goal?.kind!=='capture')throw Error('Expected capture.');
  expect(map.tiles.find(t=>t.q===goal.position.q&&t.r===goal.position.r)?.terrain).not.toBe('rock');
  const {initial}=fixture(goal);
  expect(validateBattleDraft({
   id:initial.id,name:initial.name,schemaVersion:2,rulesVersion:'PTE-2.0',
   seed:initial.seed,map:initial.map,controls:initial.controls,stacks:initial.stacks,
   objective:initial.objective,
  }).objective).toEqual(goal);
 });
 it('concede vitória ao defensor ao fim de 6 rodadas mesmo sem dano',()=>{
  const {initial}=fixture({kind:'survive',defenderRounds:6});
  const last=runRounds(initial);
  expect(last.phase).toBe('completed');
  expect(last.round).toBe(6);
  expect(last.winner).toBe('defender');
  expect(last.resultReason).toBe('objective-survive');
  const verified=verifyReplay(captureReplay(initial,commandsFromState(last)));
  expect(verified.state).toEqual(last);
 });
 it('não produz empate por inatividade antes de prazo de defesa',()=>{
  const goal: TacticalObjective={kind:'capture',position:{q:5,r:4},
   holdRounds:2,deadlineRound:8};
  const {initial}=fixture(goal);
  const last=runRounds(initial);
  expect(last.phase).toBe('completed');
  expect(last.winner).toBe('defender');
  expect(last.round).toBe(8);
  expect(last.resultReason).toBe('objective-defense');
  expect(verifyReplay(captureReplay(initial,commandsFromState(last))).state).toEqual(last);
 });
 it('exige duas rodadas completas consecutivas de ocupação',()=>{
  const goal:TacticalObjective={kind:'capture',position:{q:5,r:4},holdRounds:2,deadlineRound:8};
  const {initial}=fixture(goal);
  const active=startBattle(initial);
  const occupied={...active,stacks:active.stacks.map(x=>x.id==='a'?
   {...x,position:goal.position}:x)} satisfies BattleState;
  const first=evaluateTacticalObjective(occupied);
  expect(first.progress).toMatchObject({holder:'attacker',consecutiveRounds:1});
  expect(first.reason).toBeNull();
  const second=evaluateTacticalObjective({...occupied,round:2,objectiveProgress:first.progress});
  expect(second.reason).toBe('objective-capture');
  expect(second.winner).toBe('attacker');
 });
 it('rejeita um ponto de captura bloqueado por rocha',()=>{
  const map=createScenario('border-hills',11,'square');
  const rock=map.tiles.find(t=>t.terrain==='rock')!;
  const {initial}=fixture({kind:'capture',position:{q:rock.q,r:rock.r},
   holdRounds:2,deadlineRound:8});
  // O snapshot do fixture usa mapa aberto; o alvo válido só é rejeitado
  // quando pertence ao mapa que contém a rocha.
  expect(()=>validateBattleDraft({...initial,map,
   stacks:initial.stacks,objective:{kind:'capture',
    position:{q:rock.q,r:rock.r},holdRounds:2,deadlineRound:8}})).toThrow();
 });
});

describe('P2 — IA determinística orientada a terreno e objetivo',()=>{
 it('aproxima atacante do ponto de captura com comando legal',()=>{
  const {initial}=fixture({kind:'capture',position:{q:5,r:4},holdRounds:2,deadlineRound:8},
   'attacker');
  const state=startBattle(initial);
  const command=chooseAiCommand(state);
  expect(command.type).toBe('MOVE');
  expect(getLegalActions(state)).toContainEqual(command);
  if(command.type!=='MOVE')throw Error('Expected move.');
  const before=state.stacks.find(x=>x.id==='a')!;
  expect(gridDistance(state.map,command.to,{q:5,r:4})).toBeLessThan(
    gridDistance(state.map,before.position,{q:5,r:4}));
  expect(chooseAiCommand(state)).toEqual(command);
 });
 it('defensor em resistência guarda posição se não houver alvo legal',()=>{
  const {initial}=fixture({kind:'survive',defenderRounds:6},'defender');
  let s=startBattle(initial);
  const first=getLegalActions(s).find(x=>x.type==='END_ACTIVATION')!;
  s=applyBattleCommand(s,first,'narrator');
  expect(s.activeUnitId).toBe('d');
  expect(chooseAiCommand(s).type).toBe('DEFEND');
 });
});

describe('P2 — tutorial discreto, por modo',()=>{
 it('mostra 3 passos, guarda escolha e permite reabrir',()=>{
  render(<BattleFirstBattleGuide mode="dnd"/>);
  expect(screen.getByRole('region',{name:'Tutorial da primeira batalha'})).toBeInTheDocument();
  expect(screen.getByText('Primeira batalha · 1/3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próximo'}));
  expect(screen.getByText('Primeira batalha · 2/3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próximo'}));
  fireEvent.click(screen.getByRole('button',{name:'Entendi'}));
  expect(window.localStorage.getItem(BATTLE_FIRST_GUIDE_KEY+'dnd')).toBe('done');
  fireEvent.click(screen.getByRole('button',{name:'Como jogar'}));
  expect(screen.getByText('Primeira batalha · 1/3')).toBeInTheDocument();
 });
});
