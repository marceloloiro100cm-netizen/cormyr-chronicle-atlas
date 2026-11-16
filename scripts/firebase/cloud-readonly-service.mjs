/**
 * Cormyr: Firebase Cloud-only, read-only campaign access.
 *
 * NO Supabase fallback. Never use a browser SDK for migration* collections.
 * Construct only on a trusted server with Firebase Admin Auth and Firestore.
 * This deliberately does not enable game writes, Drive, schedules or cutover.
 */
import {createHash} from 'node:crypto';
import {canAcknowledgeMail,mailReceiptId} from './cloud-mail-receipt-core.mjs';
import {cloudReplyRoute} from './cloud-mail-reply-core.mjs';

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
    const playerId=v.playerId;
    if(playerId!==null&&playerId!==undefined&&
       (typeof playerId!=='string'||!SAFE_ID.test(playerId)))
      deny('invalid_access_scope',403);
    return {uid:token.uid,profile:v.profile,playerId:playerId??null,
      memberHouseIds,editHouseIds};
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
    async listMailbox(idToken){
      const scope=await scopeFor(idToken);
      if(scope.profile==='editor')deny('access_denied',403);
      const root=db.collection('migrationDomainStage').doc(snapshotId);
      const imported=await root.collection('letters').get();
      if(imported.size>500)deny('mailbox_requires_pagination',503);
      let cloudMessages=[];
      // Historical import is immutable. Newly authored messages only appear
      // after the separately approved Cloud runtime is fully reconciled.
      const liveRoot=db.collection('campaignCloudRuntime').doc(snapshotId);
      const liveStatus=await liveRoot.get();
      if(liveStatus.exists&&liveStatus.data()?.status==='active'&&
         liveStatus.data()?.private===true&&
         liveStatus.data()?.sourceSnapshotId===snapshotId&&
         liveStatus.data()?.sourceSnapshotReconciled===true&&
         liveStatus.data()?.mailWriteApproved===true&&
         liveStatus.data()?.applicationEnabled===true){
        const live=await liveRoot.collection('letters').get();
        if(live.size>500)deny('mailbox_requires_pagination',503);
        cloudMessages=live.docs.map(d=>d.data());
      }
      const visible=[...imported.docs.map(d=>d.data()),...cloudMessages]
        .filter(v=>{
          if(!v||v.publicationState!=='delivered'||v.deletedAt!==null||
             typeof (v.sourceId??v.id)!=='string'||
             typeof v.subject!=='string'||typeof v.content!=='string'||
             typeof v.createdAt!=='string')return false;
          const narratorAddressed=v.source==='firebase-cloud'&&
            v.recipientKind==='narrator'&&
            v.recipientPlayerId===null&&v.recipientHouseId===null;
          if(!narratorAddressed&&
             Boolean(v.recipientPlayerId)===Boolean(v.recipientHouseId))
            return false;
          return scope.profile==='narrador'||v.senderUid===scope.uid||
            (scope.playerId!==null&&v.recipientPlayerId===scope.playerId)||
            (typeof v.recipientHouseId==='string'&&
              scope.memberHouseIds.includes(v.recipientHouseId));
        }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||
          String(a.sourceId??a.id).localeCompare(String(b.sourceId??b.id)));
      const items=await Promise.all(visible.slice(0,30).map(async v=>{
        const source=v.source==='firebase-cloud'?'firebase-cloud':'imported';
        const id=v.sourceId??v.id;
        const canMarkRead=liveStatus.exists&&
          liveStatus.data()?.status==='active'&&
          liveStatus.data()?.private===true&&
          liveStatus.data()?.sourceSnapshotId===snapshotId&&
          liveStatus.data()?.sourceSnapshotReconciled===true&&
          liveStatus.data()?.mailWriteApproved===true&&
          liveStatus.data()?.applicationEnabled===true&&
          canAcknowledgeMail({
            uid:scope.uid,role:scope.profile,playerId:scope.playerId,
            memberHouses:scope.memberHouseIds,
          },v,source,id);
        let readAt=null;
        if(canMarkRead){
          const receipt=await liveRoot.collection('mailReadReceipts')
            .doc(mailReceiptId(scope.uid,source,id)).get();
          const row=receipt.data();
          if(receipt.exists&&row?.viewerUid===scope.uid&&
             row?.source===source&&row?.letterId===id&&
             typeof row?.readAt==='string')readAt=row.readAt;
        }
        return {
          id,source,subject:v.subject,content:v.content,
          senderName:v.senderName??null,
          recipientHouseId:v.recipientHouseId??null,
          createdAt:v.createdAt,campaignDate:v.campaignDate??null,
          deliveredAt:v.deliveredAt??null,
          canMarkRead:Boolean(canMarkRead),readAt,
          // Reply permission follows the trusted recipient's editable House.
          // Never let a browser-supplied origin or destination decide it.
          canReply:Boolean(liveStatus.exists&&
            liveStatus.data()?.status==='active'&&
            liveStatus.data()?.private===true&&
            liveStatus.data()?.sourceSnapshotId===snapshotId&&
            liveStatus.data()?.sourceSnapshotReconciled===true&&
            liveStatus.data()?.mailWriteApproved===true&&
            liveStatus.data()?.applicationEnabled===true&&
            cloudReplyRoute({
              uid:scope.uid,role:scope.profile,editHouses:scope.editHouseIds,
            },v,snapshotId)),
        };
      }));
      if(Buffer.byteLength(JSON.stringify(items),'utf8')>700_000)
        deny('mailbox_response_too_large',503);
      return {items,totalVisible:visible.length,truncated:visible.length>30,
        readOnly:true,snapshotReconciliationPending:true};
    },
    async listNewspaper(idToken){
      await scopeFor(idToken);
      await stageReady('migrationNewspaperRuntimeStage');
      const snap=await db.collection('migrationNewspaperRuntimeStage')
        .doc(snapshotId).collection('editions').get();
      if(snap.size>100)deny('newspaper_response_too_large',503);
      const items=snap.docs.map(d=>d.data()).filter(v=>
        v&&['published','archived'].includes(v.state)&&
        typeof v.id==='string'&&typeof v.title==='string'&&
        Number.isInteger(v.editionNo)&&
        typeof v.publishedAt==='string'&&v.cancelledAt==null
      ).sort((a,b)=>b.editionNo-a.editionNo)
        .map(v=>({id:v.id,title:v.title,subtitle:v.subtitle??'',
          editionNo:v.editionNo,state:v.state,publishedAt:v.publishedAt,
          campaignDate:v.campaignDate??null}));
      return {items,readOnly:true,snapshotReconciliationPending:true};
    },
    async getNewspaper(idToken,editionId){
      await scopeFor(idToken);
      if(typeof editionId!=='string'||!SAFE_ID.test(editionId))
        deny('invalid_edition',400);
      await stageReady('migrationNewspaperRuntimeStage');
      const snap=await get(db,'migrationNewspaperRuntimeStage',snapshotId,
        'editions',editionId);
      const v=snap.data();
      if(!snap.exists||!v||!['published','archived'].includes(v.state)||
         typeof v.publishedAt!=='string'||v.cancelledAt!=null)
        deny('edition_unavailable',404);
      if(!Array.isArray(v.blocks)||typeof v.title!=='string')
        deny('edition_unavailable',503);
      const result={id:v.id,title:v.title,subtitle:v.subtitle??'',
        editionNo:v.editionNo,state:v.state,blocks:v.blocks,
        publishedAt:v.publishedAt,campaignDate:v.campaignDate??null,
        readOnly:true,snapshotReconciliationPending:true};
      if(Buffer.byteLength(JSON.stringify(result),'utf8')>700_000)
        deny('edition_response_too_large',503);
      return result;
    },
    async listSpyAgents(idToken,houseId){
      const scope=await scopeFor(idToken);
      if(typeof houseId!=='string'||!SAFE_ID.test(houseId))
        deny('invalid_house',400);
      if(scope.profile!=='narrador'&&
         !(scope.profile==='jogador'&&scope.memberHouseIds.includes(houseId)))
        deny('access_denied',403);
      await stageReady('migrationSpyStage');
      const snap=await db.collection('migrationSpyStage')
        .doc(snapshotId).collection('assets').get();
      if(snap.size>500)deny('spy_response_too_large',503);
      const items=snap.docs.map(d=>d.data()).filter(v=>
        v&&v.ownerHouseId===houseId&&typeof v.id==='string'&&
        typeof v.codename==='string'
      ).map(v=>({id:v.id,codename:v.codename,status:v.status,
        missionSuccesses:v.missionSuccesses,portraitId:v.portraitId??null}))
        .sort((a,b)=>a.codename.localeCompare(b.codename));
      return {items,readOnly:true,snapshotReconciliationPending:true};
    },
    async listSpyDossiers(idToken,houseId){
      // Server-side scope, not claims provided by the browser. An editor
      // has no access. Players can request ONLY their own Houses.
      const scope=await scopeFor(idToken);
      if(typeof houseId!=='string'||!SAFE_ID.test(houseId))
        deny('invalid_house',400);
      if(scope.profile!=='narrador'&&
         !(scope.profile==='jogador'&&scope.memberHouseIds.includes(houseId)))
        deny('access_denied',403);
      await stageReady('migrationSpyStage');
      const owner=await get(db,'migrationDomainStage',snapshotId,
        'houses',digest('house:'+houseId));
      if(!owner.exists||owner.data()?.sourceId!==houseId||
         owner.data()?.active!==true)deny('house_unavailable',404);
      const base=db.collection('migrationSpyStage').doc(snapshotId);
      const dossiers=await base.collection('dossiers').get();
      if(dossiers.size>500)deny('spy_dossier_catalog_too_large',503);
      const owned=dossiers.docs.map(d=>d.data()).filter(v=>
        v&&typeof v.id==='string'&&SAFE_ID.test(v.id)&&
        v.ownerHouseId===houseId&&
        typeof v.targetHouseId==='string'&&SAFE_ID.test(v.targetHouseId)&&
        v.targetHouseId!==houseId);
      if(owned.length>50)deny('spy_dossier_catalog_too_large',503);
      // Never inspect adminAudit, operational missions or foreign dossiers
      // in the response. Findings represent intelligence ALREADY REVEALED
      // to a particular dossier, not unpublished investigation details.
      const ownedIds=new Set(owned.map(d=>d.id));
      const findings=await base.collection('findings').get();
      if(findings.size>600)deny('spy_findings_catalog_too_large',503);
      const byDossier=new Map(owned.map(d=>[d.id,[]]));
      for(const doc of findings.docs){
        const v=doc.data();
        if(!v||!ownedIds.has(v.dossierId)||
           typeof v.subjectKey!=='string'||v.subjectKey.length>160||
           !['house_resources','army','possessions'].includes(v.objective)||
           !v.valueSnapshot||typeof v.valueSnapshot!=='object'||
           Array.isArray(v.valueSnapshot))continue;
        const value={
          objective:v.objective,subjectKey:v.subjectKey,
          valueSnapshot:v.valueSnapshot,
          discoveredDateKey:typeof v.discoveredDateKey==='string'
            ?v.discoveredDateKey:null,
          verifiedDateKey:typeof v.verifiedDateKey==='string'
            ?v.verifiedDateKey:null,
        };
        byDossier.get(v.dossierId).push(value);
      }
      const items=owned.map(d=>({
        id:d.id,targetHouseId:d.targetHouseId,
        findings:(byDossier.get(d.id)||[]).sort((a,b)=>
          a.objective.localeCompare(b.objective)||
          a.subjectKey.localeCompare(b.subjectKey)),
      })).sort((a,b)=>a.targetHouseId.localeCompare(b.targetHouseId));
      const result={ownerHouseId:houseId,items,readOnly:true,
        snapshotReconciliationPending:true};
      if(Buffer.byteLength(JSON.stringify(result),'utf8')>240_000)
        deny('spy_dossier_response_too_large',503);
      return result;
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
