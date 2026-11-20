/**
 * Regras personalizadas por Casa, em namespace operacional privado.
 * O catálogo e as fichas importados nunca são alterados.
 */
import {createHash} from 'node:crypto';
import {chooseCurrentAccountAccess} from './operational-account-access.mjs';

const SNAP=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const invalid=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
const validId=x=>typeof x==='string'&&ID.test(x);
const live=(root,snapshot)=>root?.status==='active'&&root.private===true&&
 root.applicationEnabled===true&&root.sourceSnapshotReconciled===true&&
 root.sourceSnapshotId===snapshot;
const rootReady=doc=>doc.exists&&doc.data()?.status==='complete'&&doc.data()?.private===true;
const definitionsFor=(db,snapshot,houseId)=>
 db.collection('campaignCloudRuntime').doc(snapshot).collection('houseRuleSets')
  .doc(hash('house:'+houseId)).collection('rules');

export async function readOperationalHouseRules(db,snapshotId,houseId){
 if(!SNAP.test(snapshotId)||!validId(houseId))invalid('invalid_house_scope',400);
 const root=await db.collection('campaignCloudRuntime').doc(snapshotId).get();
 if(!root.exists||!live(root.data(),snapshotId))invalid('house_rules_runtime_unavailable',503);
 const docs=await definitionsFor(db,snapshotId,houseId).limit(101).get();
 if(!Array.isArray(docs.docs)||docs.docs.length>100)invalid('house_rules_limit_exceeded',503);
 const result=[];
 for(const doc of docs.docs){
  const d=doc.data();
  if(!d||d.houseId!==houseId||d.sourceSnapshotId!==snapshotId||
    !validId(d.itemId)||
    doc.id!==hash('rule:'+d.itemId)||
    !Number.isSafeInteger(d.version)||d.version<1||d.version>2147483646||
    !d.definition||d.definition.id!==d.itemId||
    d.definition.custom!==true||!live(root.data(),snapshotId))
   invalid('house_rules_integrity_failed',503);
  result.push({definition:d.definition,version:d.version});
 }
 return result;
}
export function createFirebaseHouseRulesService({db,auth,snapshotId,
 projectId,enabled=false,env=process.env,clock=()=>new Date().toISOString()}={}){
 if(enabled!==true||projectId!=='cormyr'||!SNAP.test(snapshotId??'')||
   env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
   typeof db?.runTransaction!=='function'||
   typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
  invalid('house_rules_disabled',503);
 const source=db.collection('migrationDomainStage').doc(snapshotId);
 const authRoot=db.collection('migrationAuthStage').doc(snapshotId);
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 async function save(token,request){
  if(typeof token!=='string'||token.length<10||token.length>10000)
   invalid('authentication_required',401);
  let actor,user;
  try{actor=await auth.verifyIdToken(token,true);
   user=await auth.getUser(actor.uid);}catch{invalid('authentication_required',401);}
  if(!validId(actor?.uid)||user?.uid!==actor.uid||user.disabled===true)
   invalid('authentication_required',401);
  const uid=actor.uid;
  if(!request||typeof request!=='object'||Array.isArray(request)||
    !validId(request.houseId)||typeof request.requestKey!=='string'||
    !KEY.test(request.requestKey)||!Number.isSafeInteger(request.expectedVersion)||
    request.expectedVersion<0||request.expectedVersion>2147483646||
    !request.definition||!validId(request.definition.id)||
    request.definition.custom!==true)
   invalid('invalid_house_rule_request',400);
  const {houseId,requestKey,expectedVersion,definition}=request;
  if(Buffer.byteLength(JSON.stringify(definition),'utf8')>30000)
   invalid('house_rule_too_large',413);
  const digest=hash(JSON.stringify([houseId,expectedVersion,definition]));
  const set=definitionsFor(db,snapshotId,houseId);
  const item=set.doc(hash('rule:'+definition.id));
  const req=runtime.collection('houseRuleRequests')
    .doc(hash('rule-request:'+uid+':'+requestKey));
  const audit=runtime.collection('houseRuleAudits')
    .doc(hash('rule-audit:'+uid+':'+requestKey));
  const now=clock();
  return db.runTransaction(async tx=>{
   // Todas as leituras antecedem qualquer escrita Firestore.
   const [s,a,liveDoc,old,previous,actorDoc,overlay,house]=await Promise.all([
    tx.get(source),tx.get(authRoot),tx.get(runtime),
    tx.get(item),tx.get(req),
    tx.get(source.collection('access').doc(uid)),
    tx.get(runtime.collection('accountAccess').doc(uid)),
    tx.get(source.collection('houses').doc(hash('house:'+houseId))),
   ]);
   if(!rootReady(s)||!rootReady(a)||!live(liveDoc.data(),snapshotId)||
     liveDoc.data()?.houseRulesWriteApproved!==true)
    invalid('house_rules_not_approved',503);
   const current=chooseCurrentAccountAccess(uid,actorDoc.data(),
    overlay.exists?overlay.data():null,liveDoc.data());
   if(current?.userId!==uid||current.profile!=='narrador'||
      current.admin!==true||current.active!==true||
      current.requirePasswordChange!==false||
      current.memberHouseIds?.length!==0||current.editHouseIds?.length!==0)
    invalid('narrator_required',403);
   if(!house.exists||house.data()?.sourceId!==houseId||
     house.data()?.active!==true||house.data()?.season!==2)
    invalid('house_not_found',404);
   if(previous.exists){
    const p=previous.data();
    if(p.uid!==uid||p.digest!==digest||p.houseId!==houseId||
       p.itemId!==definition.id)invalid('request_key_conflict',409);
    if(old.data()?.version!==p.version)invalid('request_superseded',409);
    return {...p.result,duplicate:true};
   }
   const version=old.exists?old.data()?.version:0;
   if(!Number.isSafeInteger(version)||version!==expectedVersion)
    invalid('version_conflict',409);
   if(old.exists&&(old.data()?.itemId!==definition.id||
      old.data()?.houseId!==houseId))
    invalid('rule_integrity_failed',503);
   const next=version+1;
   const result={message:'Adaptação da Casa salva. Custos históricos preservados.',
    houseId,itemId:definition.id,version:next,duplicate:false};
   tx.set(item,{houseId,itemId:definition.id,definition,
     version:next,updatedAt:now,updatedBy:uid,sourceSnapshotId:snapshotId});
   tx.create(req,{uid,houseId,itemId:definition.id,version:next,digest,result,at:now});
   tx.create(audit,{actorUid:uid,houseId,itemId:definition.id,
     action:'house_rule_save',fromVersion:version,toVersion:next,
     requestKeyDigest:hash(requestKey),at:now});
   return result;
  });
 }
 return {save};
}
