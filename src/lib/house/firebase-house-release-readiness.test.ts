import {describe,it,expect} from 'vitest';
import {houseReleaseReadiness} from './firebase-house-release-readiness';

const snapshotId='a'.repeat(64);
const root={status:'active',private:true,sourceSnapshotId:snapshotId,
 sourceSnapshotReconciled:true,applicationEnabled:true,
 houseOpsWriteApproved:true,houseRulesWriteApproved:true};
const env={CORMYR_FIREBASE_HOUSE_OPS_ENABLED:'true',
 CORMYR_FIREBASE_HOUSE_RULES_ENABLED:'true',
 CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED:'true'};
describe('prontidão da Ficha e regras por Casa',()=>{
 it('bloqueia toda escrita sem aprovação operacional explícita',()=>{
  for(const candidate of [null,{...root,sourceSnapshotReconciled:false},
    {...root,houseOpsWriteApproved:false,houseRulesWriteApproved:false},
    {...root,sourceSnapshotId:'b'.repeat(64)}]){
   const result=houseReleaseReadiness({
    root:candidate,snapshotId,houseEconomyReconciled:true,
    narrator:true,env,
   });
   expect(result.houseOperationsWritable).toBe(false);
   expect(result.houseRulesWritable).toBe(false);
  }
 });
 it('rejeita compras quando não existe economia conciliada da Casa',()=>{
  const r=houseReleaseReadiness({root,snapshotId,houseEconomyReconciled:false,
   narrator:true,env});
  expect(r.houseOperationsWritable).toBe(false);
  expect(r.houseRulesWritable).toBe(true);
 });
 it('o catálogo pode ser consultado sem habilitar qualquer gravação',()=>{
  const result=houseReleaseReadiness({root,snapshotId,
   houseEconomyReconciled:true,narrator:true,env:{
    CORMYR_FIREBASE_HOUSE_OPS_ENABLED:'false',
    CORMYR_FIREBASE_HOUSE_RULES_ENABLED:'false',
    CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED:'true',
   }});
  expect(result).toEqual({houseOperationsWritable:false,
   houseRulesWritable:false,houseRulesReadable:true});
 });
 it('jogadores não recebem edição de regras nem com flag habilitada',()=>{
  const r=houseReleaseReadiness({root,snapshotId,houseEconomyReconciled:true,
   narrator:false,env});
  expect(r.houseOperationsWritable).toBe(true);
  expect(r.houseRulesWritable).toBe(false);
  expect(r.houseRulesReadable).toBe(true);
 });
 it('aplicação sem flags permanece somente leitura',()=>{
  expect(houseReleaseReadiness({root,snapshotId,houseEconomyReconciled:true,
   narrator:true,env:{}})).toEqual({
    houseOperationsWritable:false,houseRulesWritable:false,
    houseRulesReadable:false,
   });
 });
});
