/**
 * Lote 3: offline PostgreSQL backup-to-backup reconciliation.
 *
 * Inputs must already have passed loadVerifiedPrivateTables(): the manifest
 * and each normalized table are verified byte-for-byte. This script never
 * connects to Supabase/Firebase, mutates a database or prints row data,
 * identifiers, personal fields or per-row hashes.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {classifyTable} from './audit-migration-coverage.mjs';
import {stagerCoverage,loadStagerSources} from './audit-stager-coverage.mjs';
import {planUnifiedEmulator} from './stage-all-emulators.mjs';

const TABLE=/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const sha=s=>createHash('sha256').update(s).digest('hex');
const sorted=x=>[...x].sort((a,b)=>a.localeCompare(b));
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const byTable=tables=>{
  if(!Array.isArray(tables))throw Error('Invalid verified source table list');
  const out=new Map();
  for(const x of tables){
    if(!x||typeof x.table!=='string'||!TABLE.test(x.table)||
       out.has(x.table)||!Array.isArray(x.columns)||!Array.isArray(x.rows)||
       x.columns.length===0||new Set(x.columns).size!==x.columns.length||
       !x.columns.every(c=>typeof c==='string'&&c.length>0))
      throw Error('Invalid or duplicate verified source table');
    for(const r of x.rows){
      if(!r||typeof r!=='object'||Array.isArray(r)||
         Object.keys(r).length!==x.columns.length||
         !x.columns.every(k=>Object.hasOwn(r,k)&&
           (r[k]===null||typeof r[k]==='string')))
        throw Error('Invalid verified source row');
    }
    out.set(x.table,x);
  }
  return out;
};
const hashRow=(row,columns)=>sha(JSON.stringify(columns.map(c=>row[c])));

/**
 * Source rows without a single-column "id" key use a lossless multiset
 * comparison. A column named id must be unique in both snapshots.
 */
function deltaForTable(before,after) {
  const prev=before?.rows??[],next=after?.rows??[];
  const pc=before?.columns??[],nc=after?.columns??[];
  const schemaChanged=before!==undefined&&after!==undefined&&
    (pc.length!==nc.length||sorted(pc).some((x,i)=>x!==sorted(nc)[i]));
  if(schemaChanged)return {
    before:prev.length,after:next.length,created:0,removed:0,modified:0,
    schemaChanged:true,duplicateIds:false,comparison:'schema-incompatible',
  };
  const fields=sorted(before?.columns??after?.columns??[]);
  const hasId=fields.includes('id');
  if(hasId){
    const keyed=rows=>{
      const map=new Map();
      let duplicate=false;
      for(const row of rows){
        const id=row.id;
        if(typeof id!=='string'||!id||map.has(id))duplicate=true;
        if(typeof id==='string'&&id)map.set(id,hashRow(row,fields));
      }
      return {map,duplicate};
    };
    const a=keyed(prev),b=keyed(next);
    if(a.duplicate||b.duplicate)return {
      before:prev.length,after:next.length,created:0,removed:0,modified:0,
      schemaChanged:false,duplicateIds:true,comparison:'blocked-duplicate-id',
    };
    let created=0,removed=0,modified=0;
    for(const [id,digest] of b.map){
      if(!a.map.has(id))created++;
      else if(a.map.get(id)!==digest)modified++;
    }
    for(const id of a.map.keys())if(!b.map.has(id))removed++;
    return {before:prev.length,after:next.length,created,removed,modified,
      schemaChanged:false,duplicateIds:false,comparison:'source-id'};
  }
  const count=rows=>{
    const map=new Map();
    for(const row of rows){
      const digest=hashRow(row,fields);
      map.set(digest,(map.get(digest)||0)+1);
    }
    return map;
  };
  const a=count(prev),b=count(next);
  let created=0,removed=0;
  for(const [key,n] of b)created+=Math.max(0,n-(a.get(key)||0));
  for(const [key,n] of a)removed+=Math.max(0,n-(b.get(key)||0));
  return {before:prev.length,after:next.length,created,removed,modified:0,
    schemaChanged:false,duplicateIds:false,comparison:'row-multiset'};
}

export function compareVerifiedSourceTables(baseline,candidate){
  const prev=byTable(baseline),next=byTable(candidate);
  const names=sorted(new Set([...prev.keys(),...next.keys()]));
  const domains={},tables=[];
  let schemaChanged=0,duplicateIds=0,missingTables=0,removedRows=0;
  let addedTables=0,createdRows=0,modifiedRows=0,baselineRows=0,candidateRows=0;
  for(const name of names){
    const before=prev.get(name),after=next.get(name);
    const d=deltaForTable(before,after);
    const domain=classifyTable(name);
    const group=domains[domain]??(domains[domain]={
      baselineTables:0,candidateTables:0,baselineRows:0,candidateRows:0,
      created:0,removed:0,modified:0,
    });
    group.baselineTables+=Number(!!before);group.candidateTables+=Number(!!after);
    group.baselineRows+=d.before;group.candidateRows+=d.after;
    group.created+=d.created;group.removed+=d.removed;group.modified+=d.modified;
    baselineRows+=d.before;candidateRows+=d.after;createdRows+=d.created;
    removedRows+=d.removed;modifiedRows+=d.modified;
    if(d.schemaChanged)schemaChanged++;
    if(d.duplicateIds)duplicateIds++;
    if(!after)missingTables++;
    if(!before)addedTables++;
    // Table names, counters and comparison strategy only. No private values.
    tables.push({table:name,domain,baselineRows:d.before,candidateRows:d.after,
      created:d.created,removed:d.removed,modified:d.modified,
      schemaChanged:d.schemaChanged,duplicateIds:d.duplicateIds,
      comparison:d.comparison,
      removedFromCandidate:!after,addedInCandidate:!before});
  }
  return {
    compared:true,baselineTables:prev.size,candidateTables:next.size,
    baselineRows,candidateRows,addedTables,missingTables,schemaChanged,
    duplicateIds,createdRows,removedRows,modifiedRows,
    changedTables:tables.filter(x=>x.created||x.removed||x.modified||
      x.schemaChanged||x.removedFromCandidate||x.addedInCandidate||x.duplicateIds).length,
    destructiveDrift:missingTables>0||schemaChanged>0||duplicateIds>0||removedRows>0,
    domains,tables,
    sourceLiveReconciled:false,cloudWrites:0,readyForCloudImport:false,
    readyForCutover:false,
  };
}

/** These have no player-facing Firestore models. Storage is a separate lot. */
export function excludedNonDomainTable(table){
  return /^(?:auth\.(?:sessions|refresh_tokens|flow_state|audit_log_entries|mfa_|sso_|one_time_tokens|schema_migrations)|storage\.|realtime\.|vault\.|cron\.|extensions\.|pg_|drizzle\.|supabase_migrations\.|public\.(?:schema_migrations|spatial_ref_sys))/.test(table);
}

/**
 * This is an OFFLINE dry-run gate, never authorization to write to Cloud.
 * Extra/dropped live tables and deletion require review, even if every
 * importer understands the format. Every result explicitly denies cutover.
 */
export function assessLot3Offline({baseline,candidate,coverage,emulator}){
  const delta=compareVerifiedSourceTables(baseline,candidate);
  if(!coverage||!Array.isArray(coverage.unconsumed)||
     !emulator||typeof emulator!=='object')
    throw Error('Invalid migration coverage plan');
  const unmodeled=coverage.unconsumed
    .filter(x=>x.rows>0&&!excludedNonDomainTable(x.table))
    .map(x=>({table:x.table,rows:x.rows}));
  const blockers=[
    ...(delta.missingTables?['source_tables_removed']:[]),
    ...(delta.schemaChanged?['table_schema_changed']:[]),
    ...(delta.duplicateIds?['duplicate_source_ids']:[]),
    ...(delta.removedRows?['source_rows_removed_review_required']:[]),
    ...(delta.addedTables?['new_source_tables_review_required']:[]),
    ...(unmodeled.length?['unmodeled_source_data']:[]),
    ...(emulator.readyForEmulatorStage!==true?['emulator_stage_preflight_failed']:[]),
  ];
  return {
    scope:'OFFLINE-BACKUP-RECONCILIATION-ONLY',
    sourceManifestVerified:true,sourceLiveReconciled:false,
    reportVersion:1,delta,
    coverage:{
      sourceTables:coverage.sourceTables,sourceRows:coverage.sourceRows,
      consumedTables:coverage.consumedTables,consumedRows:coverage.consumedRows,
      unmodeled,
    },
    emulator:{readyForEmulatorStage:emulator.readyForEmulatorStage===true,
      stages:Object.fromEntries(Object.entries(emulator.stages??{}).map(
        ([name,stage])=>[name,{valid:stage?.valid===true}]))},
    blockers,requiresReview:blockers.length>0,
    // Dry run completeness is NOT proof of live database freshness, destination
    // emptiness, actual Storage bytes, Auth account safety or CI E2E.
    readyForOfflineRehearsal:blockers.length===0,
    sourceFreezeVerified:false,destinationEmptyVerified:false,
    storageObjectsVerified:false,cloudWrites:0,readyForCloudImport:false,
    readyForCutover:false,
  };
}

export async function prepareLot3Offline(baselineDir,candidateDir){
  const [a,b,stagers]=await Promise.all([
    loadVerifiedPrivateTables(baselineDir),
    loadVerifiedPrivateTables(candidateDir),
    loadStagerSources(new URL('.',import.meta.url).pathname),
  ]);
  const coverage=stagerCoverage(b.tables,stagers);
  const plan=planUnifiedEmulator(b.tables,b.snapshotHash);
  return assessLot3Offline({
    baseline:a.tables,candidate:b.tables,coverage,emulator:plan.summary,
  });
}

async function main(args){
  if(args.length!==4||args[0]!=='--baseline'||args[2]!=='--candidate'||
     !args[1]||!args[3]||args[1].startsWith('--')||args[3].startsWith('--'))
    throw Error('Usage: node scripts/firebase/lot3-reconcile-backups.mjs --baseline PRIVATE_NORMALIZED_OLD --candidate PRIVATE_NORMALIZED_NEW');
  const report=await prepareLot3Offline(args[1],args[3]);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.readyForOfflineRehearsal)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(()=>{
    console.error('Offline reconciliation blocked: invalid or unavailable private backup. No rows printed or database writes attempted.');
    process.exitCode=2;
  });
