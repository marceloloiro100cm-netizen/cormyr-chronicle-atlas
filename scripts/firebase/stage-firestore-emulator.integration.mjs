/**
 * Actual Firestore Emulator integration, with SYNTHETIC rows only.
 * Expects FIRESTORE_EMULATOR_HOST on loopback and demo-cormyr-migration.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {loadPrivateArchivePlan,main,assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const digest = value=>createHash('sha256').update(value).digest('hex');

async function run() {
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const root=await mkdtemp(join(tmpdir(),'cormyr-private-emu-e2e-'));
  const app=initializeApp({projectId},'cormyr-private-archive-e2e');
  try {
    const dir=join(root,'normalized');
    await mkdir(dir);
    const tables=[
      {table:'auth.users',columns:['id','encrypted_password'],rows:[
        {id:'private-user-id',encrypted_password:'private-hash-should-not-import'},
      ]},
      {table:'public.campaign_houses',columns:['id','name'],rows:[
        {id:'h1',name:'Synthetic House One'},
        {id:'h2',name:'Synthetic House Two'},
      ]},
      {table:'public.house_memberships',columns:['player_id','house_id'],rows:[
        {player_id:'p1',house_id:'h1'},
      ]},
    ];
    const entries=[];
    for(let i=0;i<tables.length;i++) {
      const t=tables[i];
      const file=String(i).padStart(3,'0')+'.json';
      const b=Buffer.from(JSON.stringify({
        sourceTable:t.table,columns:t.columns,rows:t.rows,
      }));
      await writeFile(join(dir,file),b);
      entries.push({table:t.table,file,rows:t.rows.length,sha256:digest(b)});
    }
    await writeFile(join(dir,'manifest.json'),JSON.stringify({
      formatVersion:1,valueEncoding:'postgres-copy-text-or-null',tables:entries,
    }));

    const plan=await loadPrivateArchivePlan(dir);
    assert.equal(plan.summary.archivedPublicRows,3);
    assert.equal(plan.summary.ignoredNonPublicRows,1);
    const db=getFirestore(app);
    const imported=await main(['--normalized',dir,'--execute-emulator'],{
      db,env:process.env,projectId,silent:true,
    });
    assert.equal(imported.emulatorWrites,7);
    const rootRef=db.collection('migrationPrivateSnapshots').doc(plan.snapshotId);
    const status=await rootRef.get();
    assert.equal(status.get('status'),'complete');
    const tableSnapshot=await rootRef.collection('tables').get();
    assert.equal(tableSnapshot.docs.length,2);
    let totalRows=0;
    for(const table of tableSnapshot.docs){
      const rows=await table.ref.collection('rows').get();
      totalRows+=rows.size;
    }
    assert.equal(totalRows,3);

    // Re-run with identical input: all document paths remain stable.
    const replay=await main(['--normalized',dir,'--execute-emulator'],{
      db,env:process.env,projectId,silent:true,
    });
    assert.equal(replay.archivedPublicRows,3);
    const replayTables=await rootRef.collection('tables').get();
    let replayRows=0;
    for(const table of replayTables.docs){
      replayRows+=(await table.ref.collection('rows').get()).size;
    }
    assert.equal(replayRows,3);
    console.log('Synthetic Firestore emulator snapshot: 3 public rows, repeat import idempotent, 0 Auth records copied.');
  }finally {
    await deleteApp(app);
    await rm(root,{recursive:true,force:true});
  }
}

run().catch(()=>{
  console.error('Synthetic Firebase emulator E2E failed; no real project was accessed.');
  process.exitCode=1;
});
