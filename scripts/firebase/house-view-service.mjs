/**
 * Minimal, authorized read model for the noble-house panel in the Firebase
 * migration emulator. Never give a roster affiliation any permissions.
 */
import {createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {sheetDocId} from './stage-noble-house-emulator.mjs';

const PROJECT='demo-cormyr-migration', HASH=/^[a-f0-9]{64}$/;
const houseDocId=x=>createHash('sha256').update('house:'+x).digest('hex');

export function readableHouseScope(uid,access,houseId){
  if(!access||access.userId!==uid||access.active!==true||
     access.requirePasswordChange===true)return false;
  if(access.profile==='narrador'&&access.admin===true)return true;
  return access.profile==='jogador'&&access.admin===false&&
    Array.isArray(access.memberHouseIds)&&access.memberHouseIds.includes(houseId);
}
export function safeHouseCatalog(uid,access,items){
  if(!access||access.userId!==uid||access.active!==true||
     access.requirePasswordChange===true)return [];
  if(!['narrador','editor','jogador'].includes(access.profile))return [];
  return items.filter(h=>h&&h.active===true&&
    h.season===2&&typeof h.sourceId==='string'&&typeof h.name==='string')
    .map(h=>({id:h.sourceId,name:h.name}))
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

export function createEmulatorHouseViewService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    throw Error('Invalid House view configuration');
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=domain.collection('access'),houses=domain.collection('houses');
  const sheets=db.collection('migrationNobleHouseStage').doc(snapshotId).collection('sheets');
  const uidOf=async token=>{
    try{
      const c=await auth.verifyIdToken(token,true);
      const u=await auth.getUser(c.uid);
      if(u.uid===c.uid&&u.disabled!==true)return c.uid;
    }catch{}
    throw Error('Access denied');
  };
  const profile=async(uid,tx)=>{
    const [root,a]=await Promise.all([tx.get(domain),tx.get(access.doc(uid))]);
    const d=a.exists?a.data():null;
    if(!root.exists||root.data()?.status!=='complete'||
       !d||d.userId!==uid||d.active!==true||d.requirePasswordChange===true)
      throw Error('Access denied');
    return d;
  };
  return {
    async getProfile(idToken){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        const a=await profile(uid,tx);
        return {profile:a.profile,admin:a.profile==='narrador'&&a.admin===true,
          memberHouseIds:Array.isArray(a.memberHouseIds)?a.memberHouseIds:[],
          editHouseIds:Array.isArray(a.editHouseIds)?a.editHouseIds:[]};
      });
    },
    async listHouses(idToken){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        const a=await profile(uid,tx);
        const q=await tx.get(houses.where('active','==',true).limit(300));
        return safeHouseCatalog(uid,a,q.docs.map(d=>d.data()));
      });
    },
    async getHouse(idToken,houseId){
      if(typeof houseId!=='string'||!houseId||houseId.length>512)
        throw Error('Access denied');
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        const a=await profile(uid,tx);
        if(!readableHouseScope(uid,a,houseId))throw Error('Access denied');
        const [h,s]=await Promise.all([
          tx.get(houses.doc(houseDocId(houseId))),
          tx.get(sheets.doc(sheetDocId(houseId))),
        ]);
        if(!h.exists||!s.exists||h.data()?.active!==true)
          throw Error('Access denied');
        // No ledger, narrator notes or workbook exports in this projection.
        return {houseId,name:h.data().name,version:s.data().version,
          state:s.data().state};
      });
    },
  };
}
