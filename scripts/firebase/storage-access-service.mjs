/**
 * Storage access service. Firestore Emulator ONLY; no public endpoint. It
 * authenticates the ID token, resolves the actor from the server-side access
 * and player docs and the facts that live in the staged noble-house and
 * newspaper domains, then asks the pure core (storage-access-core.mjs).
 *
 * Facts owned by domains that are not resolved here (readable letters and
 * records that embed an image, the reviewed public gallery, the newspaper
 * asset predicates) come from the injected `resolvers`. A missing resolver
 * means "false", so the service can only deny more, never allow more.
 * Anonymous callers (no token) are allowed to ask only for the public gallery
 * read; an invalid token is a denial, never anonymous.
 */
import {createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId} from './stage-noble-house-emulator.mjs';
import {newspaperScope} from './newspaper-core.mjs';
import {canAccess,StorageAccessError,BUCKETS} from './storage-access-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const sha=(t,id)=>createHash('sha256').update(t+':'+id).digest('hex');
const ids=v=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.length>0);
const RESOLVERS=['referencedByReadableContent','publicGalleryImage','newspaperAssetReadable','newspaperAssetUploadAllowed'];

export function createEmulatorStorageAccessService({db,auth,snapshotId,resolvers={},env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.collection!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated storage configuration');
  for(const k of Object.keys(resolvers))
    if(!RESOLVERS.includes(k)||typeof resolvers[k]!=='function')throw Error('Invalid storage resolver: '+k);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=domain.collection('access'),players=domain.collection('players');
  const sheets=db.collection(NOBLE_ROOT).doc(snapshotId).collection('sheets');
  const deny=()=>new StorageAccessError('denied','Acesso negado');

  const resolveActor=async idToken=>{
    let uid;
    try{uid=(await auth.verifyIdToken(idToken)).uid;}catch{throw deny();}
    const raw=(await access.doc(uid).get()).data();
    let player=null;
    if(raw&&typeof raw.playerId==='string'&&raw.playerId)
      player=(await players.doc(sha('player',raw.playerId)).get()).data()||null;
    let scope;
    try{scope=newspaperScope({uid,access:raw,player});}catch{throw deny();}
    const narrator=raw.profile==='narrador'&&raw.admin===true;
    if(!narrator&&(raw.profile!=='jogador'||raw.admin!==false||!ids(raw.memberHouseIds)||!ids(raw.editHouseIds)))
      throw deny();
    return {scope,actor:{
      role:narrator?'narrador':'jogador',uid,
      playerId:typeof raw.playerId==='string'&&raw.playerId?raw.playerId:null,
      memberHouseIds:narrator?new Set():new Set(raw.memberHouseIds),
      editHouseIds:narrator?new Set():new Set(raw.editHouseIds)}};
  };

  /** The house whose sheet names this exact path as its crest, or null. */
  const crestHouseOf=async name=>{
    const m=/^house-crests\/([^/]+)\//.exec(name);
    if(!m)return null;
    const s=await sheets.doc(sheetDocId(m[1])).get();
    const crest=s.exists?s.data()?.state?.identity?.crestPath:null;
    return crest===name?m[1]:null;
  };

  const ask=async(k,args)=>{
    const f=resolvers[k];
    if(!f)return false;
    return (await f(args))===true;
  };

  return {
    /** @returns {Promise<true>} or throws StorageAccessError('denied'). */
    async authorize({idToken=null,op,bucket,name}){
      let actor=null,scope=null;
      if(idToken!==null&&idToken!==undefined)({actor,scope}=await resolveActor(idToken));
      const base={uid:actor?.uid??null,op,bucket,name};
      const facts={publicGalleryImage:false};
      if(bucket===BUCKETS.images&&op==='read')facts.publicGalleryImage=await ask('publicGalleryImage',base);
      if(actor){
        facts.canEditNewspaper=scope.canEdit===true;
        if(bucket===BUCKETS.images&&op==='read'){
          facts.referencedByReadableContent=await ask('referencedByReadableContent',{...base,actor,scope});
          facts.crestHouseId=(await crestHouseOf(name))??undefined;
        }
        if(bucket===BUCKETS.newspapers){
          if(op==='read')facts.newspaperAssetReadable=await ask('newspaperAssetReadable',{...base,actor,scope});
          if(op==='upload')facts.newspaperAssetUploadAllowed=await ask('newspaperAssetUploadAllowed',{...base,actor,scope});
        }
      }
      if(!canAccess({actor,op,bucket,name,facts}))throw deny();
      return true;
    },
  };
}
