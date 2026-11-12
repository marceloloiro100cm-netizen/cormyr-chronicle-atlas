import {describe,expect,it} from 'vitest';
import {auditCommission} from './audit';
import type {NewspaperBlock,NewspaperCommission} from './model';

const commission=(extra:Partial<NewspaperCommission>={}):NewspaperCommission=>({
 id:'11111111-1111-4111-8111-111111111111',house_id:'h',requested_by:'u',title:'Festa na corte',
 body:'Todos compareceram ao baile.',image_path:null,cost_wealth:1,state:'published',request_key:'k',
 newspaper_id:'e1',created_at:'2026-11-01T10:00:00Z',published_at:null,rejection_note:null,rejected_at:null,seen_at:null,...extra,
});
const block=(text:string,extra:Partial<NewspaperBlock>={}):NewspaperBlock=>
 ({id:'b',type:'article',text,span:6,height:190,commissionId:'11111111-1111-4111-8111-111111111111',...extra});
const edition=(blocks:NewspaperBlock[])=>[{id:'e1',edition_no:7,blocks}];

describe('auditoria das notícias contratadas',()=>{
 it('texto igual (ignorando espaços e quebras) é publicado integralmente',()=>{
  const audit=auditCommission(commission(),edition([block('Festa na corte\n\nTodos   compareceram ao baile.')]));
  expect(audit.status).toBe('integral');expect(audit.editionNo).toBe(7);
 });
 it('texto diferente é editado pelo Editor-Chefe e mostra o publicado',()=>{
  const audit=auditCommission(commission(),edition([block('Festa na corte\n\nA maioria foi ao baile.')]));
  expect(audit.status).toBe('edited');expect(audit.published).toContain('A maioria');
  expect(audit.original.body).toBe('Todos compareceram ao baile.');
 });
 it('só a matéria conta: a foto com o mesmo vínculo é ignorada, e sem matéria é "sem o texto"',()=>{
  const photoOnly=edition([block('',{type:'image'})]);
  expect(auditCommission(commission(),photoOnly).status).toBe('missing');
 });
 it('pendente, recusado e edição inexistente têm rótulos próprios',()=>{
  expect(auditCommission(commission({state:'pending'}),[]).status).toBe('pending');
  expect(auditCommission(commission({state:'rejected',rejection_note:'Fora do tom'}),[]).label).toBe('Recusado e reembolsado');
  expect(auditCommission(commission(),[]).status).toBe('no-edition');
 });
});
