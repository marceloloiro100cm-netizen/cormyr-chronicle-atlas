/**
 * Service-only metadata audit of the immutable Cormyr workspace import.
 * Never returns source identifiers, private row contents, credentials or hashes.
 * A matching metadata report DOES NOT imply that live interfaces are connected.
 */
import {WORKSPACE_ROOT,workspaceTables} from './workspace-import.mjs';

const SNAPSHOT=/^[a-f0-9]{64}$/;
const MODULES={
  casas:['campaign_houses','campaign_players','house_memberships','house_catalog',
    'noble_house_sheets','noble_house_ledger','noble_house_rule_overrides'],
  registros:['campaign_records','record_versions'],
  missivas:['campaign_letters','letter_replies','letter_receipts',
    'letter_rounds','letter_versions','letter_reply_versions',
    'narrator_mail_notes','campaign_letter_consequences'],
  jornal:['campaign_newspapers','campaign_newspaper_reads','campaign_newspaper_commissions',
    'campaign_newspaper_staff','campaign_newspaper_story_models',
    'campaign_newspaper_engravings','campaign_newspaper_settings',
    'campaign_newspaper_revisions'],
  espionagem:['spy_assets','spy_agent_history',
    'spy_agent_upgrades','spy_agent_removals','spy_portrait_catalog','spy_locations',
    'spy_operations','spy_operation_segments','spy_operation_events',
    'spy_noble_house_stats','spy_mission_decisions','spy_mission_timeline',
    'spy_intelligence_dossiers','spy_intelligence_findings',
    'spy_intelligence_mission_awards','spy_intelligence_events',
    'spy_intelligence_admin_audit'],
};
const failed=()=>{throw Error('workspace_metadata_inconsistent');};
const validCount=v=>Number.isSafeInteger(v)&&v>=0;
const validDocId=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!v.includes('/');
const total=values=>values.reduce((n,v)=>n+v,0);

export async function inspectWorkspaceMetadata(db,snapshotId){
  if(!SNAPSHOT.test(snapshotId||'')||!db?.collection)failed();
  const root=db.collection(WORKSPACE_ROOT).doc(snapshotId);
  const marker=await root.get();
  if(!marker.exists||marker.data()?.status==='incomplete')
    return {status:'pending',readOnly:true,metadataConsistent:false,
      rowHashesRechecked:false,relationshipsVerified:false,
      operationalConnected:false};
  const m=marker.data();
  if(m?.status!=='complete'||m.private!==true||m.formatVersion!==1||
     m.sourceSnapshotId!==snapshotId||!m.counts||
     typeof m.counts!=='object'||Array.isArray(m.counts))failed();
  const names=Object.keys(m.counts);
  if(!names.length||names.length>workspaceTables.size||
     names.some(n=>!workspaceTables.has(n)||!validCount(m.counts[n])))failed();
  const tableDocs=await Promise.all(names.map(n=>root.collection('tables').doc(n).get()));
  for(let i=0;i<names.length;i++){
    const metadata=tableDocs[i].data();
    if(!tableDocs[i].exists||metadata?.rowCount!==m.counts[names[i]]||
       !validDocId(metadata.sourceTableDocumentId)||
       !Array.isArray(metadata.columns)||
       metadata.columns.some(c=>typeof c!=='string'||!c.length)||
       new Set(metadata.columns).size!==metadata.columns.length)failed();
  }
  // Only aggregate table names and counts. These are access-controlled and
  // never prove that the UI, mail actions or snapshot delta are reconciled.
  const modules=Object.fromEntries(Object.entries(MODULES).map(([key,expected])=>{
    const present=expected.filter(name=>Object.hasOwn(m.counts,name));
    return [key,{
      tablesImported:present.length,tablesExpected:expected.length,
      rows:total(present.map(name=>m.counts[name])),
      missingTables:expected.filter(name=>!Object.hasOwn(m.counts,name)),
    }];
  }));
  const accounted=new Set(Object.values(MODULES).flat());
  const uncovered=names.filter(n=>!accounted.has(n));
  return {status:'complete',readOnly:true,metadataConsistent:true,
    rowHashesRechecked:false,relationshipsVerified:false,
    operationalConnected:false,sourceSnapshotReconciled:false,
    tablesImported:names.length,rowsImported:total(names.map(n=>m.counts[n])),
    otherImportedTables:uncovered.length,
    modules};
}
