import {createHash} from 'node:crypto';
import {columnTypes} from './workspace-column-types.mjs';

export const WORKSPACE_ROOT='campaignWorkspaceImports';
export const workspaceTables=new Set([
  'campaign_houses','campaign_players','house_memberships','house_catalog',
  'campaign_records','record_versions','campaign_letters','letter_replies','letter_receipts',
  'letter_rounds','letter_versions','letter_reply_versions','narrator_mail_notes','campaign_letter_consequences',
  'noble_house_sheets','noble_house_ledger','noble_house_rule_overrides',
  'campaign_newspapers','campaign_newspaper_reads','campaign_newspaper_commissions',
  'campaign_newspaper_staff','campaign_newspaper_story_models','campaign_newspaper_engravings',
  'campaign_newspaper_settings','campaign_newspaper_revisions',
  'spy_regional_connections','spy_assets','spy_agent_history','spy_agent_upgrades','spy_agent_removals','spy_portrait_catalog',
  'spy_locations','spy_operations','spy_operation_segments','spy_operation_events','spy_noble_house_stats',
  'spy_mission_decisions','spy_mission_timeline','spy_intelligence_dossiers','spy_intelligence_findings',
  'spy_intelligence_mission_awards','spy_intelligence_events','spy_intelligence_admin_audit',
]);
export const digest=v=>createHash('sha256').update(v).digest('hex');
const fail=()=>{throw Error('workspace_archive_integrity_failed');};

export function decodeRow(table,columns,values){
  if(!Array.isArray(values)||values.length!==columns.length)fail();
  return Object.fromEntries(columns.map((key,i)=>{
    let value=values[i];
    if(value!==null&&typeof value!=='string')fail();
    const type=columnTypes[table]?.[key];
    if(value!==null){
      if(type==='boolean'){
        if(!['t','f','true','false'].includes(value))fail();
        value=value==='t'||value==='true';
      }else if(type==='number'){
        if(!/^-?\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))fail();
        value=Number(value);
      }else if(type==='Json'){
        try{value=JSON.parse(value);}catch{fail();}
      }else if(type==='string[]'){
        // Arrays containing escaped delimiters require explicit conversion, never silent splitting.
        if(value==='{}')value=[];
        else if(value.startsWith('[')){try{value=JSON.parse(value);}catch{fail();}}
        else if(/^\{[a-zA-Z0-9_ ,-]*\}$/.test(value))value=value.slice(1,-1).split(',');
        else fail();
      }
    }
    return [key,value];
  }));
}

export async function archiveValues(rowDoc,columns){
  const row=rowDoc.data();
  let values=row.rawValues;
  if(row.chunked===true){
    const parts=await rowDoc.ref.collection('chunks').orderBy('index').get();
    if(parts.size!==row.chunkCount)fail();
    const buffers=parts.docs.map((doc,i)=>{
      const p=doc.data(),b=Buffer.from(p.dataBase64,'base64');
      if(p.index!==i||b.length!==p.byteLength||digest(b)!==p.sha256)fail();
      return b;
    });
    const b=Buffer.concat(buffers);
    if(b.length!==row.rawValuesByteLength||digest(b)!==row.rawValuesSha256)fail();
    try{values=JSON.parse(b.toString('utf8'));}catch{fail();}
  }
  if(!Array.isArray(values)||values.length!==columns.length||
     digest(JSON.stringify(columns.map((c,i)=>[c,values[i]])))!==row.sourceRowSha256)fail();
  return values;
}

/** Additive, resumable import. Originals and operational Cloud writes are never overwritten. */
export async function importWorkspace(db,snapshotId){
  if(!/^[a-f0-9]{64}$/.test(snapshotId))fail();
  const source=db.collection('migrationPrivateSnapshots').doc(snapshotId);
  const marker=await source.get();
  if(!marker.exists||marker.data().status!=='complete'||marker.data().private!==true)fail();
  const target=db.collection(WORKSPACE_ROOT).doc(snapshotId);
  const existing=await target.get();
  if(existing.exists&&existing.data().formatVersion!==1)fail();
  const tables=await source.collection('tables').get();
  if(tables.size!==marker.data().publicTablesExpected)fail();
  const counts={};
  for(const metaDoc of tables.docs){
    const meta=metaDoc.data(),name=String(meta.sourceTable).replace(/^public\./,'');
    if(meta.sourceTable!=='public.'+name||!workspaceTables.has(name))continue;
    const rows=await metaDoc.ref.collection('rows').get();
    if(rows.size!==meta.rowCount)fail();
    const dest=target.collection('tables').doc(name);
    for(const doc of rows.docs){
      const values=await archiveValues(doc,meta.columns);
      const row=decodeRow(name,meta.columns,values);
      // Large content stays in the verified immutable archive, with a private pointer.
      const payload={sourceDocumentId:doc.id,sourceTableDocumentId:metaDoc.id,
        sourceRowSha256:doc.data().sourceRowSha256,
        ...(Buffer.byteLength(JSON.stringify(row))<700000?{row}:{archivePointer:true})};
      const ref=dest.collection('rows').doc(doc.id),old=await ref.get();
      if(old.exists){if(old.data().sourceRowSha256!==payload.sourceRowSha256)fail();}
      else await ref.create(payload);
      const checked=await ref.get();
      if(!checked.exists||checked.data().sourceRowSha256!==payload.sourceRowSha256)fail();
    }
    const check=await dest.collection('rows').get();
    if(check.size!==rows.size)fail();
    await dest.set({columns:meta.columns,rowCount:rows.size,sourceTableDocumentId:metaDoc.id});
    counts[name]=rows.size;
  }
  // Missing source tables remain an explicit error on access, never invented empty data.
  await target.set({formatVersion:1,private:true,status:'complete',counts,sourceSnapshotId:snapshotId});
  return {tables:Object.keys(counts).length,rows:Object.values(counts).reduce((a,b)=>a+b,0),counts};
}

export async function readWorkspaceTable(db,snapshotId,table){
  if(!workspaceTables.has(table))throw Error('workspace_table_not_supported');
  const root=db.collection(WORKSPACE_ROOT).doc(snapshotId),marker=await root.get();
  if(!marker.exists||marker.data().status!=='complete'||marker.data().private!==true)
    throw Error('workspace_import_pending');
  const ref=root.collection('tables').doc(table),meta=await ref.get();
  if(!meta.exists)throw Error('workspace_source_table_missing');
  const docs=await ref.collection('rows').get();
  if(docs.size!==meta.data().rowCount)fail();
  return Promise.all(docs.docs.map(async d=>{
    const v=d.data();
    if(!v.archivePointer)return v.row;
    const source=db.collection('migrationPrivateSnapshots').doc(snapshotId).collection('tables')
      .doc(v.sourceTableDocumentId).collection('rows').doc(v.sourceDocumentId);
    const original=await source.get();
    if(!original.exists||original.data().sourceRowSha256!==v.sourceRowSha256)fail();
    return decodeRow(table,meta.data().columns,await archiveValues(original,meta.data().columns));
  }));
}
