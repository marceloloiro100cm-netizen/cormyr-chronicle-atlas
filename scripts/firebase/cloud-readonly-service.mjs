/**
 * Cormyr: Firebase Cloud-only, read-only campaign access.
 *
 * NO Supabase fallback. Never use a browser SDK for migration* collections.
 * Construct only on a trusted server with Firebase Admin Auth and Firestore.
 * This deliberately does not enable game writes, Drive, schedules or cutover.
 */
import {createHash} from 'node:crypto';

const SNAPSHOT=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[^/\u0000-\u001f]{1,128}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');

export class CloudAccessError extends Error {
  constructor(code,status=403){
    super(code);
    this.name='CloudAccessError';
    this.code=code;
    this.status=status;
  }
}
const deny=(code,status)=>{throw new CloudAccessError(code,status);};
const get=(db,root,snapshot,collection,id)=>
  db.collection(root).doc(snapshot).collection(collection).doc(id).get();

function cleanHouses(value){
  if(!Array.isArray(value)||value.length>250||value.some(
    id=>typeof id!=='string'||!SAFE_ID.test(id)
  ))deny('invalid_access_scope',403);
  return [...new Set(value)];
}

/**
 * Service must be supplied a FIXED, server-configured snapshot. There is no
 * caller-controlled snapshot selector, nor account/house claims in the token.
 */
export function createFirebaseCloudReadonly({auth,db,snapshotId,projectId,enabled=false,env=process.env}){
  if(enabled!==true||projectId!=='cormyr'||!SNAPSHOT.test(snapshotId||'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)
    deny('cloud_read_disabled',503);
  if(!auth||!db||typeof auth.verifyIdToken!=='function'||
     typeof auth.getUser!=='function')deny('invalid_server_configuration',503);

  async function stageReady(name){
    const snap=await db.collection(name).doc(snapshotId).get();
    if(!snap.exists||snap.data()?.status!=='complete'||snap.data()?.private!==true)
      deny('migration_stage_not_ready',503);
  }

  async function scopeFor(idToken){
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      deny('authentication_required',401);
    let token,user;
    try{
      token=await auth.verifyIdToken(idToken,true);
      if(typeof token?.uid!=='string'||!SAFE_ID.test(token.uid))
        deny('authentication_required',401);
      user=await auth.getUser(token.uid);
    }catch{deny('authentication_required',401);}
    if(user.disabled===true||user.uid!==token.uid)
      deny('authentication_required',401);
    await stageReady('migrationDomainStage');
    await stageReady('migrationAuthStage');
    const access=await get(db,'migrationDomainStage',snapshotId,'access',token.uid);
    const v=access.data();
    if(!access.exists||!v||v.userId!==token.uid||v.active!==true||
       v.requirePasswordChange!==false)deny('access_denied',403);
    if(!['jogador','editor','narrador'].includes(v.profile))deny('access_denied',403);
    if(v.profile==='narrador'&&v.admin!==true)deny('access_denied',403);
    if(v.profile!=='narrador'&&v.admin!==false)deny('access_denied',403);
    const memberHouseIds=cleanHouses(v.memberHouseIds);
    const editHouseIds=cleanHouses(v.editHouseIds);
    if(editHouseIds.some(id=>!memberHouseIds.includes(id)))deny('invalid_access_scope',403);
    if(v.profile==='editor'&&memberHouseIds.length)deny('invalid_access_scope',403);
    return {uid:token.uid,profile:v.profile,memberHouseIds,editHouseIds};
  }

  return {
    async session(idToken){
      const {profile,memberHouseIds}=await scopeFor(idToken);
      return {authenticated:true,profile,memberHouseIds,readOnly:true,
        snapshotReconciliationPending:true};
    },
    async listHouses(idToken){
      await scopeFor(idToken);
      const docs=await db.collection('migrationDomainStage')
        .doc(snapshotId).collection('houses').get();
      if(docs.size>250)deny('invalid_house_catalog',503);
      return docs.docs.map(d=>d.data()).filter(d=>
        d?.active===true&&typeof d.sourceId==='string'&&
        typeof d.name==='string'
      ).map(d=>({id:d.sourceId,name:d.name,castle:d.castle??null,
        crest:d.crest??null,season:d.season??null}));
    },
    async getHouse(idToken,houseId){
      const scope=await scopeFor(idToken);
      if(typeof houseId!=='string'||!SAFE_ID.test(houseId))
        deny('invalid_house',400);
      if(scope.profile!=='narrador'&&
        !(scope.profile==='jogador'&&scope.memberHouseIds.includes(houseId)))
        deny('access_denied',403);
      await stageReady('migrationNobleHouseStage');
      const house=await get(db,'migrationDomainStage',snapshotId,
        'houses',digest('house:'+houseId));
      const h=house.data();
      if(!house.exists||h?.sourceId!==houseId||h?.active!==true)
        deny('house_unavailable',404);
      const sheet=await get(db,'migrationNobleHouseStage',snapshotId,
        'sheets',digest('noble-sheet:'+houseId));
      const s=sheet.data();
      if(!sheet.exists||s?.houseId!==houseId||typeof s.state!=='object'||
         s.state===null||Array.isArray(s.state))deny('house_sheet_unavailable',404);
      return {id:houseId,name:h.name,castle:h.castle??null,crest:h.crest??null,
        state:s.state,version:s.version,readOnly:true,
        snapshotReconciliationPending:true};
    },
    async getCalendar(idToken){
      const scope=await scopeFor(idToken);
      if(scope.profile==='editor')deny('access_denied',403);
      await stageReady('migrationTimeEngineStage');
      const doc=await get(db,'migrationTimeEngineStage',snapshotId,
        'calendar','current');
      const d=doc.data();
      if(!doc.exists||!Number.isInteger(d?.year)||!Number.isInteger(d?.month)||
         !Number.isInteger(d?.day)||!Number.isInteger(d?.version))
        deny('calendar_unavailable',503);
      return {year:d.year,month:d.month,day:d.day,
        festival:d.festival??null,version:d.version,readOnly:true,
        snapshotReconciliationPending:true};
    },
  };
}
