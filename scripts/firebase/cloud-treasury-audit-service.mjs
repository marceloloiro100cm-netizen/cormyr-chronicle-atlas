/** Verified read-only Treasury audit history for an already reconciled
 * Firebase Cloud runtime. Never reads secret notes or mutates migration
 * snapshots. Player responses omit actor identity and private reasons.
 */
import {createHash} from 'node:crypto';

const SHA=/^[a-f0-9]{64}$/;
const SAFE=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const ID64=/^[a-f0-9]{64}$/;
const MAX_TREASURY=1_000_000_000;
const MAX_LEDGER=500;
const PAGE_SIZE=50;
const sha=v=>createHash('sha256').update(v).digest('hex');
const validId=v=>typeof v==='string'&&SAFE.test(v);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const forbidden=(code,status=403)=>{throw new CloudTreasuryAuditError(code,status);};

export class CloudTreasuryAuditError extends Error{
  constructor(code,status=403){
    super(code);this.name='CloudTreasuryAuditError';
    this.code=code;this.status=status;
  }
}
function actorFor(uid,doc,houseId){
  if(!doc||doc.userId!==uid||doc.active!==true||
     doc.requirePasswordChange!==false||
     !Array.isArray(doc.memberHouseIds)||!Array.isArray(doc.editHouseIds)||
     doc.memberHouseIds.some(id=>!validId(id))||
     doc.editHouseIds.some(id=>!validId(id))||
     doc.editHouseIds.some(id=>!doc.memberHouseIds.includes(id)))
    forbidden('access_denied');
  if(doc.profile==='narrador'&&doc.admin===true)
    return 'narrador';
  if(doc.profile==='jogador'&&doc.admin===false&&
     doc.memberHouseIds.includes(houseId))
    return 'jogador';
  forbidden('access_denied');
}
function ready(doc,snapshot){
  const v=doc?.data();
  if(!doc?.exists||v?.status!=='active'||v.private!==true||
     v.sourceSnapshotId!==snapshot||
     v.sourceSnapshotReconciled!==true||
     v.treasurySeededVerified!==true)
    forbidden('treasury_audit_unavailable',503);
}
function verifiedData(t,house,sheet,houseId,snapshot){
  if(house?.sourceId!==houseId||house.active!==true||house.season!==2)
    forbidden('house_unavailable',404);
  if(sheet?.houseId!==houseId||sheet.state?.houseId!==houseId||
     !integer(sheet.version,0,2147483647)||
     !integer(sheet.state?.treasury,0,MAX_TREASURY))
    forbidden('house_sheet_unavailable',503);
  if(!t||t.houseId!==houseId||t.status!=='active'||t.private!==true||
     t.sourceSnapshotId!==snapshot||t.sourceReconciled!==true||
     t.sourceSheetVersion!==sheet.version||
     !integer(t.balance,0,MAX_TREASURY)||
     !integer(t.version,0,MAX_LEDGER)||
     (t.version===0&&t.balance!==sheet.state.treasury))
    forbidden('treasury_audit_unverified',503);
}
function verifyLedger(docs,sourceBalance,balance,version,houseId,snapshot){
  if(docs.length!==version)forbidden('treasury_audit_unverified',503);
  const records=docs.map(d=>{
    const v=d.data();
    if(!d.exists||!v||v.id!==d.id||!ID64.test(d.id)||
       v.sourceSnapshotId!==snapshot||v.houseId!==houseId||
       v.action!=='adjust'||!validId(v.actorUid)||
       !integer(v.expectedVersion,0,MAX_LEDGER)||
       !integer(v.version,1,MAX_LEDGER)||
       !integer(v.before,0,MAX_TREASURY)||
       !integer(v.after,0,MAX_TREASURY)||
       !integer(v.delta,-10000,10000)||v.delta===0||
       v.after!==v.before+v.delta||
       v.expectedVersion!==v.version-1||
       typeof v.campaignDate!=='string'||v.campaignDate.length>80||
       !/^\d{4}-(?:\d{2}-\d{2}|F-[a-zA-Z0-9_-]{1,48})$/.test(v.campaignDate)||
       typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))||
       typeof v.reason!=='string'||!v.reason.trim()||
       Buffer.byteLength(v.reason,'utf8')>500)
      forbidden('treasury_audit_unverified',503);
    return v;
  }).sort((a,b)=>a.version-b.version);
  let current=sourceBalance;
  for(let index=0;index<records.length;index++){
    const v=records[index];
    if(v.version!==index+1||v.before!==current)
      forbidden('treasury_audit_unverified',503);
    current=v.after;
  }
  if(current!==balance)forbidden('treasury_audit_unverified',503);
  return records;
}
export function createFirebaseTreasuryAudit({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
}){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    forbidden('firebase_treasury_audit_disabled',503);
  const stage=db.collection('migrationDomainStage').doc(snapshotId);
  const authStage=db.collection('migrationAuthStage').doc(snapshotId);
  const noble=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  async function uidFor(token){
    if(typeof token!=='string'||token.length<10||token.length>10000)
      forbidden('authentication_required',401);
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(token,true);
      if(!validId(decoded?.uid))forbidden('authentication_required',401);
      user=await auth.getUser(decoded.uid);
    }catch{forbidden('authentication_required',401);}
    if(user?.uid!==decoded.uid||user.disabled===true)
      forbidden('authentication_required',401);
    return decoded.uid;
  }
  return {
    async list(token,houseId){
      const uid=await uidFor(token);
      if(!validId(houseId))forbidden('invalid_house',400);
      return db.runTransaction(async tx=>{
        const rootTreasury=runtime.collection('houseTreasuries')
          .doc(sha('house:'+houseId));
        const references=[
          stage,authStage,noble,
          stage.collection('access').doc(uid),
          stage.collection('houses').doc(sha('house:'+houseId)),
          noble.collection('sheets').doc(sha('noble-sheet:'+houseId)),
          runtime,rootTreasury,
        ];
        const docs=await Promise.all(references.map(r=>tx.get(r)));
        const role=actorFor(uid,docs[3]?.data(),houseId);
        if(docs.slice(0,3).some(d=>!d.exists||
           d.data()?.status!=='complete'||d.data()?.private!==true))
          forbidden('migration_stage_not_ready',503);
        ready(docs[6],snapshotId);
        if(!docs[4]?.exists||!docs[5]?.exists||!docs[7]?.exists)
          forbidden('treasury_audit_unavailable',503);
        const state=docs[7].data();
        verifiedData(state,docs[4].data(),docs[5].data(),
          houseId,snapshotId);
        // One indexed, House-scoped query. No foreign House audit stream is
        // read, and excessive histories fail closed until pagination exists.
        const query=runtime.collection('houseTreasuryAudits')
          .where('houseId','==',houseId).limit(MAX_LEDGER+1);
        const history=await tx.get(query);
        if(history.size>MAX_LEDGER)
          forbidden('treasury_audit_requires_pagination',503);
        const all=verifyLedger(history.docs,
          docs[5].data().state.treasury,state.balance,state.version,
          houseId,snapshotId);
        const recent=all.slice(-PAGE_SIZE).reverse().map(v=>({
          version:v.version,delta:v.delta,before:v.before,after:v.after,
          campaignDate:v.campaignDate,createdAt:v.createdAt,
          ...(role==='narrador'
            ?{reason:v.reason,actorUid:v.actorUid}:{}),
        }));
        return {houseId,balance:state.balance,version:state.version,
          total:all.length,truncated:all.length>PAGE_SIZE,
          items:recent,verifiedChain:true,readOnly:true};
      });
    },
  };
}
