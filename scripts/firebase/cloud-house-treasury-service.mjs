import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
/** Cloud-only noble House Treasury adjustments, authorized to the Narrator.
 * Imported migration stages are immutable. An independently reconciled
 * operational Treasury document MUST exist before any write.
 *
 * This concerns only HouseState.treasury. It never invents balances for the
 * seven noble resources or purchases/starts a holding or construction.
 */
import {createHash} from 'node:crypto';
import {chooseCurrentAccountAccess} from './operational-account-access.mjs';
import {validateHarptosDate,harptosKey} from './stage-temporal-emulator.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const MAX_TREASURY=1_000_000_000;
const hash=s=>createHash('sha256').update(s).digest('hex');
const validInt=(v,minimum,maximum)=>
  Number.isSafeInteger(v)&&v>=minimum&&v<=maximum;
const validId=v=>typeof v==='string'&&ID.test(v);
const fail=(code,status=403)=>{throw new CloudTreasuryError(code,status);};

export class CloudTreasuryError extends Error{
  constructor(code,status=403){
    super(code);this.name='CloudTreasuryError';this.code=code;this.status=status;
  }
}
function validateInput(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
     Object.keys(v).some(k=>!['requestKey','houseId','expectedVersion','delta','reason'].includes(k))||
     typeof v.requestKey!=='string'||!KEY.test(v.requestKey)||
     !validId(v.houseId)||
     !validInt(v.expectedVersion,0,2147483646)||
     !validInt(v.delta,-10000,10000)||v.delta===0||
     typeof v.reason!=='string'||!v.reason.trim()||
     Buffer.byteLength(v.reason,'utf8')>500)
    fail('invalid_treasury_request',400);
  return {
    requestKey:v.requestKey,houseId:v.houseId,
    expectedVersion:v.expectedVersion,delta:v.delta,reason:v.reason.trim(),
  };
}
const rootsReady=(docs)=>docs.every(d=>d.exists&&
  d.data()?.status==='complete'&&d.data()?.private===true);
const runtimeReady=(cfg,snapshot,calendar,mode='adjust')=>
  cfg?.status==='active'&&cfg.private===true&&
  cfg.sourceSnapshotId===snapshot&&cfg.sourceSnapshotReconciled===true&&
  cfg.applicationEnabled===true&&
  (mode==='summary'?cfg.treasuryReadApproved===true:
    cfg.treasuryWriteApproved===true)&&
  cfg.treasurySeededVerified===true&&
  validInt(cfg.calendarVersion,1,2147483647)&&
  cfg.calendarVersion===calendar.version;
function authorized(actor,uid,houseId,mode){
  if(actor?.userId!==uid||actor?.active!==true||
     actor?.requirePasswordChange!==false)
    fail(mode==='summary'?'access_denied':'narrator_only',403);
  if(actor.profile==='narrador'&&actor.admin===true){
    if(!Array.isArray(actor.memberHouseIds)||actor.memberHouseIds.length!==0||
       !Array.isArray(actor.editHouseIds)||actor.editHouseIds.length!==0)
      fail('invalid_access_scope',403);
    return;
  }
  if(mode!=='summary'||actor.profile!=='jogador'||
     actor.admin!==false||!validId(actor.playerId)||
     !Array.isArray(actor.memberHouseIds)||
     !Array.isArray(actor.editHouseIds)||
     actor.memberHouseIds.length>250||actor.editHouseIds.length>250||
     actor.memberHouseIds.some(v=>!validId(v))||
     actor.editHouseIds.some(v=>!validId(v)||!actor.memberHouseIds.includes(v))||
     !actor.memberHouseIds.includes(houseId))
    fail(mode==='summary'?'access_denied':'narrator_only',403);
}
function checkCalendar(c){
  if(!validInt(c?.version,1,2147483647)||
     !validInt(c?.year,1,9999)||
     !validateHarptosDate(c.year,c.month,c.day,c.festival??null))
    fail('calendar_unavailable',503);
  return harptosKey(c.year,c.month,c.day,c.festival??null);
}
function checkTreasury(t,sheet,houseId,snapshot){
  if(!t||t.status!=='active'||t.private!==true||
     t.sourceSnapshotId!==snapshot||t.sourceReconciled!==true||
     t.houseId!==houseId||!validInt(t.balance,0,MAX_TREASURY)||
     !validInt(t.version,0,2147483646)||
     t.sourceSheetVersion!==sheet.version||
     (t.version===0&&t.balance!==sheet.state.treasury))
    fail('treasury_source_not_reconciled',503);
}

export function createFirebaseCloudTreasury({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
  clock=()=>new Date().toISOString(),
}){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    fail('firebase_cloud_treasury_disabled',503);

  const stage=db.collection('migrationDomainStage').doc(snapshotId);
  const authStage=db.collection('migrationAuthStage').doc(snapshotId);
  const timeStage=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const nobleStage=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  const treasury=runtime.collection('houseTreasuries');
  const audits=runtime.collection('houseTreasuryAudits');

  async function actorUid(idToken){
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      fail('authentication_required',401);
    let decoded,person;
    try{
      decoded=await auth.verifyIdToken(idToken,true);
      if(!validId(decoded?.uid))fail('authentication_required',401);
      person=await auth.getUser(decoded.uid);
    }catch{fail('authentication_required',401);}
    if(person?.uid!==decoded.uid||person.disabled===true)
      fail('authentication_required',401);
    return decoded.uid;
  }
  async function approve(tx,uid,houseId,mode='adjust'){
    const houseRef=stage.collection('houses').doc(hash('house:'+houseId));
    const sheetRef=nobleStage.collection('sheets')
      .doc(hash('noble-sheet:'+houseId));
    const treasuryRef=treasury.doc(hash('house:'+houseId));
    // Read all documents before transaction writes.
    const [docs,overlay]=await Promise.all([
      Promise.all([
        tx.get(stage),tx.get(authStage),tx.get(timeStage),tx.get(nobleStage),
        tx.get(stage.collection('access').doc(uid)),
        tx.get(timeStage.collection('calendar').doc('current')),
        tx.get(runtime),tx.get(houseRef),tx.get(sheetRef),tx.get(treasuryRef),
      ]),
      tx.get(runtime.collection('accountAccess').doc(uid)),
    ]);
    const actor=chooseCurrentAccountAccess(uid,docs[4]?.data(),
      overlay.exists?overlay.data():null,docs[6]?.data());
    authorized(actor,uid,houseId,mode);
    if(!rootsReady(docs.slice(0,4)))
      fail('migration_stage_not_ready',503);
    const calendar=effectiveCloudCalendar(docs[5]?.data(),docs[6]?.data(),snapshotId);
    const campaignDate=checkCalendar(calendar);
    if(!runtimeReady(docs[6]?.data(),snapshotId,calendar,mode))
      fail('treasury_runtime_not_approved',503);
    const house=docs[7]?.data(),sheet=docs[8]?.data(),entry=docs[9]?.data();
    if(!docs[7]?.exists||!house||house.sourceId!==houseId||
       house.active!==true||house.season!==2)
      fail('house_unavailable',404);
    if(!docs[8]?.exists||sheet?.houseId!==houseId||
       !validInt(sheet.version,0,2147483647)||
       sheet.state?.houseId!==houseId||
       !validInt(sheet.state?.treasury,0,MAX_TREASURY))
      fail('house_sheet_unavailable',503);
    if(!docs[9]?.exists)fail('treasury_source_not_reconciled',503);
    checkTreasury(entry,sheet,houseId,snapshotId);
    return {treasuryRef,treasury:entry,campaignDate};
  }
  return {
    async summary(idToken,houseId){
      const uid=await actorUid(idToken);
      if(!validId(houseId))fail('invalid_house',400);
      try{
        return await db.runTransaction(async tx=>{
          const {treasury:t}=await approve(tx,uid,houseId,'summary');
          // Never return another House's identity, ledger or private audit.
          return {available:true,readOnly:true,balance:t.balance,
            version:t.version};
        });
      }catch(e){
        if(e instanceof CloudTreasuryError&&e.status===503)
          return {available:false,readOnly:true,balance:null,version:null};
        throw e;
      }
    },
    async status(idToken,houseId){
      const uid=await actorUid(idToken);
      if(!validId(houseId))fail('invalid_house',400);
      try{
        return await db.runTransaction(async tx=>{
          const {treasury:t}=await approve(tx,uid,houseId);
          return {enabled:true,canAdjust:true,readOnly:false,
            balance:t.balance,version:t.version};
        });
      }catch(e){
        if(e instanceof CloudTreasuryError&&e.status===503)
          return {enabled:false,canAdjust:false,readOnly:true,
            balance:null,version:null};
        throw e;
      }
    },
    async adjust(idToken,input){
      const uid=await actorUid(idToken);
      const req=validateInput(input);
      const fingerprint=hash(JSON.stringify(req));
      const id=hash('treasury-adjust:'+uid+':'+req.requestKey);
      const auditRef=audits.doc(id);
      return db.runTransaction(async tx=>{
        const {treasuryRef,treasury:t,campaignDate}=
          await approve(tx,uid,req.houseId);
        const previous=await tx.get(auditRef);
        if(previous.exists){
          const p=previous.data();
          if(p?.actorUid!==uid||p?.houseId!==req.houseId||
             p?.requestFingerprint!==fingerprint)
            fail('request_key_conflict',409);
          return {id,duplicate:true,houseId:req.houseId,
            balance:p.after,version:p.version};
        }
        if(req.expectedVersion!==t.version)
          fail('treasury_version_conflict',409);
        const balance=t.balance+req.delta;
        if(!validInt(balance,0,MAX_TREASURY))
          fail('treasury_out_of_bounds',409);
        const now=clock();
        if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
          fail('invalid_server_clock',503);
        tx.update(treasuryRef,{balance,version:t.version+1,updatedAt:now});
        tx.create(auditRef,{
          id,action:'adjust',sourceSnapshotId:snapshotId,
          actorUid:uid,houseId:req.houseId,
          requestFingerprint:fingerprint,requestKey:req.requestKey,
          reason:req.reason,delta:req.delta,before:t.balance,after:balance,
          expectedVersion:t.version,version:t.version+1,
          campaignDate,createdAt:now,
        });
        return {id,duplicate:false,houseId:req.houseId,
          balance,version:t.version+1};
      });
    },
  };
}

