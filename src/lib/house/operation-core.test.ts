import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {HOUSE_ACTIONS,applyHouseDomainOperation,applyHouseNonEconomicOperation,
 HOUSE_NON_ECONOMIC_ACTIONS,needsHouseOperationCalendar,
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

describe('segunda fatia de ações puras da Ficha',()=>{
 it('isola sete atos não econômicos do estado de entrada',()=>{
  expect(HOUSE_NON_ECONOMIC_ACTIONS).toHaveLength(7);
  const review={...newHouseState('house-a'),phase:'review' as const,
   pending:['Conferir domínio','Validar herdeiro']};
  const cleared=applyHouseNonEconomicOperation(review,'clear_pending',{
   indices:[0]},'Foi apresentada documentação para conciliar o domínio');
  expect(review.pending).toHaveLength(2);
  expect(cleared.state.pending).toEqual(['Validar herdeiro']);
  expect(cleared.explanation).toContain('Conferir domínio');
  expect(()=>applyHouseNonEconomicOperation(review,'approve',{},''))
   .toThrow(/pendências/);
  const allClear=applyHouseNonEconomicOperation(cleared.state,'clear_pending',
   {indices:[0]},'A segunda pendência foi resolvida com documentação');
  const approved=applyHouseNonEconomicOperation(allClear.state,'approve',{},'');
  expect(approved.state.phase).toBe('active');
  const returned=applyHouseNonEconomicOperation(review,'return_to_draft',{},
   'Faltou documento');
  expect(returned.state.phase).toBe('draft');
  expect(review.phase).toBe('review');
 });
 it('remove somente o vínculo da Corte e rejeita IDs inexistentes',()=>{
  const state=newHouseState('house-a');
  state.court.push({id:ID,npcId:ID,name:'Senescal',role:'Administrador',notes:''});
  const output=applyHouseNonEconomicOperation(state,'court_remove',{id:ID},'');
  expect(output.state.court).toHaveLength(0);
  expect(state.court).toHaveLength(1);
  expect(()=>applyHouseNonEconomicOperation(state,'court_remove',{
   id:'22222222-2222-4222-8222-222222222222'},'')).toThrow(/não encontrado/);
 });
});

describe('conferência de operações militares e lealdade',()=>{
 it('recusa unidade inexistente e não altera a ficha em erro',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseNonEconomicOperation(state,'unit_edit',{
   unitId:'inexistente',name:'Leões',origin:'Cormyr',
   situation:'',notes:'',skills:{
    agility:2,athletics:2,awareness:2,endurance:2,
    fighting:2,marksmanship:2,stealth:2,cunning:2,healing:2,
    animalHandling:2,warfare:2,survival:2,
   },
  },'')).toThrow(/indisponível/);
  expect(state).toEqual(before);
 });
 it('somente altera lealdade de vassalagem realmente aprovada',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseNonEconomicOperation(state,'vassal_loyalty',{
   id:'id-sem-vassalagem',loyalty:'loyal',
  },'Justificativa suficiente do Narrador')).toThrow(/ativa/);
  expect(state).toEqual(before);
 });
});
