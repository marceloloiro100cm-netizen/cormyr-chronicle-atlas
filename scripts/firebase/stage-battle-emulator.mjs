/**
 * Runtime stage of the battle domain in Firestore Emulator ONLY: saved
 * simulation sessions with their ordered events, scenarios, V3 invitations
 * and live matches, house roster imports and the private D&D stores.
 * Every jsonb value is stored as JSON text (Firestore has no nested arrays
 * and large states are split into their own documents). Server-only;
 * aggregate counts only are printed.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly,loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';

const DEMO='demo-cormyr-migration';
export const ROOT='migrationBattleStage';
const T={
  sessions:'public.battle_sim_sessions',events:'public.battle_sim_events',scenarios:'public.battle_sim_scenarios',
  invitations:'public.battle_v3_invitations',live:'public.battle_v3_live_matches',roster:'public.battle_house_roster_imports',
  monsters:'public.battle_dnd_cormyr_monsters',dndSessions:'public.battle_dnd_sessions',
  overrides:'public.battle_dnd_monster_overrides',custom:'public.battle_dnd_custom_monsters',
  verified:'public.battle_dnd_verified_sources',
};
// derived collections not backed by a table of their own
const EXTRA=['states','liveReplays'];
const HASH=/^[a-f0-9]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODELS=new Set(['evenhand-model','ashkar-model','phelles-model','stonecastle-model','torchwinter-model','grantass-model']);
const CMDRS=new Set(['tillet','noble','knight','war-mage','purple-dragon','ranger','priest','engineer','quartermaster','ashkar-raider']);
const SCEN=new Set(['plain-open','contested-woods','border-hills','narrow-passage']);
const GROUPS=new Set(['Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos']);
const MAX_DOC=1000*1024;
const int=v=>v==null||v===''?null:/^-?\d+$/.test(v)?Number(v):NaN;
const num=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):NaN;
const bool=v=>v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
const iso=v=>{if(typeof v!=='string'||v==='')return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;};
const nz=v=>v===undefined||v===''?null:v;
const bytes=o=>Buffer.byteLength(JSON.stringify(o),'utf8');
const tb=s=>Buffer.byteLength(s,'utf8');
/** Parses a jsonb cell; returns the text unchanged when it is valid JSON of the expected kind. */
function jsonText(v,kind){
  if(v==null||v==='')return undefined;
  let p=v;
  if(typeof v==='string'){try{p=JSON.parse(v);}catch{return undefined;}}
  if(kind==='object'&&(p===null||typeof p!=='object'||Array.isArray(p)))return undefined;
  return JSON.stringify(p);
}

export function buildBattlePlan(tables,snapshotId){
  if(!Array.isArray(tables)||!HASH.test(snapshotId))throw new Error('Invalid verified source data');
  const by=new Map(tables.map(t=>[t.table,t]));
  const rows=n=>by.get(n)?.rows||[];
  const issues={duplicateIds:0,invalidValues:0,orphanLinks:0,brokenChains:0,oversizedDocuments:0};
  const docs=Object.fromEntries([...Object.keys(T),...EXTRA].map(k=>[k,[]]));
  const seen=new Set();
  const once=k=>{if(seen.has(k)){issues.duplicateIds++;return false;}seen.add(k);return true;};
  const bad=()=>{issues.invalidValues++;};
  const push=(type,id,payload)=>{if(bytes(payload)>MAX_DOC){issues.oversizedDocuments++;return false;}docs[type].push({id,payload});return true;};
  const sessionIds=new Map(),monsterIds=new Set();
  for(const r of rows(T.sessions)){
    const ver=int(r.state_version),ini=jsonText(r.initial_state_json,'object'),cur=jsonText(r.current_state_json,'object');
    const name=typeof r.name==='string'?r.name.trim():'';
    if(!UUID.test(r.id||'')||!UUID.test(r.created_by||'')||name.length<1||name.length>120||
       !['ready','active','completed','archived'].includes(r.status)||r.rules_version!=='PTE-2.0'||int(r.schema_version)!==2||
       ini===undefined||cur===undefined||tb(ini)>800000||tb(cur)>800000||!HASH.test(r.initial_state_hash||'')||
       !HASH.test(r.state_hash||'')||!Number.isInteger(ver)||ver<0||ver>1200){bad();continue;}
    if(!once('s:'+r.id))continue;
    if(!push('sessions',r.id,{id:r.id,createdBy:r.created_by,name,status:r.status,rulesVersion:'PTE-2.0',schemaVersion:2,
      initialStateHash:r.initial_state_hash,stateHash:r.state_hash,stateVersion:ver,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)}))continue;
    if(!push('states','initial:'+r.id,{sessionId:r.id,kind:'initial',json:ini}))continue;
    if(!push('states','current:'+r.id,{sessionId:r.id,kind:'current',json:cur}))continue;
    sessionIds.set(r.id,{initial:r.initial_state_hash,current:r.state_hash,version:ver});
  }
  const bySession=new Map();
  for(const r of rows(T.events)){
    const seq=int(r.seq),cmd=jsonText(r.command_json,'object'),ev=jsonText(r.event_json,'object');
    if(!UUID.test(r.session_id||'')||!Number.isInteger(seq)||seq<1||seq>1200||typeof r.command_id!=='string'||
       r.command_id.length<5||r.command_id.length>100||!UUID.test(r.actor_id||'')||cmd===undefined||ev===undefined||
       tb(cmd)>10000||tb(ev)>15000||!HASH.test(r.prev_hash||'')||!HASH.test(r.state_hash||'')){bad();continue;}
    if(!sessionIds.has(r.session_id)){issues.orphanLinks++;continue;}
    if(!once('e:'+r.session_id+':'+seq)||!once('ec:'+r.session_id+'|'+r.command_id))continue;
    if(!push('events',r.session_id+':'+seq,{sessionId:r.session_id,seq,commandId:r.command_id,actorId:r.actor_id,
      commandJson:cmd,eventJson:ev,prevHash:r.prev_hash,stateHash:r.state_hash,createdAt:iso(r.created_at)}))continue;
    if(!bySession.has(r.session_id))bySession.set(r.session_id,[]);
    bySession.get(r.session_id).push({seq,prev:r.prev_hash,hash:r.state_hash});
  }
  for(const [id,s] of sessionIds){
    const list=(bySession.get(id)||[]).sort((a,b)=>a.seq-b.seq);
    let prev=s.initial,ok=list.length===s.version;
    list.forEach((e,i)=>{if(e.seq!==i+1||e.prev!==prev)ok=false;prev=e.hash;});
    if(ok&&prev!==s.current)ok=false;
    if(!ok)issues.brokenChains++;
  }
  for(const r of rows(T.scenarios)){
    const map=jsonText(r.map_json,'object'),units=jsonText(r.units_json||'[]');
    const name=typeof r.name==='string'?r.name.trim():'';
    if(!UUID.test(r.id||'')||!UUID.test(r.created_by||'')||name.length<1||name.length>120||map===undefined||units===undefined||
       tb(map)>150000||tb(units)>800000||int(r.schema_version)!==2||r.rules_version!=='PTE-2.0'){bad();continue;}
    if(!once('sc:'+r.id))continue;
    push('scenarios',r.id,{id:r.id,createdBy:r.created_by,name,mapJson:map,unitsJson:units,createdAt:iso(r.created_at)});
  }
  const title=t=>typeof t==='string'&&t.length>=5&&t.length<=120;
  for(const r of rows(T.invitations)){
    if(!UUID.test(r.id||'')||!title(r.title)||!r.target_house_id||!UUID.test(r.created_by||'')||!SCEN.has(r.scenario)||
       !MODELS.has(r.attacker_model_id)||!MODELS.has(r.defender_model_id)||!CMDRS.has(r.attacker_commander)||
       !CMDRS.has(r.defender_commander)||!['open','closed'].includes(r.status)){bad();continue;}
    if(!once('inv:'+r.id))continue;
    push('invitations',r.id,{id:r.id,title:r.title,targetHouseId:r.target_house_id,createdBy:r.created_by,scenario:r.scenario,
      attackerModelId:r.attacker_model_id,defenderModelId:r.defender_model_id,attackerCommander:r.attacker_commander,
      defenderCommander:r.defender_commander,status:r.status,createdAt:iso(r.created_at)});
  }
  for(const r of rows(T.live)){
    const ver=int(r.state_version),rep=jsonText(r.replay_json);
    if(!UUID.test(r.id||'')||!title(r.title)||!r.attacker_house_id||!r.defender_house_id||r.attacker_house_id===r.defender_house_id||
       !UUID.test(r.created_by||'')||!Number.isInteger(ver)||ver<0||ver>1500||!HASH.test(r.state_hash||'')||rep===undefined||
       !['active','completed','closed'].includes(r.status)){bad();continue;}
    if(!once('lv:'+r.id))continue;
    if(!push('live',r.id,{id:r.id,title:r.title,attackerHouseId:r.attacker_house_id,defenderHouseId:r.defender_house_id,
      createdBy:r.created_by,stateVersion:ver,stateHash:r.state_hash,status:r.status,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)}))continue;
    push('liveReplays',r.id,{matchId:r.id,json:rep});
  }
  for(const r of rows(T.roster)){
    const q=int(r.quantity),st=int(r.standard_unit_strength),row=int(r.source_row),sim=bool(r.simulation_only);
    if(!r.source_key||!r.house_id||!r.unit_name||!r.catalog_id||!r.unit_type||!['green','trained','veteran','elite'].includes(r.training)||
       !Number.isInteger(q)||q<1||q>30||!Number.isInteger(st)||st<1||st>1000||!r.source_status||!r.source_region||
       !Number.isInteger(row)||!r.source_file_id||sim!==true){bad();continue;}
    if(!once('ro:'+r.source_key)||!once('rof:'+r.source_file_id+'|'+row))continue;
    push('roster',r.source_key,{sourceKey:r.source_key,houseId:r.house_id,unitName:r.unit_name,catalogId:r.catalog_id,
      unitType:r.unit_type,training:r.training,quantity:q,standardUnitStrength:st,
      unitStrengthBasis:nz(r.unit_strength_basis)||'unit-military-standard',sourceStatus:r.source_status,
      sourceRegion:r.source_region,sourceDomain:nz(r.source_domain),sourceRow:row,sourceFileId:r.source_file_id,
      sourceUrl:nz(r.source_url),sourceNote:nz(r.source_note),simulationOnly:true,importedAt:iso(r.imported_at)});
  }
  for(const r of rows(T.monsters)){
    const cr=num(r.challenge_rating),hp=int(r.hp),ac=int(r.ac),sp=int(r.speed_ft),cv=int(r.catalog_version);
    const melee=r.melee==null||r.melee===''?null:jsonText(r.melee),ranged=r.ranged==null||r.ranged===''?null:jsonText(r.ranged);
    if(!r.id||r.id.length>56||!r.name||r.name.length>120||!GROUPS.has(r.group_name)||!r.source||r.source.length>45||
       !(cr>=0&&cr<=30)||!Number.isInteger(hp)||hp<1||hp>100000||!Number.isInteger(ac)||ac<1||ac>40||
       !['T','S','M','L','H','G'].includes(r.size)||!Number.isInteger(sp)||sp<0||sp>1000||!Number.isInteger(cv)||
       melee===undefined&&r.melee!=null&&r.melee!==''||ranged===undefined&&r.ranged!=null&&r.ranged!==''){bad();continue;}
    if(!once('mo:'+r.id))continue;
    monsterIds.add(r.id);
    push('monsters',r.id,{id:r.id,name:r.name,groupName:r.group_name,source:r.source,challengeRating:cr,hp,ac,size:r.size,
      speedFt:sp,meleeJson:melee??null,rangedJson:ranged??null,catalogVersion:cv});
  }
  for(const r of rows(T.dndSessions)){
    const rep=typeof r.replay==='string'&&r.replay!==''?r.replay:undefined;
    const rawReplay=rep===undefined?undefined:(()=>{try{const p=JSON.parse(rep);return typeof p==='string'?p:rep;}catch{return rep;}})();
    const report=r.report==null||r.report===''?null:jsonText(r.report);
    if(!UUID.test(r.owner_id||'')||!r.battle_id||r.battle_id.length>120||rawReplay===undefined||report===undefined){bad();continue;}
    if(!once('ds:'+r.owner_id+'|'+r.battle_id))continue;
    push('dndSessions',dndId(r.owner_id,r.battle_id),{ownerId:r.owner_id,battleId:r.battle_id,replay:rawReplay,reportJson:report,
      updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.overrides)){
    const patch=jsonText(r.combat_patch||'{}','object');
    if(!r.monster_id||patch===undefined||!UUID.test(r.updated_by||'')){bad();continue;}
    if(!monsterIds.has(r.monster_id)){issues.orphanLinks++;continue;}
    if(!once('ov:'+r.monster_id))continue;
    push('overrides',r.monster_id,{monsterId:r.monster_id,combatPatchJson:patch,updatedBy:r.updated_by,updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.custom)){
    const pl=jsonText(r.payload,'object');let id=null;
    if(pl)id=JSON.parse(pl).id;
    if(!/^[a-z0-9][a-z0-9-]{0,55}$/.test(r.id||'')||pl===undefined||id!==r.id||int(r.catalog_version)!==2||!UUID.test(r.created_by||'')){bad();continue;}
    if(!once('cu:'+r.id))continue;
    push('custom',r.id,{id:r.id,payloadJson:pl,catalogVersion:2,createdBy:r.created_by,updatedAt:iso(r.updated_at)});
  }
  for(const r of rows(T.verified)){
    const cd=jsonText(r.combat_defaults,'object');
    if(!r.monster_id||cd===undefined||typeof r.source_filename!=='string'||r.source_filename.length<4||r.source_filename.length>160){bad();continue;}
    if(!monsterIds.has(r.monster_id)){issues.orphanLinks++;continue;}
    if(!once('vr:'+r.monster_id))continue;
    push('verified',r.monster_id,{monsterId:r.monster_id,combatDefaultsJson:cd,sourceFilename:r.source_filename,verifiedAt:iso(r.verified_at)});
  }
  const src=Object.fromEntries(Object.keys(T).map(k=>[k,rows(T[k]).length]));
  const counts=Object.fromEntries(Object.keys(T).map(k=>[k,docs[k].length]));
  const complete=Object.keys(T).every(k=>counts[k]===src[k]);
  return {snapshotId,docs,summary:{
    planValid:complete&&Object.values(issues).every(n=>n===0),
    sourceCounts:src,stagedCounts:{...counts,states:docs.states.length,liveReplays:docs.liveReplays.length},
    coverageComplete:complete,issues}};
}
import {createHash} from 'node:crypto';
function dndId(owner,battle){return createHash('sha256').update(owner+'\u0000'+battle).digest('hex');}

export async function loadBattlePlan(dir){
  const {tables,snapshotHash}=await loadVerifiedPrivateTables(dir);
  return buildBattlePlan(tables,snapshotHash);
}

export async function writeBattleToEmulator(plan,db){
  assertEmulatorOnly(process.env,DEMO);
  if(!plan?.summary?.planValid)throw new Error('Battle plan blocked before writes');
  const root=db.collection(ROOT).doc(plan.snapshotId);
  await root.set({status:'incomplete',formatVersion:1,private:true});
  let written=1,batch=db.batch(),pending=0,size=0;
  const flush=async()=>{if(!pending)return;await batch.commit();written+=pending;batch=db.batch();pending=0;size=0;};
  for(const [type,items] of Object.entries(plan.docs))for(const item of items){
    const b=bytes(item.payload);
    if(pending>0&&(pending>=50||size+b>4*1024*1024))await flush();
    batch.set(root.collection(type).doc(item.id),item.payload);pending++;size+=b;}
  await flush();
  await root.set({status:'complete',formatVersion:1,private:true,counts:plan.summary.stagedCounts});
  written++;
  return {staged:true,stagedCounts:plan.summary.stagedCounts,emulatorWrites:written,firebaseCloudWrites:0};
}

async function main(args){
  if(args.length<2||args[0]!=='--normalized')throw Error('Use --normalized DIR [--execute-emulator]');
  const execute=args.length===3&&args[2]==='--execute-emulator';
  if(args.length!==2&&!execute)throw Error('Invalid CLI args');
  const plan=await loadBattlePlan(args[1]);
  if(!execute){process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');return;}
  assertEmulatorOnly(process.env,DEMO);
  if(!plan.summary.planValid)throw Error('Invalid battle plan');
  const {initializeApp,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO},'cormyr-battle-stage');
  try{process.stdout.write(JSON.stringify(await writeBattleToEmulator(plan,getFirestore(app)),null,2)+'\n');}
  finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{console.error('Battle staging blocked. No source data displayed.');process.exitCode=1;});
}
