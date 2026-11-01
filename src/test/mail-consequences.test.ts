import {describe,expect,it} from 'vitest';
import {balances} from '@/lib/house/engine';
import {newHouseState} from '@/lib/house/types';
import {consequenceLabel} from '@/components/players/letter-consequences';

describe('Consequências narrativas das missivas',()=>{
 it('aloca perda sem alterar pontos-base ou permanentes e credita ganho como bônus do evento',()=>{
  const state=newHouseState('erdenor');
  state.base.population=10;state.base.wealth=9;
  const original=structuredClone(state);
  state.mailConsequences=[{
   id:'event-1',letterId:'missiva-1',changes:{population:-1,wealth:1},
   active:true,createdAt:'2026-11-01T00:00:00Z'
  }];
  const r=balances(state);
  expect(r.total.population).toBe(10);
  expect(r.allocated.population).toBe(1);
  expect(r.available.population).toBe(9);
  expect(r.total.wealth).toBe(10);
  expect(r.available.wealth).toBe(10);
  expect(r.permanent.population).toBe(0);
  expect(r.permanent.wealth).toBe(0);
  expect(state.base).toEqual(original.base);
  expect(state.permanent).toEqual(original.permanent);
 });
 it('reverte perfeitamente sem afetar outras alocações da Casa',()=>{
  const state=newHouseState('erdenor');
  state.base.population=10;state.base.wealth=9;
  state.mailConsequences=[
   {id:'1',letterId:'l1',changes:{population:-1,wealth:1},active:true,createdAt:'2026-01-01'},
   {id:'2',letterId:'l2',changes:{population:-2,wealth:2},active:true,createdAt:'2026-01-01'},
  ];
  expect(balances(state).available.population).toBe(7);
  expect(balances(state).available.wealth).toBe(12);
  state.mailConsequences[0]!.active=false;
  expect(balances(state).available.population).toBe(8);
  expect(balances(state).available.wealth).toBe(11);
  state.mailConsequences[1]!.active=false;
  expect(balances(state).available.population).toBe(10);
  expect(balances(state).available.wealth).toBe(9);
 });
 it('formata a tarja de forma legível e em ordem de recursos',()=>{
  expect(consequenceLabel({population:-1,wealth:1})).toBe('População -1; Riqueza +1');
  expect(consequenceLabel({wealth:0})).toBe('');
  expect(consequenceLabel({unknown:999,law:-3})).toBe('Lei -3');
 });
 it('rejeita estados com impactos quebrados em vez de distorcer saldos',()=>{
  const state=newHouseState('erdenor');
  state.mailConsequences=[{
   id:'1',letterId:'l1',changes:{wealth:1.2},active:true,createdAt:'2026-11-01'
  }];
  expect(()=>balances(state)).toThrow('Consequência de missiva inválida');
 });
});
