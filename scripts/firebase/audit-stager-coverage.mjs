/**
 * Table-level coverage of the emulator stagers over the verified private
 * backup. A table counts as "consumed" when some stage-*-emulator.mjs names it.
 * Aggregate counts and schema table names only; never row content. This is not
 * a completion percentage and never sets readyForCutover.
 */
import {readdir,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadVerifiedPrivateTables} from './stage-firestore-emulator.mjs';
import {classifyTable} from './audit-migration-coverage.mjs';

const TABLE=/['"`]((?:public|auth|storage)\.[a-z0-9_]+)['"`]/g;

export function tablesByStager(sources){
  const map=new Map();
  for(const {file,text} of sources){
    for(const m of String(text).matchAll(TABLE)){
      if(!map.has(m[1]))map.set(m[1],new Set());
      map.get(m[1]).add(file);
    }
  }
  return map;
}

export function stagerCoverage(tables,sources){
  if(!Array.isArray(tables))throw Error('Invalid verified normalized table list');
  const by=tablesByStager(sources);
  const seen=new Set(),byDomain={},unconsumed=[];
  let consumedTables=0,consumedRows=0,totalRows=0;
  for(const t of tables){
    if(typeof t?.table!=='string'||seen.has(t.table)||!Array.isArray(t.rows))throw Error('Invalid or duplicated verified table in audit');
    seen.add(t.table);
    const rows=t.rows.length,domain=classifyTable(t.table),ok=by.has(t.table);
    const d=byDomain[domain]||(byDomain[domain]={tables:0,rows:0,consumedTables:0,consumedRows:0});
    d.tables++;d.rows+=rows;totalRows+=rows;
    if(ok){d.consumedTables++;d.consumedRows+=rows;consumedTables++;consumedRows+=rows;}
    else unconsumed.push({table:t.table,rows});
  }
  const referencedMissing=[...by.keys()].filter(n=>!seen.has(n)).sort();
  return {
    scope:'verified-private-postgres-backup-vs-stager-sources',
    sourceTables:tables.length,sourceRows:totalRows,consumedTables,consumedRows,
    unconsumedTables:unconsumed.length,unconsumedRows:totalRows-consumedRows,
    unconsumed:unconsumed.sort((a,b)=>b.rows-a.rows||a.table.localeCompare(b.table)),
    stagerTablesAbsentFromBackup:referencedMissing,
    byDomain,readyForCutover:false,cloudWrites:0,
  };
}

export async function loadStagerSources(dir){
  const names=(await readdir(dir)).filter(n=>/^stage-.*-emulator\.mjs$/.test(n)).sort();
  return Promise.all(names.map(async file=>({file,text:await readFile(join(dir,file),'utf8')})));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3){console.error('Usage: node scripts/firebase/audit-stager-coverage.mjs PRIVATE_NORMALIZED_DIR');process.exitCode=2;}
  else{
    (async()=>{
      const {tables}=await loadVerifiedPrivateTables(process.argv[2]);
      const sources=await loadStagerSources(dirname(fileURLToPath(import.meta.url)));
      process.stdout.write(JSON.stringify(stagerCoverage(tables,sources),null,2)+'\n');
    })().catch(()=>{console.error('Stager coverage audit failed. No private row data printed.');process.exitCode=1;});
  }
}
