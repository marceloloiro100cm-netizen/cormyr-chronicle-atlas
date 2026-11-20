import {describe,it,expect} from 'vitest';
import {newHouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {operationalHouseEconomyIsReconciled as reconciled}
 from './firebase-house-read-integrity';

const snapshot='a'.repeat(64);
function fixture(){
 const state=newHouseState('house-a','Ferlin',1522*12+1);
 state.phase='active';state.method='import';state.treasury=700;
 const fingerprint=constructionStateHash(state);
 return {
  imported:{house_id:'house-a',version:3,state},
  operational:{
   houseId:'house-a',status:'active',private:true,sourceSnapshotId:snapshot,
   sourceReconciled:true,seedVerified:true,sourceSheetVersion:3,
   sourceStateHash:fingerprint,stateHash:fingerprint,version:0,
   state:structuredClone(state),
  },
 };
}
describe('Ficha 4c: rejeitar overlays inconsistentes na leitura',()=>{
 it('aceita uma economia verificada e alterações posteriores com hash correto',()=>{
  const f=fixture();
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(true);
  f.operational.version=1;
  f.operational.state.treasury=650;
  f.operational.stateHash=constructionStateHash(f.operational.state);
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(true);
 });
 it('não aceita saldo modificado, versão ou origem divergente',()=>{
  const f=fixture();
  const original=structuredClone(f.operational);
  f.operational.state.treasury=9000;
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
  f.operational=structuredClone(original);
  f.operational.sourceSheetVersion=4;
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
  f.operational=structuredClone(original);
  f.operational.sourceSnapshotId='b'.repeat(64);
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
  f.operational=structuredClone(original);
  f.operational.houseId='house-b';
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
 });
 it('não usa fallback após dados inválidos ou aprovação pendente',()=>{
  const f=fixture();
  f.operational.sourceReconciled=false;
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
  f.operational.sourceReconciled=true;
  f.operational.seedVerified=false;
  expect(reconciled(f.imported,f.operational,snapshot)).toBe(false);
  expect(reconciled(f.imported,{state:{}},snapshot)).toBe(false);
  expect(reconciled(f.imported,null,snapshot)).toBe(false);
 });
});
