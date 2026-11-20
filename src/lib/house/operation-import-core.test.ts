import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {applyHouseImportOperation} from './operation-import-core';

describe('importação com fonte original preservada',()=>{
 it('recusa Casa incompatível sem mutar dados',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseImportOperation(state,{
   source:'Importação',sourceHouse:'Casa Errada',
   resources:state.base,issues:[],decisions:'Justificativa comprovada',
   events:[],original:[]},'Casa A')).toThrow(/não corresponde/);
  expect(state).toEqual(before);
 });
 it('arquiva abas e atualiza somente recursos conciliados',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  const original=[{name:'Ficha importada',rows:[[{address:'A1',value:'Casa A'}]]}];
  const output=applyHouseImportOperation(state,{
   source:'Planilha antiga',sourceHouse:'Casa Áshkar',
   resources:state.base,issues:['Conferir domínio'],
   decisions:'Todos os recursos foram conferidos individualmente',
   events:['Fundação'],original},'Casa Ashkar');
  expect(output.archive.original).toEqual(original);
  expect(output.state.importSources).toContain('Planilha antiga');
  expect(output.state.pending).toEqual(['Conferir domínio']);
  expect(JSON.stringify(output.state)).not.toContain('Ficha importada');
  expect(state).toEqual(before);
 });
 it('proíbe importação por cima de Casa ativa',()=>{
  const state={...newHouseState('house-a'),phase:'active' as const};
  expect(()=>applyHouseImportOperation(state,{},'Casa A')).toThrow(/com compras/);
 });
});
