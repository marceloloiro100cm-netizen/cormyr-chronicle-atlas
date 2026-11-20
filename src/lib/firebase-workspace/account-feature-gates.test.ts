import {describe,it,expect} from 'vitest';
import {firebaseAccountActionEnabled,type FirebaseAccountAction}
 from './account-feature-gates';

const actions:FirebaseAccountAction[]=['status','list','submit','completePassword'];
describe('API Firebase: leitura de contas independente de mutações',()=>{
 it('sem qualquer flag, tudo bloqueado',()=>{
  for(const action of actions)expect(firebaseAccountActionEnabled(action,{})).toBe(false);
 });
 it('libera apenas status e lista autenticados quando WRITE continua fechado',()=>{
  const env={CORMYR_FIREBASE_CLOUD_READ_ENABLED:'true',
   CORMYR_FIREBASE_ACCOUNTS_READ_ENABLED:'true',
   CORMYR_FIREBASE_ACCOUNTS_ENABLED:'false'};
  expect(firebaseAccountActionEnabled('status',env)).toBe(true);
  expect(firebaseAccountActionEnabled('list',env)).toBe(true);
  expect(firebaseAccountActionEnabled('submit',env)).toBe(false);
  expect(firebaseAccountActionEnabled('completePassword',env)).toBe(false);
 });
 it('a flag de escrita explícita só permite ações quando a leitura Cloud também existe',()=>{
  for(const action of actions){
   expect(firebaseAccountActionEnabled(action,{
    CORMYR_FIREBASE_CLOUD_READ_ENABLED:'true',
    CORMYR_FIREBASE_ACCOUNTS_ENABLED:'true',
   })).toBe(true);
   expect(firebaseAccountActionEnabled(action,{
    CORMYR_FIREBASE_CLOUD_READ_ENABLED:'false',
    CORMYR_FIREBASE_ACCOUNTS_ENABLED:'true',
   })).toBe(false);
  }
 });
});
