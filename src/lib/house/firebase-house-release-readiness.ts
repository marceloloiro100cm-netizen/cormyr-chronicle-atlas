/**
 * UI capability hints. These never grant authority: the transactional
 * endpoints revalidate session, House and runtime inside Firestore.
 * Unknown/absent flags and documents fail closed.
 */
import {runtimeApprovalEnabled} from '../../../scripts/firebase/runtime-approval-policy.mjs';
type Root={
 status?:unknown;private?:unknown;sourceSnapshotId?:unknown;
 sourceSnapshotReconciled?:unknown;applicationEnabled?:unknown;
 houseOpsWriteApproved?:unknown;houseRulesWriteApproved?:unknown;
};
export type HouseReleaseReadiness={
 houseOperationsWritable:boolean;
 houseRulesWritable:boolean;
 houseRulesReadable:boolean;
};
export function houseReleaseReadiness({
 root,snapshotId,houseEconomyReconciled,narrator,env,
}:{
 root:Root|null|undefined;snapshotId:string;
 houseEconomyReconciled:boolean;narrator:boolean;
 env:Record<string,string|undefined>;
}):HouseReleaseReadiness{
 const rootOk=/^[a-f0-9]{64}$/.test(snapshotId)&&
  root?.status==='active'&&root.private===true&&
  root.sourceSnapshotId===snapshotId&&
  root.sourceSnapshotReconciled===true&&root.applicationEnabled===true;
 return {
  houseOperationsWritable:rootOk&&houseEconomyReconciled&&
   runtimeApprovalEnabled(root,'houseOpsWriteApproved',env)&&
   env['CORMYR_FIREBASE_HOUSE_OPS_ENABLED']==='true',
  houseRulesWritable:rootOk&&narrator&&
   runtimeApprovalEnabled(root,'houseRulesWriteApproved',env)&&
   env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']==='true',
  houseRulesReadable:rootOk&&(
   env['CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED']==='true'||
   env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']==='true'),
 };
}
