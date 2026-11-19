import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {HOUSE_ACTIONS,applyHouseDomainOperation,needsHouseOperationCalendar,
 requireHouseOperationPhase,requireHouseOperationRole} from './operation-core';

const ID='11111111-1111-4111-8111-111111111111';
describe('núcleo puro de operações da Ficha',()=>{
 it('enumera todas as 55 ações do contrato sem conceder privilégios',()=>{
  expect(HOUSE_ACTIONS).toHaveLength(55);
  expect(new Set(HOUSE_ACTIONS).size).toBe(55);
  for(const action of HOUSE_ACTIONS)expect(typeof action).toBe('string');
  for(const action of ['approve','correct','sync_calendar','vassal_approve',
   'grant_unit_xp','admin_edit'] as const)
   expect(()=>requireHouseOperationRole(action,false)).toThrow(/Narrador/);
  expect(()=>requireHouseOperationRole('domain',false)).not.toThrow();
 });
 it('cria e edita domínio sem alterar o estado de entrada',()=>{
  const state=newHouseState('house-a');
  const first=applyHouseDomainOperation(state,'domain',{
    id:ID,name:'Nova Terra',notes:'Criada pelo jogador',
  });
  expect(state.domains).toHaveLength(0);
  expect(first.state.domains[0]?.name).toBe('Nova Terra');
  const second=applyHouseDomainOperation(first.state,'domain_edit',{
    id:ID,name:'Vale',notes:'Ajuste',
  });
  expect(first.state.domains[0]?.name).toBe('Nova Terra');
  expect(second.state.domains[0]).toMatchObject({name:'Vale',notes:'Ajuste'});
 });
 it('exclusão só apaga domínio vazio em rascunho',()=>{
  const state=applyHouseDomainOperation(newHouseState('house-a'),'domain',{
   id:ID,name:'Vale',notes:'',
  }).state;
  const gone=applyHouseDomainOperation(state,'domain_delete',{id:ID});
  expect(gone.state.domains).toHaveLength(0);
  expect(state.domains).toHaveLength(1);
  expect(()=>applyHouseDomainOperation({...state,phase:'active'},
   'domain_delete',{id:ID})).toThrow(/criação/);
  expect(()=>applyHouseDomainOperation({...state,units:[{domainId:ID} as never]},
   'domain_delete',{id:ID})).toThrow(/tropas/);
 });
 it('revisão e calendário bloqueiam ações mensais sem autorizar avanço individual',()=>{
  const draft=newHouseState('house-a');
  const active={...draft,phase:'active' as const};
  const review={...draft,phase:'review' as const};
  expect(needsHouseOperationCalendar(active,'purchase')).toBe(true);
  expect(needsHouseOperationCalendar(draft,'purchase')).toBe(false);
  expect(()=>requireHouseOperationPhase(active,'advance')).toThrow(/Avanço individual/);
  expect(()=>requireHouseOperationPhase(review,'purchase')).toThrow(/revisão/);
  expect(()=>requireHouseOperationPhase(review,'correct')).not.toThrow();
 });
});
