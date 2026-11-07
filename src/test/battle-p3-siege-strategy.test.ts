import {describe,it,expect} from 'vitest';
import {STRATEGIC_SITES,STRATEGIC_ROADS,strategicRoute,
 startSiege,siegeLegalActions,siegeOrder} from '@/lib/crusade/strategic-operations';

describe('P3 · logística e cerco fictício sem efeitos oficiais',()=>{
 it('desenha teatro de operações conexo e escolhe menor custo determinístico',()=>{
  expect(STRATEGIC_SITES).toHaveLength(5);
  expect(STRATEGIC_ROADS).toHaveLength(5);
  expect(strategicRoute('arabel','proskur')).toEqual({
   sites:['arabel','hillmarch','proskur'],cost:3,
  });
  expect(strategicRoute('proskur','arabel').cost).toBe(3);
  expect(strategicRoute('arabel','arabel')).toEqual({sites:['arabel'],cost:0});
  expect(()=>strategicRoute('not-real','arabel')).toThrow(/desconhecido/);
 });
 it('rejeita ações ilegais, mantém estado original imutável e alterna turnos',()=>{
  const start=startSiege();
  expect(start.source).toBe('fictional');
  expect(start.wall).toBe(100);
  expect(siegeLegalActions(start)).toContain('BOMBARD');
  expect(()=>siegeOrder(start,'REPAIR')).toThrow(/ilegal/);
  const attacked=siegeOrder(start,'BOMBARD');
  expect(attacked.turn).toBe('defender');
  expect(attacked.wall).toBe(77);
  expect(attacked.engines).toBe(3);
  expect(start.wall).toBe(100);
  const repaired=siegeOrder(attacked,'REPAIR');
  expect(repaired.wall).toBe(94);
  expect(repaired.turn).toBe('attacker');
  expect(repaired.day).toBe(2);
  expect(repaired.history).toHaveLength(2);
 });
 it('não permite assalto até existir brecha e encerra por retirada sem perdas oficiais',()=>{
  let state=startSiege();
  expect(siegeLegalActions(state)).not.toContain('ASSAULT');
  state=siegeOrder(state,'BOMBARD');
  state=siegeOrder(state,'RATION');
  state=siegeOrder(state,'BOMBARD');
  state=siegeOrder(state,'RATION');
  expect(siegeLegalActions(state)).toContain('ASSAULT');
  const assaulted=siegeOrder(state,'ASSAULT');
  expect(assaulted.garrison).toBeLessThan(state.garrison);
  expect(assaulted.attacker).toBeLessThan(state.attacker);
  expect(state.garrison).toBeGreaterThan(assaulted.garrison);
  // Retirada em um ciclo posterior encerra o cerco.
  state=siegeOrder(assaulted,'RATION');
  const ended=siegeOrder(state,'WITHDRAW');
  expect(ended.phase).toBe('completed');
  expect(ended.winner).toBe('defender');
  expect(siegeLegalActions(ended)).toEqual([]);
  expect(()=>siegeOrder(ended,'BOMBARD')).toThrow(/encerrado/);
 });
 it('cerco não aceita cidade não fortificada',()=>{
  expect(()=>startSiege('arabel')).toThrow(/fortificação/);
  expect(()=>startSiege('suzail')).toThrow(/fortificação/);
 });
});
