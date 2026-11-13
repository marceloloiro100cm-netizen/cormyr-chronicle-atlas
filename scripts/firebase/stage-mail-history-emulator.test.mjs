import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {planMailHistory} from './stage-mail-history-emulator.mjs';
import {syntheticMailHistory} from './mail-history-fixtures.mjs';

const HASH=createHash('sha256').update('synthetic-private-mail-stage').digest('hex');
const plan=source=>planMailHistory(source,HASH);

test('preserves every reply, read receipt, version, round and narrator note',()=>{
  const p=plan(syntheticMailHistory());
  assert.equal(p.summary.planValid,true);
  assert.equal(p.summary.sourceTables,8);
  assert.equal(p.summary.sourceReplyRows,8);
  assert.equal(p.summary.deliveredReplies,1);
  assert.equal(p.summary.privatelyArchivedReplies,7);
  assert.equal(p.summary.replyCoverageComplete,true);
  assert.equal(p.summary.archiveRows,16);
  assert.equal(p.summary.sourceHistoryRows,16);
  assert.equal(p.summary.cloudWrites,0);
  assert.equal(p.summary.readyForCloudImport,false);
  assert.equal(p.summary.applicationWritesImplemented,false);
  assert.equal(p.replies[0].payload.authorUid,'alice');
  assert.equal(p.replies[0].payload.recipientUid,'bob');
  assert.equal(p.replies[0].payload.publicationState,'delivered');
  assert.deepEqual(p.summary.privateReasons,{
    draft:1,scheduled:1,deleted:1,missingParent:1,
    unpublishedParent:2,unresolvedRecipient:1,invalidProjection:0,oversized:0,
  });
  assert.equal(p.archive.plannedRows.length,16);
  assert.ok(p.archive.tableDocs.every(row=>row.payload.sourceTable.startsWith('public.')));
  assert.ok(!JSON.stringify(p.summary).includes('Confidential test'));
  assert.ok(!JSON.stringify(p.summary).includes('secret'));
});

test('missing tables, duplicate reply ID, and malformed source block staged writes',()=>{
  const missing=syntheticMailHistory().slice(0,-1);
  assert.equal(plan(missing).summary.planValid,false);
  assert.ok(plan(missing).summary.missingTables.includes('public.campaign_letter_consequences'));
  const duplicate=syntheticMailHistory();
  duplicate.find(x=>x.table==='public.letter_replies').rows[1].id='r1';
  assert.equal(plan(duplicate).summary.planValid,false);
  assert.equal(plan(duplicate).summary.issues.duplicateReplyIds,1);
  const corrupt=syntheticMailHistory();
  corrupt.find(x=>x.table==='public.letter_versions').rows[0].snapshot=42;
  assert.equal(plan(corrupt).summary.planValid,false);
});

test('oversized delivered reply remains privately archived and fragmented',()=>{
  const data=syntheticMailHistory();
  data.find(x=>x.table==='public.letter_replies').rows[0].content='X'.repeat(940000);
  const p=plan(data);
  assert.equal(p.summary.planValid,true);
  assert.equal(p.summary.deliveredReplies,0);
  assert.equal(p.summary.privatelyArchivedReplies,8);
  assert.equal(p.summary.privateReasons.oversized,1);
  assert.ok(p.archive.plannedRows.some(row=>row.chunks.length>0));
});

test('invalid or missing delivery state never enters readable reply projection',()=>{
  const data=syntheticMailHistory();
  data.find(x=>x.table==='public.letter_replies').rows[0].publication_state=null;
  const p=plan(data);
  assert.equal(p.summary.planValid,true);
  assert.equal(p.summary.deliveredReplies,0);
  assert.equal(p.summary.privateReasons.invalidProjection,1);
  assert.equal(p.summary.privatelyArchivedReplies,8);
});
