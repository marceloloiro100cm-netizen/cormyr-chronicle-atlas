/* eslint-disable @typescript-eslint/no-explicit-any -- server validates rows against original source contracts. */
import {createFirebaseCloudReadonly,CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';
import {createFirebaseCloudMail,CloudMailError} from '../../../scripts/firebase/cloud-mail-service.mjs';
import {cloudMailRuntimeApproved} from '../../../scripts/firebase/cloud-mail-runtime-approval.mjs';
import {mailReceiptId} from '../../../scripts/firebase/cloud-mail-receipt-core.mjs';
import {canReadLetterAs,canReadReply,mailPage,mailTrashPage,mailInsights,mailInsightsGrouped,mailOverviewGrouped,type MailDataset} from '../mail/mail-page-contract';
import {readWorkspaceSpy} from '../../../scripts/firebase/workspace-spy.mjs';
import {projectWorkspaceMailTables, type WorkspaceMailTables} from '../mail/firebase-workspace-mail';
import {CORE_CATALOG} from '../house/catalog';
import {queryRows,type Row,type QueryStep} from './query';

export type Scope={uid:string;profile:'narrador'|'jogador'|'editor';playerId:string|null;memberHouseIds:string[];editHouseIds:string[]};
const denied=()=>{throw new CloudAccessError('access_denied',403);};
export const recordVisible=(s:Scope,r:Row)=>s.profile==='narrador'||s.profile==='jogador'&&
 (r['visibility']==='player'&&s.playerId!==null&&r['player_id']===s.playerId||r['visibility']==='house'&&s.memberHouseIds.includes(r['house_id']));
export function createWorkspaceService({db,auth,snapshotId}: {db:any;auth:any;snapshotId:string}){
 const cloud=createFirebaseCloudReadonly({db,auth,snapshotId,projectId:'cormyr',enabled:true});
 async function execute(token:string,input:any){
  const scope=await cloud.workspaceScope(token),admin=scope.profile==='narrador',editor=admin||scope.profile==='editor';
  const cache=new Map<string,Promise<Row[]>>();
  const rows=(name:string)=>{
   if(!cache.has(name))cache.set(name,(async()=>{
    const original=await readWorkspaceTable(db,snapshotId,name);
    return original;
   })());
   return cache.get(name)!;
  };
  const houseAllowed=(id:string)=>admin||scope.profile==='jogador'&&scope.memberHouseIds.includes(id);
  const checkHouse=(id:string)=>{if(typeof id!=='string'||!houseAllowed(id))denied();};
  // All permission-bearing data come from CURRENT Cloud access, never historical memberships.
  const accessDocs=async()=>{
   const docs=await db.collection('migrationDomainStage').doc(snapshotId).collection('access').get();
   return docs.docs.map((d:any)=>d['data']()).filter((a:any)=>a.active===true&&a.requirePasswordChange===false);
  };
  const players=async():Promise<Row[]>=>{
   const [original,access]=await Promise.all([rows('campaign_players'),accessDocs()]);
   return original.map(p=>{
    const a=access.find((a:any)=>a.userId===p['user_id']&&a.playerId===p['id']);
    return {...p,active:Boolean(a),require_password_change:false};
   });
  };
  const memberships=async()=> (await accessDocs()).filter((a:any)=>a.profile==='jogador'&&a.playerId)
   .flatMap((a:any)=>a.memberHouseIds.map((h:string)=>({player_id:a.playerId,house_id:h,can_edit:a.editHouseIds.includes(h),can_edit_attributes:a.attrHouseIds?.includes(h)??false})));
  // Operational read receipts live outside the immutable migration snapshot.
  // Reconcile them only under the independently approved live mail runtime.
  // Never use an unapproved or partially scanned receipt set for read indicators.
  const addOperationalReceipts=async(letters:Row[],historical:Row[]):Promise<Row[]>=>{
   const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
   const [live,mailGate,calendar]=await Promise.all([
    runtime.get(),db.collection('campaignMailRuntime').doc(snapshotId).get(),
    db.collection('migrationTimeEngineStage').doc(snapshotId).collection('calendar').doc('current').get()]);
   if(!live.exists||!mailGate.exists||!calendar.exists||
      !cloudMailRuntimeApproved(live.data(),mailGate.data(),calendar.data(),snapshotId))
    return historical;
   const snapshot=await runtime.collection('mailReadReceipts').limit(2001).get();
   if(!Array.isArray(snapshot.docs)||snapshot.docs.length>2000)
    throw new CloudAccessError('mail_receipts_too_large',503);
   const existing=new Map<string,Row>();
   const key=(letterId:string,uid:string)=>letterId+'|'+uid;
   for(const row of historical)existing.set(key(String(row['letter_id']),String(row['user_id'])),row);
   const delivered=new Set(letters.filter(l=>l['publication_state']==='delivered'&&
    l['deleted_at']==null).map(l=>l['id']));
   const safe=/^[^/\u0000-\u001f\u007f]{1,128}$/;
   for(const doc of snapshot.docs){
    const data=doc.data(),uid=data?.viewerUid,letterId=data?.letterId,at=data?.readAt;
    if(data?.source!=='imported'||typeof uid!=='string'||!safe.test(uid)||
       typeof letterId!=='string'||!safe.test(letterId)||!delivered.has(letterId)||
       typeof at!=='string'||at.length>56||!Number.isFinite(Date.parse(at))||
       doc.id!==mailReceiptId(uid,'imported',letterId))continue;
    const k=key(letterId,uid),current=existing.get(k);
    if(!current||String(current['read_at'])<at)
      existing.set(k,{letter_id:letterId,user_id:uid,read_at:at});
   }
   return [...existing.values()];
  };
  let mailPromise:Promise<MailDataset>|undefined;
  const mail=()=>mailPromise??=(async()=>{
   const [letters,replies,receipts,p,m,h,rounds]=await Promise.all([
    rows('campaign_letters'),rows('letter_replies'),rows('letter_receipts'),players(),memberships(),rows('campaign_houses'),rows('letter_rounds')]);
   if(scope.profile==='editor')denied();
   const mergedReceipts=await addOperationalReceipts(letters,receipts);
   return projectWorkspaceMailTables({campaign_letters:letters,letter_replies:replies,letter_receipts:mergedReceipts,
    campaign_players:p,house_memberships:m,campaign_houses:h,letter_rounds:rounds} as WorkspaceMailTables,
    {...scope,profile:scope.profile as 'narrador'|'jogador'});
  })();
  const sheets=async()=> (await rows('noble_house_sheets')).filter(r=>houseAllowed(r['house_id']));
  const sheetFor=async(id:string)=>{
   checkHouse(id);
   const sheet=(await sheets()).find(r=>r['house_id']===id);
   if(!sheet||!sheet['state']||typeof sheet['state']!=='object')throw new CloudAccessError('house_sheet_unavailable',404);
   return {state:sheet['state'],version:sheet['version']};
  };
  const visible=async(name:string):Promise<Row[]>=>{
   if(name==='campaign_access_profiles')return (await accessDocs()).filter((a:any)=>admin||a.userId===scope.uid).map((a:any)=>({user_id:a.userId,profile:a.profile}));
   if(name==='campaign_players')return (await players()).filter(p=>admin||p['user_id']===scope.uid);
   if(name==='house_memberships')return (await memberships()).filter((m:Row)=>admin||m['player_id']===scope.playerId);
   if(name==='campaign_houses')return (await rows(name)).filter(r=>r['active']===true).map(r=>{
    const {id,name,region,crest,castle,lord_name,season,active}=r;
    // Preserve the original House narrative for its authorized members and
    // the Narrator, never publish a foreign House's private historical text.
    const details=houseAllowed(id)&&typeof r['details']==='string'?r['details']:'';
    return {id,name,region,crest,castle,lord_name,season,active,details};
   });
   if(name==='house_catalog')return (await rows(name)).filter(r=>admin||r['public_reviewed']===true);
   if(name==='noble_house_sheets')return sheets();
   if(['noble_house_ledger','spy_agent_upgrades'].includes(name))return (await rows(name)).filter(r=>houseAllowed(r['house_id']??r['owner_house_id']));
   if(name==='noble_house_rule_overrides')return scope.profile==='editor'?[]:rows(name);
   if(name==='campaign_records')return (await rows(name)).filter(r=>recordVisible(scope,r));
   if(name==='record_versions'){
    const ids=new Set((await visible('campaign_records')).map(r=>r['id']));
    return (await rows(name)).filter(r=>ids.has(r['record_id']));
   }
   if(['campaign_letters','letter_replies','letter_receipts','letter_rounds','letter_versions','letter_reply_versions','narrator_mail_notes','campaign_letter_consequences'].includes(name)){
    if(scope.profile==='editor')return [];
    const ds=await mail();
    if(name==='campaign_letters')return ds.letters.filter(r=>canReadLetterAs(ds,r,scope.uid));
    if(name==='letter_replies')return ds.replies.filter(r=>canReadReply(ds,r,scope.uid));
    if(name==='letter_receipts')return ds.receipts.filter(r=>admin||r['user_id']===scope.uid);
    if(name==='letter_rounds')return [...ds.rounds];
    if(!admin)return [];
    return rows(name);
   }
   if(name==='campaign_newspapers')return (await rows(name)).filter(r=>editor||['published','archived'].includes(r['state']));
   if(name==='campaign_newspaper_reads')return (await rows(name)).filter(r=>editor||r['user_id']===scope.uid);
   if(name==='campaign_newspaper_commissions')return (await rows(name)).filter(r=>editor||houseAllowed(r['house_id']));
   if(name==='campaign_newspaper_staff')return rows(name);
   if(['campaign_newspaper_story_models','campaign_newspaper_engravings','campaign_newspaper_settings','campaign_newspaper_revisions'].includes(name)){
    if(!editor)return [];
    return rows(name);
   }
   denied();return [];
  };
  const rpc=async(name:string,args:Row)=>{
   if(name.startsWith('spy_'))return readWorkspaceSpy({scope,name,args,rows,snapshotId,sheet:async(h:string)=>{checkHouse(h);const s=await sheetFor(h) as any;return {houseId:h,state:s.state,version:s.version};}});
   if(name==='mark_letter_read'){
    if(scope.profile==='editor')denied();
    const id=args['p_id'],safe=/^[^/\u0000-\u001f\u007f]{1,128}$/;
    if(Object.keys(args).length!==1||typeof id!=='string'||!safe.test(id))
     throw new CloudAccessError('invalid_receipt_request',400);
    if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')
     throw new CloudAccessError('workspace_operation_not_implemented',501);
    try{
     return await createFirebaseCloudMail({
      db,auth,snapshotId,projectId:'cormyr',enabled:true,
     }).markRead(token,{source:'imported',letterId:id});
    }catch(e){
     if(e instanceof CloudMailError)throw new CloudAccessError(e.code,e.status);
     throw e;
    }
   }
   if(name==='is_campaign_admin')return admin;
   if(name==='current_campaign_profile')return scope.profile;
   if(name==='in_campaign_house')return args['edit_required']?admin||scope.editHouseIds.includes(args['h']):houseAllowed(args['h']);
   if(name==='get_public_campaign_time'||name==='get_campaign_calendar')return cloud.workspaceCalendar(token);
   if(name==='calendar_mail_events'){
    if(scope.profile==='editor')return [];
    const prefix=String(args['p_year']).padStart(4,'0')+'-'+String(Number(args['p_month'])+1).padStart(2,'0');
    return (await visible('campaign_letters')).filter(r=>r['publication_state']==='delivered'&&typeof r['campaign_date']==='string'&&r['campaign_date'].startsWith(prefix))
     .map(r=>({id:'mail-'+r['id'],date:r['campaign_date'],title:r['subject'],kind:'mail'}));
   }
   if(['mail_page','mail_trash_page','mail_insights','mail_insights_grouped','mail_overview_grouped'].includes(name)){
    if(scope.profile==='editor')denied();
    const ds=await mail(),viewer={uid:scope.uid};
    if(name==='mail_page')return mailPage(ds,viewer,args['p_filters']??{},args['p_page']??0,args['p_size']??20);
    if(name==='mail_trash_page')return mailTrashPage(ds,viewer,args['p_filters']??{},args['p_page']??0,args['p_size']??20);
    if(name==='mail_insights')return mailInsights(ds,viewer);
    if(!admin)denied();
    return name==='mail_insights_grouped'?mailInsightsGrouped(ds,viewer,args['p_houses']??args['p_house_ids']??[]):mailOverviewGrouped(ds,viewer,args['p_houses']??args['p_house_ids']??[]);
   }
   if(name==='mail_compose_options'){
    if(scope.profile==='editor')denied();
    const [directory,links,allHouses,houseSheets,records]=await Promise.all([
     players(),memberships(),visible('campaign_houses'),sheets(),visible('campaign_records')]);
    // Same active, password-cleared recipient directory as the original RPC.
    // Historic roster entries are never an access grant.
    const activePlayers=directory.filter(p=>p['active']===true&&p['require_password_change']!==true&&
      typeof p['user_id']==='string'&&p['user_id'].length>0);
    const playersOut=activePlayers.map(p=>({
     id:p['id'],name:typeof p['name']==='string'?p['name']:'Jogador',
     houses:links.filter((m:Row)=>m['player_id']===p['id']).map((m:Row)=>m['house_id']),
    })).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    // Original SQL LEFT JOIN: a season-two House without a sheet is still
    // addressable and simply has no court, units or version yet.
    const housesOut=allHouses.filter(h=>h['season']===2&&houseAllowed(h['id']))
      .map(h=>{
       const sheet=houseSheets.find(s=>s['house_id']===h['id']);
       const state=sheet?.['state']&&typeof sheet['state']==='object'?sheet['state']:null;
       const court=Array.isArray(state?.court)?state.court:[];
       const units=Array.isArray(state?.units)?state.units:[];
       return {
        id:h['id'],name:h['name'],version:sheet?.['version']??null,
        court:court.flatMap((c:any)=>{
         if(typeof c?.id!=='string'||!c.id)return [];
         const npcId=typeof c.npcId==='string'?c.npcId:'';
         const npc=npcId?records.find(r=>r['id']===npcId&&r['house_id']===h['id']&&
          r['kind']==='character'&&!/^ficha\b/i.test(String(r['title']??''))):null;
         if(npcId&&!npc)return [];
         return [{id:c.id,name:typeof npc?.['title']==='string'?npc['title']:
           typeof c.name==='string'&&c.name?c.name:'Integrante sem identificação',
          role:typeof c.role==='string'?c.role:''}];
        }),
        units:units.filter((u:any)=>typeof u?.id==='string'&&u.id)
         .map((u:any)=>({id:u.id,name:typeof u.name==='string'?u.name:'',
          available:u.destroyed!==true&&u.destroyed!=='true'})),
       };
      }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
    return {players:playersOut,houses:housesOut};
   }
   throw new CloudAccessError('workspace_operation_not_implemented',501);
  };
  let result:any;
  if(input?.kind==='auth')result={user:{id:scope.uid},profile:scope.profile};
  else if(input?.kind==='query'){
   const steps=input.steps as QueryStep[];
   if(!Array.isArray(steps)||steps.length>40)throw new CloudAccessError('invalid_query',400);
   const mutations=steps.some(s=>['insert','update','delete','upsert'].includes(s.op));
   if(mutations)throw new CloudAccessError('workspace_operation_not_implemented',501);
   result=queryRows(await visible(String(input.table)),steps);
  }
  else if(input?.kind==='rpc')result=await rpc(String(input.name),input.args??{});
  else if(input?.kind==='house'){
   const id=input.houseId;checkHouse(id);
   const [sheet,ledger,houses,overrides]=await Promise.all([sheetFor(id),visible('noble_house_ledger'),visible('campaign_houses'),visible('noble_house_rule_overrides')]);
   const definitions=overrides.map(r=>r['definition']);
   result={state:(sheet as any).state,version:(sheet as any).version,catalog:[...CORE_CATALOG.filter(c=>!definitions.some(d=>d['id']===c.id)),...definitions],houses,
    ledger:ledger.filter(r=>r['house_id']===id),admin,canEditAttributes:admin,syncState:'synced'};
  }else if(input?.kind==='record'){
   checkHouse(input.houseId);
   result=(await visible('campaign_records')).find(r=>r['id']===input.id&&r['house_id']===input.houseId);
   if(!result)denied();
  }else throw new CloudAccessError('invalid_workspace_request',400);
  const after=await cloud.workspaceScope(token);
  if(JSON.stringify(after)!==JSON.stringify(scope))denied();
  return result;
 }
 return {execute};
}
