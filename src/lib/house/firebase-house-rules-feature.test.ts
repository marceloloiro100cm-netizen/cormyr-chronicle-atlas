import {describe,it,expect} from 'vitest';
import {firebaseHouseRulesReadEnabled,firebaseHouseRulesWriteEnabled,
 firebaseHouseRulesRuntimeApproved} from './firebase-house-rules-feature';

describe('Item 5: leitura de regras independente da gravação',()=>{
 const flags={CORMYR_FIREBASE_CLOUD_READ_ENABLED:'true',
  CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED:'true',
  CORMYR_FIREBASE_HOUSE_RULES_ENABLED:'false'};
 it('permite o catálogo somente leitura, sem habilitar mudanças',()=>{
  expect(firebaseHouseRulesReadEnabled(flags)).toBe(true);
  expect(firebaseHouseRulesWriteEnabled(flags)).toBe(false);
 });
 it('não permite leitura sem fonte Cloud autenticada',()=>{
  expect(firebaseHouseRulesReadEnabled({...flags,
   CORMYR_FIREBASE_CLOUD_READ_ENABLED:'false'})).toBe(false);
  expect(firebaseHouseRulesWriteEnabled({...flags,
   CORMYR_FIREBASE_CLOUD_READ_ENABLED:'false'})).toBe(false);
 });
 it('escrita precisa de autorização explícita além da leitura',()=>{
  expect(firebaseHouseRulesWriteEnabled({...flags,
   CORMYR_FIREBASE_HOUSE_RULES_ENABLED:'true'})).toBe(true);
  expect(firebaseHouseRulesReadEnabled({...flags,
   CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED:'false',
   CORMYR_FIREBASE_HOUSE_RULES_ENABLED:'true'})).toBe(true);
 });
 it('rejeita runtime inativo, não conciliado ou sem aprovação',()=>{
  const root={status:'active',private:true,applicationEnabled:true,
   sourceSnapshotReconciled:true,houseRulesWriteApproved:true};
  expect(firebaseHouseRulesRuntimeApproved(root)).toBe(true);
  for(const [k,v] of Object.entries(root)){
   expect(firebaseHouseRulesRuntimeApproved({...root,[k]:
    typeof v==='boolean'?!v:'pending'})).toBe(false);
  }
  expect(firebaseHouseRulesRuntimeApproved(null)).toBe(false);
 });
});
