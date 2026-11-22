import {describe,expect,it} from 'vitest';
import {newspaperMediaErrorMessage} from './firebase-newspaper-media';

describe('Gravuras do Reino: diagnóstico do envio',()=>{
 it('não confunde qualquer 503 com falta de autorização',()=>{
  const unknown=newspaperMediaErrorMessage(503,'newspaper_media_unavailable');
  expect(unknown).toContain('não comprova falta de autorização');
  expect(unknown).not.toContain('ainda não está autorizado');
 });
 it('identifica os dois bloqueios operacionais sem dados privados',()=>{
  expect(newspaperMediaErrorMessage(503,'media_not_approved'))
   .toContain('Narrador');
  expect(newspaperMediaErrorMessage(503,'newspaper_media_disabled'))
   .toContain('App Hosting');
 });
 it('informa se o bloqueio é IAM do Storage ou escrita de metadados Firestore',()=>{
  expect(newspaperMediaErrorMessage(503,'media_storage_permission_denied'))
   .toContain('bucket');
  expect(newspaperMediaErrorMessage(503,'media_registry_unavailable'))
   .toContain('Firestore');
 });
 it('não exibe mensagens arbitrárias retornadas por API',()=>{
  const result=newspaperMediaErrorMessage(503,'private-user@example.com');
  expect(result).not.toContain('private-user@example.com');
  expect(newspaperMediaErrorMessage(401,'permission_denied')).toContain('Sessão');
 });
});
