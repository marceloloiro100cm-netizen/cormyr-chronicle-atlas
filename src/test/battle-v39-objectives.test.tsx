import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {createV3Game} from '@/lib/battle/v3/engine';
import {v37Enable} from '@/lib/battle/v3/tactics-v37';
import {V38_THEATRES} from '@/lib/battle/v3/theatres-v38';
import {SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {hexKey} from '@/lib/battle/geometry/hex';
import {tileAt} from '@/lib/battle/geometry/terrain';
import {v39Enable,v39BuildPoints,v39AfterAction,v39PlayCommand,
 v39RunAi,V39_OBJECTIVE_VERSION,V39_HOLD_ROUNDS}
 from '@/lib/battle/v3/objectives-v39';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('V3.9 — proposta de objetivos de batalha isolados da campanha',()=>{
 it('distribui três objetivos distintos, caminháveis e fora das zonas de implantação em todos os teatros',()=>{
  expect(V39_OBJECTIVE_VERSION).toBe('CCA-V39-OBJECTIVES-1');
  expect(V39_HOLD_ROUNDS).toBe(2);
  for(const region of V38_THEATRES){
   for(const scenario of Object.keys(SCENARIOS) as BattleScenarioId[]){
    const game=createV3Game({...options,scenario,theatre:region.id});
    const map=game.battle.map,points=v39BuildPoints(map);
    const deployment=new Set([...map.deployment.attacker,...map.deployment.defender].map(hexKey));
    expect(points.map(p=>p.id)).toEqual(['bridge','highground','supplies']);
    expect(new Set(points.map(p=>hexKey(p.position))).size).toBe(3);
    for(const p of points){
     expect(tileAt(map,p.position)?.terrain).not.toBe('rock');
     expect(deployment.has(hexKey(p.position))).toBe(false);
    }
    expect(v39BuildPoints(map)).toEqual(points);
   }
  }
 });
 it('é opt-in, não altera replays antigos ou os exércitos fictícios',()=>{
  const classic=createV3Game(options);
  const original=JSON.stringify(classic);
  expect(classic.objectives).toBeUndefined();
  const train=v39Enable(v37Enable(classic));
  expect(train.objectives?.rulesVersion).toBe(V39_OBJECTIVE_VERSION);
  expect(train.battle).toEqual(classic.battle);
  expect(train.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  expect(JSON.stringify(classic)).toBe(original);
  expect(()=>v39Enable(train)).toThrow(/só podem iniciar/i);
 });
 it('conta controle por ocupação e vitória depois de duas rodadas completas consecutivas',()=>{
  const start=v39Enable(v37Enable(createV3Game(options)));
  const points=start.objectives!.points;
  const attackers=start.battle.stacks.filter(s=>s.side==='attacker');
  expect(attackers.length).toBeGreaterThan(1);
  const relocated=start.battle.stacks.map(s=>
   s.id===attackers[0]?.id?{...s,position:points[0]!.position}:
   s.id===attackers[1]?.id?{...s,position:points[1]!.position}:s);
  const afterOne=v39AfterAction(start,{
   ...start,battle:{...start.battle,round:2,stacks:relocated},
  });
  expect(afterOne.objectives?.streaks.attacker).toBe(1);
  expect(afterOne.objectives?.lastScoredRound).toBe(1);
  expect(afterOne.battle.phase).toBe('active');
  const afterTwo=v39AfterAction(afterOne,{
   ...afterOne,battle:{...afterOne.battle,round:3},
  });
  expect(afterTwo.objectives?.streaks.attacker).toBe(2);
  expect(afterTwo.objectives?.winner).toBe('attacker');
  expect(afterTwo.battle.phase).toBe('completed');
  expect(afterTwo.battle.resultReason).toBe('v39-objectives');
  expect(start.battle.stacks[0]?.position).not.toEqual(points[0]?.position);
 });
 it('não pontua uma rodada incompleta, não conta debandados e não pula rodadas',()=>{
  const start=v39Enable(createV3Game(options));
  const noRound=v39AfterAction(start,{...start,battle:{...start.battle,
   stacks:start.battle.stacks.map(s=>s)}});
  expect(noRound.objectives?.streaks.attacker).toBe(0);
  expect(noRound.objectives?.lastScoredRound).toBe(0);
  expect(()=>v39AfterAction(start,{...start,battle:{...start.battle,round:3}}))
   .toThrow(/pulou uma rodada/i);
  const target=start.objectives!.points[0]!.position;
  const routed={...start.battle.stacks[0]!,position:target,moraleState:'routed' as const};
  const withRouted=v39AfterAction(start,{...start,battle:{
   ...start.battle,round:2,stacks:[routed,...start.battle.stacks.slice(1)],
  }});
  expect(withRouted.objectives?.points[0]?.holder).toBeNull();
 });
 it('preserva as regras PTE em ordens da pilha, e IA não pode agir pelo humano',()=>{
  const game=v39Enable(v37Enable(createV3Game(options)));
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const next=v39PlayCommand(game,{type:'END_ACTIVATION',unitId:active.id});
  expect(next.battle.round).toBeGreaterThanOrEqual(1);
  expect(next.objectives?.lastScoredRound).toBeLessThan(next.battle.round);
  expect(v39RunAi(game)).toBe(game);
  expect(next.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
 });
 it('permite escolher objetivo opcional e ver os três marcos no mapa',()=>{
  const {container}=render(<BattleV3Game/>);
  expect(screen.queryByRole('region',{name:'Objetivos de controle V3.9'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Condição de vitória'),{
   target:{value:'hold-majority'},
  });
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const panel=within(screen.getByRole('region',{name:'Objetivos de controle V3.9'}));
  expect(panel.getAllByRole('listitem')).toHaveLength(3);
  expect(panel.getByText('Passagem estratégica')).toBeInTheDocument();
  expect(panel.getByText('Colina de vigia')).toBeInTheDocument();
  expect(panel.getByText('Depósito de campanha')).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Mapa hexagonal/})).toBeInTheDocument();
  expect(container.querySelectorAll('.battle-hex[aria-label*="objetivo"]')).toHaveLength(3);
  expect(screen.getByText(/Simulação: as fichas das casas continuam intactas/)).toBeInTheDocument();
 });
});
