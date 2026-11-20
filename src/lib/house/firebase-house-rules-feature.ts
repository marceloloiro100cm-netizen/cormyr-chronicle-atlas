/**
 * House rules can be read from the reconciled operational overlay without
 * enabling writes. A separate explicit write flag and runtime approval are
 * mandatory for the Narrator to save adaptations.
 */
type Flags=Record<string,string|undefined>;
export const firebaseHouseRulesReadEnabled=(env:Flags)=>
 env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true'&&
 (env['CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED']==='true'||
  env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']==='true');

export const firebaseHouseRulesWriteEnabled=(env:Flags)=>
 env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true'&&
 env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']==='true';

export const firebaseHouseRulesRuntimeApproved=(runtime:unknown)=>{
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))return false;
 const r=runtime as Record<string,unknown>;
 return r['status']==='active'&&r['private']===true&&
  r['applicationEnabled']===true&&r['sourceSnapshotReconciled']===true&&
  r['houseRulesWriteApproved']===true;
};
