/**
 * Verify a PRIVATE preservation snapshot round-trip against a Firestore Emulator.
 * Read only. No CLI option can connect to the cloud or modify any documents.
 * Never log source row content, IDs, email, message text, document paths or hashes.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertEmulatorOnly,
  loadPrivateArchivePlan,
} from './stage-firestore-emulator.mjs';

const DEMO_PROJECT = 'demo-cormyr-migration';
const COLLECTION = 'migrationPrivateSnapshots';
const digest = value=>createHash('sha256').update(value).digest('hex');
const fail = message => {throw new Error('Private archive verification failed: '+message);};

function equalJson(a,b) {
  // Firestore may return object keys in a different order from the source.
  return isDeepStrictEqual(a,b);
}

export async function verifyPrivateArchiveInEmulator(plan, db) {
  if (!plan?.summary?.emulatorPlanValid ||
      !/^[a-f0-9]{64}$/.test(plan.snapshotId)) {
    fail('invalid source plan');
  }
  const root = db.collection(COLLECTION).doc(plan.snapshotId);
  const status = await root.get();
  if (!status.exists || status.get('status')!=='complete' ||
      status.get('formatVersion')!==1 ||
      status.get('private')!==true ||
      status.get('publicRowsExpected')!==plan.summary.archivedPublicRows ||
      status.get('publicTablesExpected')!==plan.summary.archivedPublicTables) {
    fail('snapshot completion marker or source counts mismatch');
  }

  const tableSnapshot = await root.collection('tables').get();
  const expectedTables = new Map(plan.tableDocs.map(entry=>[entry.tableDigest,entry]));
  if (tableSnapshot.size !== expectedTables.size) fail('table count mismatch');

  const rowsByTable = new Map();
  for (const row of plan.plannedRows) {
    if (!rowsByTable.has(row.tableDigest)) rowsByTable.set(row.tableDigest,new Map());
    const map=rowsByTable.get(row.tableDigest);
    if (map.has(row.docId)) fail('source plan duplicate row');
    map.set(row.docId,row);
  }

  let verifiedRows=0, verifiedTables=0, verifiedChunks=0, chunkedRows=0;
  for (const table of tableSnapshot.docs) {
    const expectedTable=expectedTables.get(table.id);
    if (!expectedTable || !equalJson(table.data(), expectedTable.payload)) {
      fail('missing, extra or altered table metadata');
    }
    verifiedTables++;
    const expectedRows=rowsByTable.get(table.id)||new Map();
    const storedRows=await table.ref.collection('rows').get();
    if (storedRows.size!==expectedRows.size) fail('row count mismatch');

    for (const actualRow of storedRows.docs) {
      const expected=expectedRows.get(actualRow.id);
      if (!expected) fail('unexpected row');
      const actual=actualRow.data();
      if (!expected.chunks?.length) {
        if (!equalJson(actual,expected.payload)) fail('row content mismatch');
      } else {
        chunkedRows++;
        const expectedHeader=expected.payload;
        if (!equalJson(actual,expectedHeader)) fail('large row metadata mismatch');
        const docs=await actualRow.ref.collection('chunks').get();
        if (docs.size!==expected.chunks.length) fail('large row fragment count mismatch');
        const byId=new Map(docs.docs.map(d=>[d.id,d.data()]));
        const byteSlices=[];
        for (const chunk of expected.chunks) {
          const stored=byId.get(chunk.docId);
          if (!stored || !equalJson(stored,chunk.payload)) {
            fail('large row fragment differs from source');
          }
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(stored.dataBase64)) {
            fail('large row fragment has invalid Base64');
          }
          const part=Buffer.from(stored.dataBase64,'base64');
          if (part.length!==stored.byteLength || digest(part)!==stored.sha256) {
            fail('large row fragment digest mismatch');
          }
          byteSlices.push(part);
          verifiedChunks++;
        }
        const bytes=Buffer.concat(byteSlices);
        if (bytes.length!==expectedHeader.rawValuesByteLength ||
            digest(bytes)!==expectedHeader.rawValuesSha256) {
          fail('large row reconstructed digest mismatch');
        }
        let restored;
        try {restored=JSON.parse(bytes.toString('utf8'));}
        catch {fail('large row reconstruction is not valid JSON');}
        if (!Array.isArray(restored) ||
            restored.length!==expectedTable.payload.columns.length ||
            digest(JSON.stringify(expectedTable.payload.columns.map((column,i)=>[column,restored[i]])))!==expectedHeader.sourceRowSha256) {
          fail('large row original source digest mismatch');
        }

      }
      verifiedRows++;
    }
  }

  if (verifiedRows!==plan.summary.archivedPublicRows ||
      verifiedTables!==plan.summary.archivedPublicTables ||
      verifiedChunks!==plan.summary.totalChunks ||
      chunkedRows!==plan.summary.chunkedRows) fail('final archive totals mismatch');

  return {
    scope:'private-firestore-emulator-roundtrip-readonly',
    verificationPassed:true,
    verifiedTables, verifiedRows, verifiedChunks, verifiedChunkedRows:chunkedRows,
    sourceSnapshotMatched:true,
    cloudReads:0, cloudWrites:0,
    readyForCloudImport:false,
  };
}

async function cli(args) {
  if (args.length!==2 || args[0]!=='--normalized' || !args[1]) {
    throw new Error('Usage: node scripts/firebase/verify-firestore-emulator.mjs --normalized PRIVATE_DIR');
  }
  assertEmulatorOnly(process.env,DEMO_PROJECT);
  const plan=await loadPrivateArchivePlan(args[1]);
  if (!plan.summary.emulatorPlanValid) fail('source plan failed preflight');
  const {initializeApp,deleteApp} = await import('firebase-admin/app');
  const {getFirestore} = await import('firebase-admin/firestore');
  const app=initializeApp({projectId:DEMO_PROJECT},'cormyr-private-roundtrip-verify');
  try {
    const result=await verifyPrivateArchiveInEmulator(plan,getFirestore(app));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally{
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).catch(()=>{
    console.error('Archive verification blocked or failed; no personal data printed.');
    process.exitCode=1;
  });
}
