import {describe,expect,it} from 'vitest';
import {gotTerrainNotes,gotVisualMap} from './adapters';
import {miniatureStressDemo} from './demo';
import {inspectVisualCell} from './terrain-inspection';

describe('Auditoria UX-2/3 — terreno e cenários 40/80',()=>{
 it('não altera regra GOT e exibe somente modificadores fornecidos',()=>{
  const tile={x:2,y:1,terrain:'dense-forest' as const};
  const original=JSON.stringify(tile);
  const notes=gotTerrainNotes(tile,'clear','clear');
  expect(notes).toContain('Cobertura ao defender: +5');
  expect(notes).toContain('Custo de entrada: 1 casa(s) · considerando clima e visibilidade');
  const map=gotVisualMap({width:4,height:3,tiles:[tile],weather:'clear',visibility:'clear'});
  const inspected=inspectVisualCell(map,[],{q:2,r:1});
  expect(inspected?.effects).toEqual(notes);
  expect(JSON.stringify(tile)).toBe(original);
 });
 it('ponte em rio usa a regra de terreno nativa, não a categoria visual',()=>{
  const bridge={x:1,y:2,terrain:'river' as const,bridge:true};
  const notes=gotTerrainNotes(bridge,'clear','clear');
  expect(notes).toContain('Custo de entrada: 2 casa(s) · considerando clima e visibilidade');
  expect(notes).not.toContain('Terreno bloqueado · consulte exceções do motor');
 });
 it.each([40,80] as const)('gera %i tokens fictícios em células distintas',number=>{
  const {map,tokens}=miniatureStressDemo(number);
  expect(tokens).toHaveLength(number);
  expect(new Set(tokens.map(t=>t.position.q+','+t.position.r)).size).toBe(number);
  expect(map.tiles).toHaveLength(99);
  expect(tokens.every(t=>t.id.startsWith('benchmark-'))).toBe(true);
 });
});
