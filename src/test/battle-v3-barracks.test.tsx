import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {createV3Game} from '@/lib/battle/v3/engine';
import {v3BarracksFromHouse,v3BarracksSummary,v3BarracksSplit,
 v3BarracksMerge,v3BarracksRecruit,v3BarracksChangeCount,
 v3BarracksSetPlacement,v3BarracksDeploy} from '@/lib/battle/v3/barracks';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'knight' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Crusada V3.1 — quartel 100% fictício',()=>{
 it('preserva exatamente o efetivo ao dividir e fundir pilhas homogêneas',()=>{
  const initial=v3BarracksFromHouse('evenhand-model');
  const total=v3BarracksSummary(initial).totalSoldiers;
  const split=v3BarracksSplit(initial,initial[0].id,40);
  expect(split).toHaveLength(initial.length+1);
  expect(v3BarracksSummary(split).totalSoldiers).toBe(total);
  expect(split.at(-1)?.placement).toBe('reserve');
  const merged=v3BarracksMerge(split,split.at(-1)!.id,initial[0].id);
  expect(merged).toHaveLength(initial.length);
  expect(v3BarracksSummary(merged).totalSoldiers).toBe(total);
  expect(merged.find(s=>s.id===initial[0].id)?.count).toBe(initial[0].count);
  expect(initial[0].count).toBe(100);
  expect(()=>v3BarracksMerge(initial,initial[0].id,initial[1].id)).toThrow();
 });
 it('aplica limites de campo, orçamento e suprimentos sem qualquer transação',()=>{
  const initial=v3BarracksFromHouse('evenhand-model');
  const recruited=v3BarracksRecruit(initial,'infantry','trained',20);
  expect(recruited.at(-1)?.placement).toBe('reserve');
  const field=v3BarracksSetPlacement(recruited,recruited.at(-1)!.id,'field');
  expect(v3BarracksSummary(field).fieldStacks).toBe(5);
  const another=v3BarracksRecruit(field,'scouts','green',20);
  expect(()=>v3BarracksSetPlacement(another,another.at(-1)!.id,'field')).toThrow(/cinco/i);
  expect(()=>v3BarracksChangeCount(initial,initial[0].id,1000)).toThrow(/orçamento/i);
  expect(()=>v3BarracksRecruit(initial,'warships','trained',10)).toThrow();
  expect(()=>v3BarracksRecruit(initial,'infantry','trained',0)).toThrow();
 });
 it('leva para a arena apenas pilhas em campo e mantém fontes fictícias',()=>{
  const initial=v3BarracksFromHouse('evenhand-model');
  const split=v3BarracksSplit(initial,initial[0].id,40);
  const rosters={
   attacker:v3BarracksDeploy(split),
   defender:v3BarracksDeploy(v3BarracksFromHouse('ashkar-model')),
  };
  const game=createV3Game({...options,rosters});
  expect(game.battle.stacks).toHaveLength(8);
  expect(game.battle.stacks.find(s=>s.name===initial[0].name)?.initialCount).toBe(60);
  expect(game.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  expect(rosters.attacker).toHaveLength(4);
  expect(v3BarracksSummary(split).totalSoldiers).toBeGreaterThan(
   rosters.attacker.reduce((count,s)=>count+s.count,0));
 });
 it('torna o quartel editável antes de batalhar, sem alterar o convite travado',()=>{
  render(<BattleV3Game/>);
  const ally=within(screen.getByRole('region',{name:'Quartel Aliado'}));
  fireEvent.click(ally.getByRole('button',{name:'Recrutar para reserva'}));
  expect(ally.getByText('Infantaria recrutados')).toBeInTheDocument();
  fireEvent.click(ally.getByRole('button',{name:'Escalar no campo'}));
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  expect(screen.getByLabelText('Ordem de batalha')).toBeInTheDocument();
  expect(within(screen.getByLabelText('Ordem de batalha'))
   .getAllByRole('button')).toHaveLength(9);
 });
});
