/* eslint-disable @typescript-eslint/no-explicit-any -- Firestore Admin valida as fontes. */
/**
 * Item 10: pedidos pagos de notícias na economia operacional Firebase.
 * Sem Supabase, sem reescrever a importação e sem autoconceder permissões.
 */
import {randomUUID,createHash} from 'node:crypto';
import {constructionStateHash} from '../house/firebase-construction-transaction';
import {verifiedEconomicState,calculateFirebaseHouseEconomy}
 from '../house/firebase-economic-readonly';
import {chooseCurrentAccountAccess}
 from '../../../scripts/firebase/operational-account-access.mjs';
import {commissionStory,rejectCommission,commissionRow,markCommissionsSeen,
 NewspaperError} from '../../../scripts/firebase/newspaper-core.mjs';
import type {Scope} from '../firebase-workspace/service';

const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const valid=(x:unknown):x is string=>typeof x==='string'&&ID.test(x);
export class FirebaseCommissionError extends Error{
 constructor(readonly code:string,readonly status=403){super(code);}
}
const fail=(code:string,status=403):never=>{
 throw new FirebaseCommissionError(code,status);
};
const active=(d:any)=>d?.exists===true&&d.data()?.status==='complete'&&
 d.data()?.private===true;
const rootFor=(db:any,snapshotId:string)=>
 db.collection('campaignCloudRuntime').doc(snapshotId);
const rowScope=(actor:Scope)=>({
 uid:actor.uid,admin:actor.profile==='narrador',
 canEdit:actor.profile==='editor'||actor.profile==='narrador',
 memberHouseIds:new Set(actor.memberHouseIds),
 editHouseIds:new Set(actor.editHouseIds),
});
const assertRuntime=(v:any,snapshotId:string,write=false)=>{
 if(!v||v.status!=='active'||v.private!==true||
 v.sourceSnapshotId!==snapshotId||v.sourceSnapshotReconciled!==true||
 v.applicationEnabled!==true||
 v.newspaperCommissionsReadApproved!==true||
 (write&&v.newspaperWriteApproved!==true)||
 (write&&v.newspaperCommissionsWriteApproved!==true))
  fail('newspaper_commissions_not_approved',503);
};
async function currentActor(tx:any,db:any,root:any,snapshot:string,actor:Scope){
 const source=db.collection('migrationDomainStage').doc(snapshot);
 const [domain,auth,noble,rt,archived,overlay]=await Promise.all([
  tx.get(source),
  tx.get(db.collection('migrationAuthStage').doc(snapshot)),
  tx.get(db.collection('migrationNobleHouseStage').doc(snapshot)),
  tx.get(root),
  tx.get(source.collection('access').doc(actor.uid)),
  tx.get(root.collection('accountAccess').doc(actor.uid)),
 ]);
 if(![domain,auth,noble].every(active))
  fail('newspaper_source_unavailable',503);
 assertRuntime(rt.data(),snapshot,true);
 let current:any;
 try{current=chooseCurrentAccountAccess(actor.uid,
  archived.exists?archived.data():null,
  overlay.exists?overlay.data():null,rt.data());}
 catch{fail('newspaper_scope_invalid');}
 if(!current||current.userId!==actor.uid||current.active!==true||
  current.requirePasswordChange!==false||current.profile!==actor.profile||
  (actor.profile==='narrador')!==(current.admin===true)||
  (actor.profile==='jogador'&&(
    current.playerId!==actor.playerId||
    JSON.stringify(current.memberHouseIds)!==JSON.stringify(actor.memberHouseIds)||
    JSON.stringify(current.editHouseIds)!==JSON.stringify(actor.editHouseIds))))
  fail('newspaper_scope_invalid');
 if(actor.profile==='editor'&&
   (current.memberHouseIds?.length||current.editHouseIds?.length))
  fail('newspaper_scope_invalid');
 return {root,source,noble,live:rt.data()};
}
const money=(doc:any,original:any,houseId:string,snapshot:string)=>{
 const raw=doc.data(),src=original.data();
 if(!doc.exists||!original.exists||
    raw?.houseId!==houseId||src?.houseId!==houseId||
    raw?.status!=='active'||raw?.private!==true||
    raw?.sourceSnapshotId!==snapshot||raw?.sourceReconciled!==true||
    raw?.seedVerified!==true||raw?.sourceSheetVersion!==src.version||
    raw?.sourceStateHash!==constructionStateHash(src.state)||
    raw?.stateHash!==constructionStateHash(raw.state)||
    !Number.isSafeInteger(raw?.version)||!raw.state||
    !verifiedEconomicState(raw.state)||
    !calculateFirebaseHouseEconomy(raw.state))
  fail('newspaper_house_unreconciled',503);
 return raw;
};
const clean=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const checkedCommission=(v:any,id:string,snapshot:string)=>{
 if(!v||v.id!==id||v.sourceSnapshotId!==snapshot||
  !UUID.test(id)||!valid(v.houseId)||!valid(v.requestedBy)||
  !['pending','published','rejected'].includes(v.state)||
  v.costWealth!==1||!UUID.test(String(v.requestKey)))
  fail('newspaper_commission_invalid',503);
 return v;
};
const convert=(e:unknown):never=>{
 if(e instanceof NewspaperError){
  const status=e.code==='conflict'?409:e.code==='invalid'?400:403;
  fail('newspaper_'+e.code,status);
 }
 throw e;
};
export function createFirebaseCommissions({db,snapshotId,actor}:{
 db:any;snapshotId:string;actor:Scope;
}){
 if(process.env['CORMYR_FIREBASE_NEWSPAPER_COMMISSIONS_ENABLED']!=='true')
  fail('newspaper_commissions_disabled',501);
 if(!/^[a-f0-9]{64}$/.test(snapshotId)||actor.profile==='editor'&&actor.memberHouseIds.length>0)
  fail('newspaper_scope_invalid',403);
 const root=rootFor(db,snapshotId),commissions=root.collection('newspaperCommissions');
 const economy=(h:string)=>root.collection('houseEconomies').doc(hash('house:'+h));
 const sourceHouse=(h:string)=>db.collection('migrationDomainStage').doc(snapshotId)
  .collection('houses').doc(hash('house:'+h));
 const sourceSheet=(h:string)=>db.collection('migrationNobleHouseStage').doc(snapshotId)
  .collection('sheets').doc(hash('noble-sheet:'+h));
 const audit=root.collection('newspaperCommissionAudits');
 const ledger=root.collection('houseOperationLedger');
 const requests=root.collection('newspaperCommissionRequests');
 const houseValid=(v:any,h:string)=>v?.exists&&v.data()?.sourceId===h&&
  v.data()?.active===true&&v.data()?.season===2;
 return {
  async commission(args:Record<string,unknown>,historical:Record<string,unknown>[]){
   if(actor.profile==='editor'||!clean(args)||Object.keys(args).some(k=>
      !['p_house','p_title','p_body','p_image_path','p_key'].includes(k)))
    fail('newspaper_request_invalid',400);
   const h=args['p_house'] as string,key=args['p_key'] as string;
   if(!valid(h)||!UUID.test(String(key)))fail('newspaper_request_invalid',400);
   if(args['p_image_path']!==null&&args['p_image_path']!==undefined)
    fail('newspaper_image_storage_pending',501);
   const fingerprint=hash(JSON.stringify([actor.uid,h,key,args['p_title'],args['p_body']]));
   const requestRef=requests.doc(hash('commission:'+actor.uid+':'+key));
   return db.runTransaction(async(tx:any)=>{
    await currentActor(tx,db,root,snapshotId,actor);
    const [house,source,economic,prior,cloudRows]=await Promise.all([
     tx.get(sourceHouse(h)),tx.get(sourceSheet(h)),tx.get(economy(h)),
     tx.get(requestRef),tx.get(commissions.where('houseId','==',h).limit(501)),
    ]);
    if(!houseValid(house,h))fail('newspaper_house_unavailable',404);
    if(actor.profile!=='narrador'&&!actor.editHouseIds.includes(h))
     fail('newspaper_scope_invalid');
    const moneyRow=money(economic,source,h,snapshotId);
    if(prior.exists){
     const saved=prior.data();
     if(saved?.fingerprint!==fingerprint||saved?.actorUid!==actor.uid)
      fail('newspaper_key_conflict',409);
     return {...saved.result,alreadyApplied:true};
    }
    if(cloudRows.docs.length>500)fail('newspaper_commissions_limit',503);
    const originalPending=historical.filter(c=>c['house_id']===h&&c['state']==='pending').length;
    const pending=cloudRows.docs.filter((d:any)=>d.data()?.state==='pending').length;
    const ledgerRef=ledger.doc(hash('newspaper-commission:'+actor.uid+':'+key));
    const oldLedger=await tx.get(ledgerRef);
    try{
     const r=commissionStory({
      scope:rowScope(actor),houseId:h,title:args['p_title'],body:args['p_body'],
      imagePath:null,key,sheet:moneyRow,existingByKey:null,
      ledgerKeyTaken:oldLedger.exists,pendingCount:originalPending+pending,
      newId:randomUUID,now:new Date().toISOString(),
     });
     if(r.alreadyApplied||!r.commission||!r.sheet||!r.ledger)
      fail('newspaper_key_conflict',409);
     const next=verifiedEconomicState(r.sheet.state);
     if(!next||!calculateFirebaseHouseEconomy(next)||
        r.sheet.version!==moneyRow.version+1||
        constructionStateHash(next)===moneyRow.stateHash)
      fail('newspaper_wealth_invalid',409);
     const at=r.commission.createdAt;
     tx.update(economy(h),{state:next,version:r.sheet.version,
      stateHash:constructionStateHash(next),updatedBy:actor.uid,updatedAt:at});
     const result={...r.result};
     tx.create(commissions.doc(r.commission.id),{
      ...r.commission,sourceSnapshotId:snapshotId});
     tx.create(ledgerRef,{...r.ledger,id:ledgerRef.id,sourceSnapshotId:snapshotId,
      beforeStateHash:moneyRow.stateHash,afterStateHash:constructionStateHash(next)});
     tx.create(requestRef,{actorUid:actor.uid,fingerprint,result,at,
      sourceSnapshotId:snapshotId});
     tx.create(audit.doc(hash('commission:'+r.commission.id)),{
      action:'newspaper_commission',actorUid:actor.uid,
      commissionId:r.commission.id,houseId:h,houseVersion:r.sheet.version,
      beforeStateHash:moneyRow.stateHash,
      afterStateHash:constructionStateHash(next),occurredAt:at});
     return result;
    }catch(e){return convert(e);}
   });
  },
  async reject(args:Record<string,unknown>){
   if(!['narrador','editor'].includes(actor.profile)||!clean(args)||
      Object.keys(args).some(k=>!['p_commission','p_note'].includes(k))||
      !UUID.test(String(args['p_commission'])))
    fail('newspaper_request_invalid',400);
   const id=args['p_commission'] as string,ref=commissions.doc(id);
   return db.runTransaction(async(tx:any)=>{
    await currentActor(tx,db,root,snapshotId,actor);
    const doc=await tx.get(ref);
    if(!doc.exists)fail('newspaper_commission_not_operational',404);
    const old=checkedCommission(doc.data(),id,snapshotId);
    if(old.state==='rejected'){
     if(old.rejectionNote===String(args['p_note']).trim()&&old.rejectedBy===actor.uid)
      return {commissionId:id,refunded:1,duplicate:true};
     fail('newspaper_commission_closed',409);
    }
    if(old.state!=='pending')fail('newspaper_commission_closed',409);
    const h=old.houseId;
    const [house,source,economic]=await Promise.all([
     tx.get(sourceHouse(h)),tx.get(sourceSheet(h)),tx.get(economy(h)),
    ]);
    if(!houseValid(house,h))fail('newspaper_house_unavailable',404);
    const row=money(economic,source,h,snapshotId);
    const ledgerRef=ledger.doc(hash('newspaper-refund:'+id));
    const existing=await tx.get(ledgerRef);
    try{
     const r=rejectCommission({
      scope:rowScope(actor),commission:old,note:args['p_note'],
      sheet:row,ledgerKey:'newspaper-refund:'+id,now:new Date().toISOString(),
     });
     if(existing.exists||!r.commission||!r.sheet||!r.ledger)
      fail('newspaper_key_conflict',409);
     const next=verifiedEconomicState(r.sheet.state);
     if(!next||!calculateFirebaseHouseEconomy(next)||
        r.sheet.version!==row.version+1)
      fail('newspaper_wealth_invalid',409);
     const at=r.commission.rejectedAt;
     tx.update(economy(h),{state:next,version:r.sheet.version,
      stateHash:constructionStateHash(next),updatedBy:actor.uid,updatedAt:at});
     tx.update(ref,r.commission);
     tx.create(ledgerRef,{...r.ledger,sourceSnapshotId:snapshotId,
      beforeStateHash:row.stateHash,afterStateHash:constructionStateHash(next)});
     tx.create(audit.doc(hash('reject:'+id)),{
      action:'newspaper_reject',actorUid:actor.uid,commissionId:id,
      houseId:h,houseVersion:r.sheet.version,occurredAt:at});
     return r.result;
    }catch(e){return convert(e);}
   });
  },
  async markSeen(args:Record<string,unknown>){
   if(!clean(args)||Object.keys(args).some(k=>k!=='p_house')||
     !valid(args['p_house']))fail('newspaper_request_invalid',400);
   const h=args['p_house'] as string;
   if(actor.profile==='editor')fail('newspaper_scope_invalid');
   return db.runTransaction(async(tx:any)=>{
    await currentActor(tx,db,root,snapshotId,actor);
    if(actor.profile!=='narrador'&&!actor.memberHouseIds.includes(h))
     fail('newspaper_scope_invalid');
    const [house,snapshot]=await Promise.all([
     tx.get(sourceHouse(h)),tx.get(commissions.where('houseId','==',h).limit(501)),
    ]);
    if(!houseValid(house,h))fail('newspaper_house_unavailable',404);
    if(snapshot.docs.length>500)fail('newspaper_commissions_limit',503);
    const items=snapshot.docs.map((d:any)=>checkedCommission(d.data(),d.id,snapshotId));
    const seen=markCommissionsSeen({scope:rowScope(actor),houseId:h,
     commissions:items,now:new Date().toISOString()});
    for(const item of seen)tx.update(commissions.doc(item.id),{seenAt:item.seenAt});
    if(seen.length)tx.create(audit.doc(randomUUID()),{action:'newspaper_seen',
     actorUid:actor.uid,houseId:h,commissionIds:seen.map((v:any)=>v.id),
     occurredAt:seen[0].seenAt,sourceSnapshotId:snapshotId});
    return seen.length;
   });
  },
 };
}
export async function readFirebaseCommissions(db:any,snapshot:string,actor:Scope){
 if(process.env['CORMYR_FIREBASE_NEWSPAPER_COMMISSIONS_ENABLED']!=='true')return [];
 const root=rootFor(db,snapshot),rt=await root.get();
 if(!rt.exists)return [];
 assertRuntime(rt.data(),snapshot);
 const docs=await root.collection('newspaperCommissions').limit(501).get();
 if(docs.docs.length>500)fail('newspaper_commissions_limit',503);
 return docs.docs.map((d:any)=>{
  const item=checkedCommission(d.data(),d.id,snapshot);
  return commissionRow(item);
 }).filter((v:any)=>actor.profile==='editor'||actor.profile==='narrador'||
  actor.memberHouseIds.includes(v.house_id));
}
