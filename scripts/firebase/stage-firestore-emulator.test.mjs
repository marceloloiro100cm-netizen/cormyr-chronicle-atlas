import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertEmulatorOnly, buildPrivateArchivePlan,
  loadPrivateArchivePlan, writePrivateArchiveToEmulator, main,
} from './stage-firestore-emulator.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const hash = sha('backup');
const table = (name, columns, rows) => ({table:name,columns,rows});

class FakeRef {
  constructor(db, path) { this.db=db; this.path=path; }
  collection(name) { return new FakeRef(this.db, this.path + '/' + name); }
  doc(name) { return new FakeRef(this.db, this.path + '/' + name); }
  async set(payload) { this.db.writes.push({path:this.path,payload}); }
}
class FakeDb {
  constructor() { this.writes=[]; }
  collection(name) { return new FakeRef(this,name); }
  batch() {
    const writes=[];
    return {
      set(ref,payload) { writes.push({path:ref.path,payload}); },
      commit: async() => { this.writes.push(...writes); },
    };
  }
}

test('preserves public COPY text/null but never archives auth or storage secrets', () => {
  const plan = buildPrivateArchivePlan([
    table('auth.users',['id','encrypted_password'],[{id:'secret-uid',encrypted_password:'private-hash'}]),
    table('storage.objects',['id','name'],[{id:'obj-id',name:'private-image.png'}]),
    table('public.campaign_houses',['id','name','active'],[
      {id:'house-one',name:'House One',active:'t'},
      {id:'house-two',name:'House Two',active:null},
    ]),
  ],hash);
  assert.equal(plan.summary.sourceTables,3);
  assert.equal(plan.summary.archivedPublicRows,2);
  assert.equal(plan.summary.archivedPublicTables,1);
  assert.equal(plan.summary.ignoredNonPublicRows,2);
  assert.equal(plan.summary.emulatorPlanValid,true);
  assert.equal(plan.summary.cloudWrites,0);
  assert.equal(plan.summary.readyForCloudImport,false);
  assert.ok(!JSON.stringify(plan.summary).includes('secret-uid'));
  assert.ok(!JSON.stringify(plan).includes('private-hash'));
  assert.ok(!JSON.stringify(plan).includes('private-image.png'));
  assert.deepEqual(plan.plannedRows[0].payload.rawValues,['house-one','House One','t']);
});

test('document IDs remain stable when rows reorder and duplicate keyless rows exist', () => {
  const a = [
    {house_id:'house-one',player_id:'one'},
    {house_id:'house-two',player_id:'two'},
    {house_id:'house-one',player_id:'one'},
  ];
  const b = [a[2],a[1],a[0]];
  const p = rows => buildPrivateArchivePlan([
    table('public.house_memberships',['house_id','player_id'],rows),
  ],hash);
  const ids = rows => p(rows).plannedRows.map(x=>x.docId).sort();
  assert.deepEqual(ids(a),ids(b));
  assert.equal(new Set(ids(a)).size,3);
});

test('duplicated explicit IDs fail before any write; large rows are losslessly chunked', async () => {
  const duplicate = buildPrivateArchivePlan([
    table('public.campaign_letters',['id','content'],[
      {id:'x',content:'private'},
      {id:'x',content:'duplicate'},
    ]),
  ],hash);
  assert.equal(duplicate.summary.issues.duplicateIds,1);
  assert.equal(duplicate.summary.emulatorPlanValid,false);
  const db = new FakeDb();
  await assert.rejects(writePrivateArchiveToEmulator(duplicate,db),/incomplete or invalid/);
  assert.equal(db.writes.length,0);

  const tooLarge = buildPrivateArchivePlan([
    table('public.campaign_letters',['id','content'],[
      {id:'x',content:'A'.repeat(860*1024)},
    ]),
  ],hash);
  assert.equal(tooLarge.summary.issues.oversizedRows,0);
  assert.equal(tooLarge.summary.chunkedRows,1);
  assert.equal(tooLarge.summary.emulatorPlanValid,true);
  assert.ok(tooLarge.summary.totalChunks>=3);
  assert.equal(tooLarge.plannedRows[0].payload.chunked,true);

  const written = new FakeDb();
  const result=await writePrivateArchiveToEmulator(tooLarge,written);
  assert.equal(result.chunksStored,tooLarge.summary.totalChunks);
  const chunkDocs=written.writes.filter(w=>w.path.includes('/chunks/'));
  assert.equal(chunkDocs.length,tooLarge.summary.totalChunks);
  assert.ok(chunkDocs.every(w=>Buffer.byteLength(JSON.stringify(w.payload))<850*1024));
  const reconstructed=Buffer.concat(chunkDocs
    .sort((a,b)=>a.payload.index-b.payload.index)
    .map(w=>{
      const bytes=Buffer.from(w.payload.dataBase64,'base64');
      assert.equal(sha(bytes),w.payload.sha256);
      return bytes;
    }));
  assert.equal(sha(reconstructed),tooLarge.plannedRows[0].payload.rawValuesSha256);
  assert.deepEqual(JSON.parse(reconstructed.toString('utf8')), ['x','A'.repeat(860*1024)]);
});

test('non-string COPY data and invalid table names never become valid plans', () => {
  const bad = buildPrivateArchivePlan([
    table('public.campaign_houses',['id','name'],[{id:'valid',name:42}]),
    table('bad/path',['id'],[{id:'valid'}]),
  ],hash);
  assert.equal(bad.summary.emulatorPlanValid,false);
  assert.equal(bad.summary.issues.invalidRows,1);
  assert.equal(bad.summary.issues.invalidTable,1);
});

test('cloud project or nonlocal emulator host is rejected', () => {
  assert.throws(()=>assertEmulatorOnly({FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'}, 'demo-cormyr-migration'),/local|Local/);
  assert.throws(()=>assertEmulatorOnly({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}, 'cormyr'),/demo Firebase/);
  assert.throws(()=>assertEmulatorOnly({FIRESTORE_EMULATOR_HOST:'http://127.0.0.1:8080'}, 'demo-cormyr-migration'),/local|Local/);
  assert.doesNotThrow(()=>assertEmulatorOnly({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},'demo-cormyr-migration'));
});

test('emulator writer uses fixed private namespace, deterministic rows and completion marker', async () => {
  const plan=buildPrivateArchivePlan([
    table('public.campaign_houses',['id','name'],[
      {id:'a',name:'Alpha'}, {id:'b',name:'Beta'},
    ]),
  ],hash);
  const db=new FakeDb();
  const result=await writePrivateArchiveToEmulator(plan,db);
  assert.equal(result.archivedPublicRows,2);
  assert.equal(result.cloudWrites,0);
  assert.equal(result.emulatorWrites,5); // start marker, table, 2 rows, complete marker
  assert.equal(db.writes[0].payload.status,'incomplete');
  assert.equal(db.writes.at(-1).payload.status,'complete');
  assert.equal(db.writes.filter(w=>w.path.includes('/rows/')).length,2);
  assert.ok(db.writes.every(w=>w.path.startsWith('migrationPrivateSnapshots/')));
  assert.ok(!JSON.stringify(result).includes('Alpha'));
});

async function fixtureDir(root,name,specs) {
  const dir=join(root,name);
  await mkdir(dir);
  const entries=[];
  for (let i=0;i<specs.length;i++) {
    const spec=specs[i];
    const file=String(i).padStart(3,'0')+'.json';
    const bytes=Buffer.from(JSON.stringify({
      sourceTable:spec.table,columns:spec.columns,rows:spec.rows,
    }));
    await writeFile(join(dir,file),bytes);
    entries.push({table:spec.table,file,rows:spec.rows.length,sha256:sha(bytes)});
  }
  await writeFile(join(dir,'manifest.json'),JSON.stringify({
    formatVersion:1,valueEncoding:'postgres-copy-text-or-null',tables:entries,
  }));
  return {dir,files:entries};
}

test('private manifest SHA validation and explicit dry-run versus demo emulator execution', async()=>{
  const root=await mkdtemp(join(tmpdir(),'cormyr-safe-emulator-'));
  try {
    const {dir,files}=await fixtureDir(root,'normalized',[
      table('auth.users',['id','encrypted_password'],[{id:'private-uid',encrypted_password:'hash'}]),
      table('public.campaign_players',['id','name'],[{id:'player1',name:'Confidential Name'}]),
    ]);
    const plan=await loadPrivateArchivePlan(dir);
    assert.equal(plan.summary.archivedPublicRows,1);
    assert.equal(plan.summary.ignoredNonPublicRows,1);

    const db=new FakeDb();
    const audit=await main(['--normalized',dir],{silent:true,db});
    assert.equal(audit.scope,'PRIVATE-FIRESTORE-EMULATOR-ARCHIVE-ONLY');
    assert.equal(db.writes.length,0);
    const imported=await main(['--normalized',dir,'--execute-emulator'],{
      silent:true,db,env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},
      projectId:'demo-cormyr-migration',
    });
    assert.equal(imported.archivedPublicRows,1);
    assert.equal(imported.cloudWrites,0);
    assert.equal(db.writes.filter(w=>w.path.includes('/rows/')).length,1);
    assert.ok(!JSON.stringify(imported).includes('Confidential Name'));

    // Wrong checksum must abort before staging.
    const entry=files[1];
    await writeFile(join(dir,entry.file),'{}');
    await assert.rejects(loadPrivateArchivePlan(dir),/SHA-256/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});


test('large Unicode rows are chunked without UTF-8 corruption, and replay IDs are stable', async () => {
  const value='Olá 🐉'.repeat(125000);
  const records=() => [table('public.campaign_letters',['id','content'],
    [{id:'secret-row',content:value}])];
  const a=buildPrivateArchivePlan(records(),hash);
  const b=buildPrivateArchivePlan(records(),hash);
  assert.equal(a.summary.emulatorPlanValid,true);
  assert.equal(a.summary.chunkedRows,1);
  assert.equal(a.plannedRows[0].docId,b.plannedRows[0].docId);
  assert.deepEqual(a.plannedRows[0].chunks.map(x=>x.docId),
    b.plannedRows[0].chunks.map(x=>x.docId));
  const parts=a.plannedRows[0].chunks.map(x=>Buffer.from(x.payload.dataBase64,'base64'));
  const bytes=Buffer.concat(parts);
  assert.equal(sha(bytes),a.plannedRows[0].payload.rawValuesSha256);
  assert.deepEqual(JSON.parse(bytes.toString('utf8')),['secret-row',value]);

  const db=new FakeDb();
  await writePrivateArchiveToEmulator(a,db);
  const firstIds=new Set(db.writes.map(w=>w.path));
  await writePrivateArchiveToEmulator(a,db);
  assert.deepEqual(new Set(db.writes.map(w=>w.path)),firstIds);
  const summary=JSON.stringify(a.summary);
  assert.ok(!summary.includes('secret-row'));
  assert.ok(!summary.includes('Olá'));
  assert.equal(a.summary.cloudWrites,0);
});
