import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {HOUSE_ACTIONS,applyHouseDomainOperation,applyHouseNonEconomicOperation,
 HOUSE_NON_ECONOMIC_ACTIONS,applyHouseEconomicOperation,
 HOUSE_ECONOMIC_ACTIONS,applyHouseMilitaryOperation,
 HOUSE_MILITARY_ACTIONS,applyHouseCreationOperation,
 HOUSE_CREATION_ACTIONS,applyHouseDiceOperation,
 HOUSE_DICE_ACTIONS,needsHouseOperationCalendar,
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

describe('ações econômicas puras com rastreabilidade',()=>{
 it('a doação de 400 DO gera dois pontos de Riqueza sem alterar a entrada',()=>{
  const state=newHouseState('house-a');
  state.phase='active';state.treasury=500;
  const after=applyHouseEconomicOperation(state,'donate_gold',{points:2},
   {admin:false,key:ID,explanation:'Doação de ouro'});
  expect(after.state.permanent.wealth).toBe(state.permanent.wealth+2);
  expect(after.state.treasury).toBe(100);
  expect(state.treasury).toBe(500);
  expect(HOUSE_ECONOMIC_ACTIONS).toHaveLength(12);
 });
 it('bloqueia correção não autorizada e doação sem cofre',()=>{
  const state=newHouseState('house-a');
  state.phase='active';
  expect(()=>applyHouseEconomicOperation(state,'donate_gold',{points:1},
   {admin:false,key:ID,explanation:''})).toThrow(/Cofre/);
  expect(()=>applyHouseEconomicOperation(state,'correct',{
   changes:{defense:0,influence:0,lands:0,law:0,population:0,power:0,wealth:1}},
   {admin:false,key:ID,explanation:'Justificativa comprovada'})).toThrow(/Narrador/);
 });
});

describe('ações militares puras com validação de escopo',()=>{
 it('enumeram oito operações e recusam unidades inexistentes sem mutação',()=>{
  expect(HOUSE_MILITARY_ACTIONS).toHaveLength(8);
  const state=newHouseState('house-a'),copy=structuredClone(state);
  expect(()=>applyHouseMilitaryOperation(state,'grant_unit_xp',{
   unitId:'no-unit',amount:20,reason:'Concessão do Narrador'},
   {admin:false,key:ID,explanation:'Concessão do Narrador'})).toThrow(/Narrador/);
  expect(()=>applyHouseMilitaryOperation(state,'unit_state',{
   unitId:'no-unit',mounted:false,atHome:true,health:5,casualties:0,
   situation:''},{admin:false,key:ID,explanation:''})).toThrow(/indisponível/);
  expect(state).toEqual(copy);
 });
 it('rejeita melhorias sem a construção militar necessária',()=>{
  const state=newHouseState('house-a'),copy=structuredClone(state);
  expect(()=>applyHouseMilitaryOperation(state,'broad_training',{
   unitId:'no-unit',skill:'fighting'},{admin:false,key:ID,explanation:''}))
   .toThrow(/não está ativo/);
  expect(state).toEqual(copy);
 });
});

describe('criação e conciliação sem consultas externas',()=>{
 const ctx={admin:false,mayBuyAttributes:false,explanation:''};
 it('registra seis ações e recusa aprovação de atributos sem autorização',()=>{
  expect(HOUSE_CREATION_ACTIONS).toHaveLength(6);
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseCreationOperation(state,'draft',{
   base:{...state.base,wealth:5},identity:state.identity,
   method:'budget',creationStep:0},ctx)).toThrow(/bloqueada|não está autorizada/);
  expect(state).toEqual(before);
 });
 it('protege ficha do Narrador e dados históricos imutáveis',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseCreationOperation(state,'admin_edit',{
   base:state.base,permanent:state.permanent,identity:state.identity},ctx))
   .toThrow(/Narrador/);
  expect(()=>applyHouseCreationOperation(state,'restore_legacy_effects',{
   holdingIds:['inexistente']},ctx)).toThrow(/Narrador/);
  expect(state).toEqual(before);
 });
 it('envio exige domínio e não aceita ficha incompleta',()=>{
  const state=newHouseState('house-a'),before=structuredClone(state);
  expect(()=>applyHouseCreationOperation(state,'submit',{},ctx))
   .toThrow();
  expect(state).toEqual(before);
 });
});

describe('rolagens registradas e determinísticas por requestKey',()=>{
 const ctx={admin:true,key:ID,playerId:'player-a',
  dice:Array.from({length:100},(_,i)=>i%6+1)};
 it('registra cinco ações e reproduz as mesmas rolagens',()=>{
  expect(HOUSE_DICE_ACTIONS).toHaveLength(5);
  const state=newHouseState('house-a');
  const first=applyHouseDiceOperation(state,'roll',{},ctx);
  const repeated=applyHouseDiceOperation(state,'roll',{},ctx);
  expect(first.state.rolls).toEqual(repeated.state.rolls);
  expect(first.state.rolls).toHaveLength(7);
  expect(state.rolls).toHaveLength(0);
 });
 it('fundação e eventos históricos não alteram a fonte original',()=>{
  const state=newHouseState('house-a');
  const out=applyHouseDiceOperation(state,'foundation_roll',{},ctx);
  expect(out.state.creationHistory).toBeDefined();
  expect(state.creationHistory).toBeUndefined();
  const history=applyHouseDiceOperation(out.state,'history_roll',
   {infrastructure:['defense','wealth']},ctx);
  expect(history.state.creationHistory?.events[0]?.id).toBe(ID);
  expect(out.state.creationHistory?.events).toHaveLength(0);
 });
 it('bônus pessoal não aceita duplicidade nem Narrador sem perfil de jogador',()=>{
  const state=newHouseState('house-a');
  const out=applyHouseDiceOperation(state,'member_bonus',{resource:'wealth'},ctx);
  expect(out.state.creationBonuses).toHaveLength(1);
  expect(()=>applyHouseDiceOperation(out.state,'member_bonus',
   {resource:'wealth'},ctx)).toThrow(/apenas uma vez/);
  expect(()=>applyHouseDiceOperation(state,'member_bonus',
   {resource:'wealth'},{...ctx,playerId:null})).toThrow(/jogador cadastrado/);
 });
});
