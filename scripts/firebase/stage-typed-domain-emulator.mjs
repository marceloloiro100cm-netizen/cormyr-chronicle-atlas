/**
 * Stage a typed, minimal Cormyr domain view in Firestore Emulator only.
 * Not an app cutover or cloud migration. No source passwords/identities copied.
 * No data values printed. Client writes must be disabled by migration rules.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertEmulatorOnly, loadVerifiedPrivateTables } from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
const ROOT='migrationDomainStage';
const required=[
  'auth.users','public.user_roles','public.campaign_access_profiles',
  'public.campaign_houses','public.campaign_players','public.house_memberships',
  'public.campaign_letters',
];
const digest=s=>createHash('sha256').update(s).digest('hex');
const idOf=(type,id)=>digest(type+':'+id);
const truth=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const textVal=v=>typeof v==='string'&&v.length>0?v:null;
const safeId=v=>typeof v==='string'&&v.length>0&&v.length<=512;
const intVal=v=>typeof v==='string'&&/^-?\d+$/.test(v)?Number(v):null;
const isoDate=v=>{
  if(v===null||v===undefined||v==='')return null;
  if(typeof v!=='string'||!/\d{4}-\d\d-\d\d/.test(v))return null;
  const n=Date.parse(v);
  return Number.isFinite(n)?new Date(n).toISOString():null;
};
const objBytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');

export function buildTypedDomainPlan(tables,snapshotId){
  if(!Array.isArray(tables)||!/^[a-f0-9]{64}$/.test(snapshotId))
    throw new Error('Invalid verified source data');
  const byName=new Map(tables.map(x=>[x.table,x]));
  const missingRequired=required.filter(name=>!byName.has(name));
  const rows=name=>byName.get(name)?.rows||[];
  const issues={duplicateIds:0,orphanLinks:0,invalidValues:0,roleConflicts:0,
    editorHouseConflicts:0,oversizedDocuments:0};
  // Aggregate relationship defects only. Never emit UIDs, player/house IDs,
  // letter IDs, personal names, correspondence content, or per-row hashes.
  const orphanLinksByType={
    adminRoleMissingAuth:0, accessProfileMissingAuth:0,
    playerMissingAuth:0, rosterHouseNotInSnapshot:0,
    membershipMissingPlayer:0, membershipMissingHouse:0,
    membershipPlayerWithoutAuth:0,
    letterSenderMissingAuth:0, letterRecipientMissingPlayer:0,
    letterRecipientMissingHouse:0, letterRecipientShapeInvalid:0,
  };
  const orphan=(kind)=>{
    if(!Object.hasOwn(orphanLinksByType,kind))throw Error('Invalid aggregate category');
    issues.orphanLinks++;
    orphanLinksByType[kind]++;
  };
  const seen=new Map();
  const unique=(domain,id)=>{
    if(!safeId(id)){issues.invalidValues++;return false;}
    if(!seen.has(domain))seen.set(domain,new Set());
    if(seen.get(domain).has(id)){issues.duplicateIds++;return false;}
    seen.get(domain).add(id);return true;
  };
  const authIds=new Set();
  for(const a of rows('auth.users')) {
    if(unique('auth',a.id))authIds.add(a.id);
  }
  const adminIds=new Set();
  for(const a of rows('public.user_roles')){
    if(a.role!=='admin')continue;
    if(!authIds.has(a.user_id)){orphan('adminRoleMissingAuth');continue;}
    adminIds.add(a.user_id);
  }
  const profiles=new Map();
  for(const row of rows('public.campaign_access_profiles')){
    if(!unique('profiles',row.user_id))continue;
    if(!authIds.has(row.user_id)){orphan('accessProfileMissingAuth');continue;}
    if(!['narrador','editor','jogador'].includes(row.profile)||
       truth(row.active)===null){issues.invalidValues++;continue;}
    profiles.set(row.user_id,{profile:row.profile,active:truth(row.active)});
  }
  for(const uid of adminIds){
    if(profiles.get(uid)?.profile!=='narrador'||profiles.get(uid)?.active!==true)
      issues.roleConflicts++;
  }
  for(const [uid,profile] of profiles){
    if(profile.profile==='narrador'&&!adminIds.has(uid))issues.roleConflicts++;
  }

  const houses=[], houseIds=new Set();
  for(const row of rows('public.campaign_houses')){
    if(!unique('houses',row.id))continue;
    if(truth(row.active)===null){issues.invalidValues++;continue;}
    const season=intVal(row.season);
    if(!Number.isSafeInteger(season)){issues.invalidValues++;continue;}
    const payload={
      sourceId:row.id,
      name:textVal(row.name)||'',
      castle:row.castle??null,
      crest:row.crest??null,
      season,
      active:truth(row.active),
    };
    if(!textVal(row.name)){issues.invalidValues++;continue;}
    houseIds.add(row.id);
    houses.push({id:idOf('house',row.id),payload});
  }
  const players=[], playersById=new Map(), playerByUid=new Map();
  for(const row of rows('public.campaign_players')){
    if(!unique('players',row.id))continue;
    const active=truth(row.active), requirePasswordChange=truth(row.require_password_change);
    if(active===null||requirePasswordChange===null||!textVal(row.name)){
      issues.invalidValues++;continue;
    }
    const userId=row.user_id||null;
    if(userId&&!authIds.has(userId)){orphan('playerMissingAuth');continue;}
    if(userId&&playerByUid.has(userId)){issues.duplicateIds++;continue;}
    const rosterHouseId=row.roster_house_id||null;
    if(rosterHouseId&&!houseIds.has(rosterHouseId)){
      // A legacy roster pointer is not permission, but it must resolve.
      orphan('rosterHouseNotInSnapshot');
    }
    const player={id:row.id,userId,name:row.name,active,
      requirePasswordChange,rosterHouseId};
    playersById.set(row.id,player);
    if(userId)playerByUid.set(userId,player);
    players.push({id:idOf('player',row.id),payload:player});
  }
  const membershipByUid=new Map();
  for(const row of rows('public.house_memberships')){
    const player=playersById.get(row.player_id);
    const houseId=row.house_id;
    if(!player){orphan('membershipMissingPlayer');continue;}
    if(!houseIds.has(houseId)){orphan('membershipMissingHouse');continue;}
    if(!player.userId){orphan('membershipPlayerWithoutAuth');continue;}
    const canEdit=truth(row.can_edit);
    const attr=row.can_edit_attributes==null?false:truth(row.can_edit_attributes);
    if(canEdit===null||attr===null){issues.invalidValues++;continue;}
    if(profiles.get(player.userId)?.profile==='editor'){
      issues.editorHouseConflicts++;continue;
    }
    if(!membershipByUid.has(player.userId))membershipByUid.set(player.userId,new Map());
    const member=membershipByUid.get(player.userId);
    if(member.has(houseId)){issues.duplicateIds++;continue;}
    member.set(houseId,{canEdit,canEditAttributes:attr});
  }

  const access=[];
  let accountsWithoutProfile=0;
  for(const uid of authIds){
    const profile=profiles.get(uid)||null;
    const player=playerByUid.get(uid)||null;
    if(!profile)accountsWithoutProfile++;
    if(profile?.profile==='editor'&&player?.rosterHouseId)issues.editorHouseConflicts++;
    const admin=profile?.profile==='narrador'&&adminIds.has(uid)&&profile.active;
    const playerAllowed=profile?.profile==='jogador'&&profile.active&&
      player?.active===true&&player.requirePasswordChange===false;
    const membership=playerAllowed?membershipByUid.get(uid):null;
    const memberHouseIds=[...(membership?.keys()||[])].sort();
    const editHouseIds=memberHouseIds.filter(house=>membership.get(house).canEdit);
    const attrHouseIds=memberHouseIds.filter(house=>membership.get(house).canEditAttributes);
    access.push({id:uid,payload:{
      userId:uid,
      profile:profile?.profile||null,
      active:Boolean(admin||playerAllowed||(
        profile?.profile==='editor'&&profile.active&&player?.active===true&&
        player.requirePasswordChange===false)),
      admin:Boolean(admin),
      playerId:player?.id||null,
      memberHouseIds, editHouseIds, attrHouseIds,
      requirePasswordChange:Boolean(player?.requirePasswordChange),
    }});
  }

  const letters=[], lettersQuarantine=[];
  const sourceLetters=rows('public.campaign_letters');
  const letterColumns=byName.get('public.campaign_letters')?.columns;
  const recipientShapes={missingBoth:0,bothPresent:0};
  for(const row of sourceLetters){
    if(!unique('letters',row.id))continue;
    const senderUid=row.sender_user_id;
    const toPlayer=row.recipient_player_id||null;
    const toHouse=row.recipient_house_id||null;
    if(!authIds.has(senderUid)){
      orphan('letterSenderMissingAuth');continue;
    }
    const invalidShape=Boolean(toPlayer)===Boolean(toHouse);
    // An ambiguous address must NEVER grant sender/house/recipient access.
    // Preserve the entire raw PostgreSQL COPY row in a separate collection
    // denied to ALL client SDKs, including the narrator.
    // This is not a semantic reinterpretation or silent dropping of a letter.
    if(invalidShape){
      const shape=toPlayer?'bothPresent':'missingBoth';
      recipientShapes[shape]++;
      if(!Array.isArray(letterColumns)||!letterColumns.length||
         !letterColumns.every(column=>Object.hasOwn(row,column) &&
           (row[column]===null||typeof row[column]==='string'))){
        issues.invalidValues++;continue;
      }
      lettersQuarantine.push({
        id:idOf('letter',row.id),
        payload:{
          sourceTable:'public.campaign_letters',
          encoding:'postgres-copy-text-or-null',
          recipientShape:shape,
          columns:letterColumns,
          rawValues:letterColumns.map(column=>row[column]),
        },
      });
      continue;
    }
    if(toPlayer&&!playersById.has(toPlayer)){
      orphan('letterRecipientMissingPlayer');continue;
    }
    if(toHouse&&!houseIds.has(toHouse)){
      orphan('letterRecipientMissingHouse');continue;
    }
    const createdAt=isoDate(row.created_at);
    const deletedAt=row.deleted_at==null?null:isoDate(row.deleted_at);
    // A letter can be a private draft or scheduled for a future round.
    // Never infer that the absence of a delivery state means delivered.
    const publicationState=row.publication_state;
    if(!createdAt||(row.deleted_at!=null&&!deletedAt)||
       !['draft','scheduled','delivered'].includes(publicationState)||
       typeof row.subject!=='string'||typeof row.content!=='string'){
      issues.invalidValues++;continue;
    }
    letters.push({id:idOf('letter',row.id),payload:{
      sourceId:row.id,
      senderUid,
      senderPlayerId:row.sender_player_id||null,
      senderName:typeof row.sender_name==='string'?row.sender_name:null,
      recipientPlayerId:toPlayer,
      recipientHouseId:toHouse,
      subject:row.subject,
      content:row.content,
      createdAt,
      deletedAt,
      publicationState,
    }});
  }

  const docs={houses,players,access,letters,lettersQuarantine};
  // A valid staging plan must preserve ALL source letters either as addressed
  // letters or in the deny-all quarantine. Remaining defects stay blockers.
  const letterCoverageComplete=
    letters.length+lettersQuarantine.length===sourceLetters.length;
  for(const group of Object.values(docs))for(const entry of group){
    if(objBytes(entry.payload)+8192>850*1024)issues.oversizedDocuments++;
  }
  const count=Object.values(issues).reduce((a,b)=>a+b,0);
  const summary={
    scope:'private-typed-firestore-domain-emulator-only',
    sourceSnapshotVerified:true,
    typedCollections:Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,v.length])),
    accountsWithoutProfile,
    missingRequiredTables:missingRequired,
    sourceRowCounts:{
      authAccounts:rows('auth.users').length,
      houses:rows('public.campaign_houses').length,
      players:rows('public.campaign_players').length,
      memberships:rows('public.house_memberships').length,
      letters:rows('public.campaign_letters').length,
    },
    orphanLinksByType,
    recipientShapes,
    letterCoverage:{
      source:sourceLetters.length,
      addressed:letters.length,
      quarantined:lettersQuarantine.length,
      complete:letterCoverageComplete,
    },
    issues,
    planValid:count===0&&missingRequired.length===0&&letterCoverageComplete,
    firebaseCloudWrites:0,
    readyForCloudImport:false,
    securityNotes:'Unaddressed or ambiguous letters are stored losslessly in a deny-all quarantine. No client mutations or automatic role assignment.',
  };
  return {snapshotId,docs,summary};
}

export async function loadTypedDomainPlan(normalized){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(normalized);
  return buildTypedDomainPlan(tables,snapshotHash);
}

export async function writeTypedDomainToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Domain plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,bytes=0;
  async function flush(){
    if(!pending)return;
    await batch.commit();written+=pending;
    batch=db.batch();pending=0;bytes=0;
  }
  for(const [type,docs] of Object.entries(plan.docs)){
    for(const item of docs){
      const size=objBytes(item.payload);
      if(pending>0&&(pending>=100||bytes+size>4*1024*1024))await flush();
      batch.set(root.collection(type).doc(item.id),item.payload);
      pending++;bytes+=size;
    }
  }
  await flush();
  await root.set({
    status:'complete',formatVersion:1,private:true,
    counts:plan.summary.typedCollections,
  });written++;
  return {staged:true,typedCollections:plan.summary.typedCollections,
    emulatorWrites:written,firebaseCloudWrites:0,readyForCloudImport:false};
}

async function main(args){
  if(args.length<2||args[0]!=='--normalized')throw Error('Use --normalized PRIVATE_DIR [--execute-emulator]');
  const execute=args.length===3&&args[2]==='--execute-emulator';
  if(args.length!==2&&!execute)throw Error('Invalid CLI args');
  const plan=await loadTypedDomainPlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid typed domain source plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-domain-stage');
  try{
    const result=await writeTypedDomainToEmulator(plan,getFirestore(app));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{await deleteApp(app);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Private domain staging blocked. No source data displayed.');
    process.exitCode=1;
  });
}
