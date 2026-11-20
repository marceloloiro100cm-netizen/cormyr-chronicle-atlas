/* eslint-disable @typescript-eslint/no-explicit-any -- Firestore transaction boundary. */
import {createHash} from 'node:crypto';
import {chooseCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
import {activeSeason2HouseScopeValid} from '../../../scripts/firebase/cloud-season2-house-scope.mjs';
import type {Scope} from './service';

const safe=(v:unknown):v is string=>typeof v==='string'&&
 /^[^/\u0000-\u001f\u007f]{1,128}$/.test(v);
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=250&&
 v.every(safe)&&new Set(v).size===v.length;
const same=(a:string[],b:string[])=>a.length===b.length&&a.every(id=>b.includes(id));

/** Read access and House documents in the same transaction as the mutation.
 * A later permission check cannot roll back a commit that already happened.
 * Call before returning an idempotency receipt as well as before new writes.
 */
export async function assertTransactionActor({tx,db,snapshotId,scope,runtime,deny}:{
 tx:any;db:any;snapshotId:string;scope:Scope;runtime:any;
 deny:()=>never;
}):Promise<void>{
 if(!safe(scope.uid)||!['narrador','jogador'].includes(scope.profile)||
    !ids(scope.memberHouseIds)||!ids(scope.editHouseIds))deny();
 const stage=db.collection('migrationDomainStage').doc(snapshotId);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const [archive,overlay]=await Promise.all([
  tx.get(stage.collection('access').doc(scope.uid)),
  tx.get(root.collection('accountAccess').doc(scope.uid)),
 ]);
 let access:any;
 try{
  access=chooseCurrentAccountAccess(scope.uid,
   archive.exists?archive.data():null,overlay.exists?overlay.data():null,runtime);
 }catch{deny();}
 if(!access||access.userId!==scope.uid||access.active!==true||
    access.requirePasswordChange!==false||access.profile!==scope.profile||
    access.admin!==(scope.profile==='narrador')||
    (access.playerId??null)!==scope.playerId)deny();
 const members=access.memberHouseIds??[],edit=access.editHouseIds??[];
 if(!ids(members)||!ids(edit)||edit.some((id:string)=>!members.includes(id))||
    !same(members,scope.memberHouseIds)||!same(edit,scope.editHouseIds))deny();
 if(scope.profile==='jogador'){
  const houseDocuments=await Promise.all(members.map((id:string)=>
   tx.get(stage.collection('houses').doc(
    createHash('sha256').update('house:'+id).digest('hex')))));
  if(!activeSeason2HouseScopeValid({
   memberHouseIds:members,editHouseIds:edit,houseDocuments,
  }))deny();
 }
}
