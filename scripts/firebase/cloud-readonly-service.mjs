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
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';
import {planNarratorAccessRemediation}
  from './cloud-access-remediation-plan.mjs';
import {activeSeason2HouseScopeValid} from './cloud-season2-house-scope.mjs';

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

  async function publishedCloudNewspaperRoot(){
    const root=db.collection('campaignCloudRuntime').doc(snapshotId);
    const doc=await root.get();
    const v=doc.data();
    // Imported snapshots are independent. Only published items from an
    // explicitly approved and reconciled Cloud runtime may become visible.
    if(!doc.exists||v?.status!=='active'||v.private!==true||
       v.sourceSnapshotId!==snapshotId||
       v.sourceSnapshotReconciled!==true||
       v.applicationEnabled!==true||v.newspaperWriteApproved!==true||
       v.newspaperSequenceReconciled!==true)
      return null;
    return root;
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
    if(v.profile==='jogador'){
      const houses=db.collection('migrationDomainStage').doc(snapshotId)
        .collection('houses');
      const houseDocuments=await Promise.all(memberHouseIds.map(id=>
        houses.doc(digest('house:'+id)).get()));
      // The historical membership list is not an authorization source
      // until each entry is proven to be an active season-2 House.
      if(!activeSeason2HouseScopeValid({
        memberHouseIds:v.memberHouseIds,
        editHouseIds:v.editHouseIds,houseDocuments,
      }))deny('invalid_access_scope',403);
    }
    return {uid:token.uid,profile:v.profile,playerId:playerId??null,
      memberHouseIds,editHouseIds};
  }

  return {
    async session(idToken){
      const {profile,memberHouseIds}=await scopeFor(idToken);
      return {authenticated:true,profile,memberHouseIds,readOnly:true,
        snapshotReconciliationPending:true};
    },
    /**
     * Privileged narrator-only account review. Returns identities only to
     * the authenticated narrator; never to Actions/logs or public endpoints.
     * The historical migration collection is READ ONLY, even for Narrators.
     */
    async listAccessRemediation(idToken){
      const viewer=await scopeFor(idToken);
      if(viewer.profile!=='narrador')deny('access_denied',403);
      const records=await db.collection('migrationDomainStage')
        .doc(snapshotId).collection('access').get();
      if(!Array.isArray(records?.docs)||records.docs.length!==14)
        deny('access_inventory_unverified',503);
      const houses=await db.collection('migrationDomainStage')
        .doc(snapshotId).collection('houses').get();
      if(!Array.isArray(houses?.docs)||houses.docs.length===0||
         houses.docs.length>250)deny('access_inventory_unverified',503);
      const validHouseIds=new Set(),allHouseIds=new Set();
      for(const doc of houses.docs){
        const house=doc.data();
        if(!house||typeof house.sourceId!=='string'||
           !SAFE_ID.test(house.sourceId)||
           typeof house.active!=='boolean'||
           !Number.isSafeInteger(house.season)||
           allHouseIds.has(house.sourceId))
          deny('access_inventory_unverified',503);
        allHouseIds.add(house.sourceId);
        if(house.active===true&&house.season===2)
          validHouseIds.add(house.sourceId);
      }
      const seen=new Set(),candidates=[];
      const counts={inactive:0,missingProfile:0,playerWithoutHouse:0,
        passwordChangePending:0,invalidScope:0};
      for(const doc of records.docs){
        const v=doc.data();
        if(!v||typeof v.userId!=='string'||!SAFE_ID.test(v.userId)||
           seen.has(v.userId)||
           typeof doc.id==='string'&&doc.id!==v.userId)
          deny('access_inventory_unverified',503);
        seen.add(v.userId);
        const profile=['narrador','jogador','editor'].includes(v.profile)
          ?v.profile:null;
        const issues=[];
        const member=Array.isArray(v.memberHouseIds)?v.memberHouseIds:null;
        const edit=Array.isArray(v.editHouseIds)?v.editHouseIds:null;
        const badScope=!member||!edit||
          member.length>250||edit.length>250||
          member.some(id=>typeof id!=='string'||!SAFE_ID.test(id))||
          edit.some(id=>typeof id!=='string'||!SAFE_ID.test(id))||
          edit.some(id=>!member.includes(id))||
          member.some(id=>!validHouseIds.has(id))||
          edit.some(id=>!validHouseIds.has(id))||
          new Set(member).size!==member.length||
          new Set(edit).size!==edit.length||
          profile==='editor'&&member.length!==0||
          typeof v.admin!=='boolean'||
          profile==='narrador'&&v.admin!==true||
          profile!==null&&profile!=='narrador'&&v.admin!==false||
          typeof v.active!=='boolean'||
          typeof v.requirePasswordChange!=='boolean';
        if(v.active!==true){issues.push('inactive');counts.inactive++;}
        if(profile===null){issues.push('missingProfile');counts.missingProfile++;}
        if(profile==='jogador'&&(!member||member.length===0)){
          issues.push('playerWithoutHouse');counts.playerWithoutHouse++;
        }
        if(v.requirePasswordChange!==false){
          issues.push('passwordChangePending');counts.passwordChangePending++;
        }
        if(badScope){issues.push('invalidScope');counts.invalidScope++;}
        if(issues.length)candidates.push({uid:v.userId,profile,issues,
          active:v.active===true,
          requirePasswordChange:v.requirePasswordChange!==false,
          memberHouseIds:!badScope&&member?[...member]:[],
          editHouseIds:!badScope&&edit?[...edit]:[]});
      }
      // A deleted Auth identity still exists in the IMMUTABLE historic access
      // archive. Reconcile the complete 13/14 or 14/14 live identity set before
      // showing any private pending row; never revive the deleted identity.
      let inventory;
      try{
        if(typeof auth.listUsers!=='function')throw Error('missing_inventory_reader');
        inventory=await auth.listUsers(1000);
      }catch{deny('access_inventory_unverified',503);}
      if(!Array.isArray(inventory?.users)||inventory.pageToken||
         ![13,14].includes(inventory.users.length))
        deny('access_inventory_unverified',503);
      const liveByUid=new Map();
      for(const u of inventory.users){
        if(!u||typeof u.uid!=='string'||!SAFE_ID.test(u.uid)||
           u.disabled!==false||!seen.has(u.uid)||liveByUid.has(u.uid))
          deny('access_inventory_unverified',503);
        liveByUid.set(u.uid,u);
      }
      if(liveByUid.size!==inventory.users.length||
         seen.size-liveByUid.size>1)
        deny('access_inventory_unverified',503);
      const archivedHistoricalAccess=seen.size-liveByUid.size;
      const currentCandidates=candidates.filter(c=>liveByUid.has(c.uid));
      const currentCounts={inactive:0,missingProfile:0,playerWithoutHouse:0,
        passwordChangePending:0,invalidScope:0};
      for(const c of currentCandidates)
        for(const issue of c.issues)currentCounts[issue]++;
      // All lookups must succeed before returning any private row.
      let items;
      try{
        items=await Promise.all(currentCandidates.map(async c=>{
          const u=await auth.getUser(c.uid);
          if(u?.uid!==c.uid)throw Error('auth_access_inventory_mismatch');
          const email=typeof u.email==='string'&&
            u.email.length<=254&&!/[\u0000-\u001f\u007f]/.test(u.email)
            ?u.email:null;
          return {...c,email,authDisabled:u.disabled===true};
        }));
      }catch{deny('access_inventory_unverified',503);}
      return {readOnly:true,sourceImmutable:true,
        historicalAccountsChecked:14,accountsChecked:liveByUid.size,
        archivedHistoricalAccess,deletionIdentityApproved:false,
        pendingAccounts:items.length,issues:currentCounts,items,
        authWrites:0,firestoreWrites:0,
        readyForRemediation:false,readyForPlayers:false};
    },
    /**
     * Private, narrator-only preflight. NO accounts or documents are updated;
     * source migration access remains immutable. Re-evaluate from the server
     * instead of trusting stale browser rows or arbitrary client Houses.
     */
    async previewAccessRemediation(idToken,targetUid,proposal){
      const viewer=await scopeFor(idToken);
      if(viewer.profile!=='narrador')deny('access_denied',403);
      if(typeof targetUid!=='string'||!SAFE_ID.test(targetUid)||
         targetUid===viewer.uid)deny('invalid_access_decision',400);
      const source=await get(db,'migrationDomainStage',snapshotId,
        'access',targetUid);
      if(!source.exists||source.data()?.userId!==targetUid)
        deny('access_denied',403);
      const houses=await db.collection('migrationDomainStage')
        .doc(snapshotId).collection('houses').limit(251).get();
      if(!Array.isArray(houses?.docs)||houses.docs.length>250)
        deny('access_inventory_unverified',503);
      let account;
      try{account=await auth.getUser(targetUid);}
      catch{deny('access_inventory_unverified',503);}
      try{
        return planNarratorAccessRemediation({
          snapshotId,actorUid:viewer.uid,targetUid,
          sourceAccess:source.data(),authUser:account,
          houseCatalog:houses.docs.map(doc=>doc.data()),proposal,
        });
      }catch{
        // Never return source identity, House names, provider details
        // or the rejected proposal in a response or server log.
        deny('invalid_access_decision',400);
      }
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
      const [liveStatus,mailGate,calendar]=await Promise.all([
        liveRoot.get(),
        db.collection('campaignMailRuntime').doc(snapshotId).get(),
        db.collection('migrationTimeEngineStage').doc(snapshotId)
          .collection('calendar').doc('current').get(),
      ]);
      const cloudMailApproved=liveStatus.exists&&mailGate.exists&&
        calendar.exists&&cloudMailRuntimeApproved(liveStatus.data(),
          mailGate.data(),calendar.data(),snapshotId);
      if(cloudMailApproved){
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
        const canMarkRead=cloudMailApproved&&canAcknowledgeMail({
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
          // Only the current authorized recipient can initiate a reply.
          canReply:Boolean(cloudMailApproved&&cloudReplyRoute({
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
      const runtime=await publishedCloudNewspaperRoot();
      let newEditions=[];
      if(runtime){
        const cloud=await runtime.collection('publishedNewspapers').get();
        if(cloud.size>100)deny('newspaper_response_too_large',503);
        newEditions=cloud.docs.map(d=>d.data()).filter(v=>
          v&&v.source==='firebase-cloud'&&
          v.sourceSnapshotId===snapshotId&&
          typeof v.id==='string'&&v.id.startsWith('cloud-')&&
          v.state==='published'&&
          typeof v.title==='string'&&Number.isInteger(v.editionNo)&&
          typeof v.publishedAt==='string'&&v.cancelledAt===null
        );
      }
      const items=[...snap.docs.map(d=>d.data()),...newEditions].filter(v=>
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
      const cloudId=editionId.startsWith('cloud-');
      const runtime=cloudId?await publishedCloudNewspaperRoot():null;
      if(cloudId&&!runtime)deny('edition_unavailable',404);
      const snap=cloudId
        ?await runtime.collection('publishedNewspapers').doc(editionId).get()
        :await get(db,'migrationNewspaperRuntimeStage',snapshotId,
          'editions',editionId);
      const v=snap.data();
      if(cloudId&&(!v||v.source!=='firebase-cloud'||
         v.sourceSnapshotId!==snapshotId||v.id!==editionId||
         v.state!=='published'))
        deny('edition_unavailable',404);
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
    async listHouseBattles(idToken,houseId){
      // Historic match summaries only: never return orders, replays or hashes.
      const scope=await scopeFor(idToken);
      if(typeof houseId!=='string'||!SAFE_ID.test(houseId))
        deny('invalid_house',400);
      if(scope.profile!=='narrador'&&
         !(scope.profile==='jogador'&&scope.memberHouseIds.includes(houseId)))
        deny('access_denied',403);
      await stageReady('migrationBattleStage');
      const selected=await get(db,'migrationDomainStage',snapshotId,
        'houses',digest('house:'+houseId));
      if(!selected.exists||selected.data()?.sourceId!==houseId||
         selected.data()?.active!==true)
        deny('house_unavailable',404);
      const live=await db.collection('migrationBattleStage')
        .doc(snapshotId).collection('live').get();
      if(!Array.isArray(live.docs)||live.size>250)
        deny('battle_catalog_too_large',503);
      const safe=s=>typeof s==='string'&&SAFE_ID.test(s);
      const items=live.docs.map(d=>d.data()).filter(v=>
        v&&safe(v.id)&&safe(v.attackerHouseId)&&
        safe(v.defenderHouseId)&&v.attackerHouseId!==v.defenderHouseId&&
        (v.attackerHouseId===houseId||v.defenderHouseId===houseId)&&
        typeof v.title==='string'&&v.title.trim().length>=5&&
        v.title.length<=120&&['active','completed','closed'].includes(v.status)&&
        Number.isSafeInteger(v.stateVersion)&&
        v.stateVersion>=0&&v.stateVersion<=1500
      ).map(v=>({
        id:v.id,title:v.title,status:v.status,
        stateVersion:v.stateVersion,
        attackerHouseId:v.attackerHouseId,defenderHouseId:v.defenderHouseId,
        createdAt:typeof v.createdAt==='string'&&
          v.createdAt.length<=48&&Number.isFinite(Date.parse(v.createdAt))
          ?v.createdAt:null,
      })).sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||
        a.id.localeCompare(b.id));
      const response={
        houseId,items:items.slice(0,50),totalVisible:items.length,
        truncated:items.length>50,readOnly:true,
        snapshotReconciliationPending:true,
      };
      if(Buffer.byteLength(JSON.stringify(response),'utf8')>40_000)
        deny('battle_response_too_large',503);
      return response;
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
