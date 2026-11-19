/**
 * Private cross-module source link audit after a complete workspace import.
 * Read-only: reports aggregate orphan counts, never source IDs or private values.
 * Does not assert UI behavior or reconciliation with newer operational writes.
 */
import {readWorkspaceTable} from './workspace-import.mjs';
import {inspectWorkspaceMetadata} from './workspace-audit.mjs';

export const RELATIONS=[
  ['casas','house_memberships','player_id','campaign_players','id',false],
  ['casas','house_memberships','house_id','campaign_houses','id',false],
  ['casas','noble_house_sheets','house_id','campaign_houses','id',false],
  ['registros','campaign_records','house_id','campaign_houses','id',true],
  ['registros','record_versions','record_id','campaign_records','id',false],
  ['missivas','campaign_letters','recipient_player_id','campaign_players','id',true],
  ['missivas','campaign_letters','recipient_house_id','campaign_houses','id',true],
  ['missivas','campaign_letters','origin_house_id','campaign_houses','id',true],
  ['missivas','letter_replies','letter_id','campaign_letters','id',false],
  ['missivas','letter_receipts','letter_id','campaign_letters','id',false],
  ['missivas','letter_versions','letter_id','campaign_letters','id',false],
  ['missivas','letter_reply_versions','reply_id','letter_replies','id',false],
  ['missivas','campaign_letter_consequences','letter_id','campaign_letters','id',false],
  ['jornal','campaign_newspaper_revisions','newspaper_id','campaign_newspapers','id',false],
  ['jornal','campaign_newspaper_reads','newspaper_id','campaign_newspapers','id',false],
  ['espionagem','spy_assets','owner_house_id','campaign_houses','id',false],
  ['espionagem','spy_operations','agent_id','spy_assets','id',false],
  ['espionagem','spy_operation_events','operation_id','spy_operations','id',false],
  ['espionagem','spy_mission_timeline','operation_id','spy_operations','id',false],
  ['espionagem','spy_agent_history','agent_id','spy_assets','id',false],
  ['espionagem','spy_agent_upgrades','agent_id','spy_assets','id',false],
  ['espionagem','spy_agent_removals','agent_id','spy_assets','id',false],
];

/** Pure aggregate projection, for tests and server. */
export function analyzeWorkspaceLinks(tables){
  if(!tables||typeof tables!=='object')throw Error('workspace_links_invalid');
  const index=new Map();
  const checked=new Map();
  for(const [,, ,target,key] of RELATIONS){
    if(index.has(target))continue;
    const rows=tables[target];
    if(!Array.isArray(rows))throw Error('workspace_links_missing_table');
    if(rows.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error('workspace_links_invalid');
    const ids=new Set();
    for(const row of rows){
      const v=row[key];
      if(typeof v==='string'&&v.length>0||typeof v==='number'&&Number.isSafeInteger(v))
        ids.add(String(v));
    }
    index.set(target,ids);
  }
  for(const [module,source,field,target,,nullable] of RELATIONS){
    const rows=tables[source];
    if(!Array.isArray(rows))throw Error('workspace_links_missing_table');
    let valid=0,orphan=0,blank=0,missingField=0;
    for(const row of rows){
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error('workspace_links_invalid');
      if(!Object.hasOwn(row,field)){missingField++;continue;}
      const id=row[field];
      if(id==null||id===''){blank++;continue;}
      if(index.get(target).has(String(id)))valid++;
      else orphan++;
    }
    checked.set(module+'|'+source+'|'+field,{
      module,source,field,target,sourceRows:rows.length,
      valid,orphan,blank,missingField,optional:nullable,
    });
  }
  const modules={};
  for(const relation of checked.values()){
    const m=modules[relation.module]??{relations:0,valid:0,orphan:0,
      blank:0,missingField:0};
    m.relations++;m.valid+=relation.valid;m.orphan+=relation.orphan;
    m.blank+=relation.blank;m.missingField+=relation.missingField;
    modules[relation.module]=m;
  }
  const all=[...checked.values()];
  return {
    status:'complete',readOnly:true,sourceRelationshipsChecked:true,
    operationalConnected:false,liveDataReconciled:false,
    referencesChecked:all.reduce((n,v)=>n+v.valid+v.orphan,0),
    orphanReferences:all.reduce((n,v)=>n+v.orphan,0),
    unverifiedFields:all.reduce((n,v)=>n+v.missingField,0),
    modules,relations:all,
  };
}

export async function inspectWorkspaceLinks(db,snapshotId){
  const meta=await inspectWorkspaceMetadata(db,snapshotId);
  if(meta.status!=='complete')return {status:'pending',readOnly:true,
    sourceRelationshipsChecked:false,operationalConnected:false};
  const unique=[...new Set(RELATIONS.flatMap(v=>[v[1],v[3]]))];
  const fetched=await Promise.all(unique.map(name=>readWorkspaceTable(db,snapshotId,name)));
  return analyzeWorkspaceLinks(Object.fromEntries(unique.map((n,i)=>[n,fetched[i]])));
}
