import {describe,expect,it} from 'vitest';
import {isReadOnlyWorkspaceRequest} from './service';

describe('cache curto da caixa: só leituras conhecidas',()=>{
 it('aceita consultas e páginas da caixa',()=>{
  expect(isReadOnlyWorkspaceRequest({kind:'rpc',name:'mail_page',args:{}})).toBe(true);
  expect(isReadOnlyWorkspaceRequest({kind:'query',table:'campaign_letters',steps:[{op:'select',args:['*']}]})).toBe(true);
  expect(isReadOnlyWorkspaceRequest({kind:'batch',items:[
   {kind:'rpc',name:'mail_page'},{kind:'rpc',name:'mail_trash_page'}]})).toBe(true);
 });
 it('trata escrita, RPC desconhecida e lote misto como escrita',()=>{
  expect(isReadOnlyWorkspaceRequest({kind:'rpc',name:'dated_mail_action'})).toBe(false);
  expect(isReadOnlyWorkspaceRequest({kind:'rpc',name:'mark_letter_read'})).toBe(false);
  expect(isReadOnlyWorkspaceRequest({kind:'rpc',name:'qualquer_outra'})).toBe(false);
  expect(isReadOnlyWorkspaceRequest({kind:'query',table:'x',steps:[{op:'insert',args:[{}]}]})).toBe(false);
  expect(isReadOnlyWorkspaceRequest({kind:'batch',items:[
   {kind:'rpc',name:'mail_page'},{kind:'rpc',name:'mark_letter_read'}]})).toBe(false);
  expect(isReadOnlyWorkspaceRequest({kind:'batch',items:[]})).toBe(false);
  expect(isReadOnlyWorkspaceRequest(null)).toBe(false);
 });
});
