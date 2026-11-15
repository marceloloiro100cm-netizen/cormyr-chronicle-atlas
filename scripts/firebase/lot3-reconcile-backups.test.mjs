import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compareVerifiedSourceTables,excludedNonDomainTable,assessLot3Offline,
} from './lot3-reconcile-backups.mjs';

const table=(table,rows,columns=['id','body'])=>({table,rows,columns});
const entry=(id,body)=>({id,body});
const baseline=[
 table('public.campaign_letters',[entry('a','Carta secreta de A'),entry('b','Carta secreta de B')]),
 table('public.campaign_houses',[entry('ha','Castle A')]),
 table('auth.users',[entry('narrador','narrator@example.com')]),
];
const copy=x=>structuredClone(x);
const coverage=(unconsumed=[])=>({unconsumed,sourceTables:3,sourceRows:4,
 consumedTables:3,consumedRows:4});
const emulator={readyForEmulatorStage:true,
 stages:{auth:{valid:true},typedDomain:{valid:true}}};

test('compares source rows by stable ID without revealing IDs or private text',()=>{
 const after=copy(baseline);
 after[0].rows[0].body='Carta alterada, confidencial';
 after[0].rows.push(entry('c','Novo destinatário secreto'));
 after[1].rows[0].body='Castle A new name';
 const delta=compareVerifiedSourceTables(baseline,after);
 assert.equal(delta.createdRows,1);
 assert.equal(delta.modifiedRows,2);
 assert.equal(delta.removedRows,0);
 assert.equal(delta.schemaChanged,0);
 assert.equal(delta.destructiveDrift,false);
 assert.equal(delta.readyForCloudImport,false);
 const output=JSON.stringify(delta);
 for(const secret of ['Carta secreta','Carta alterada','narrador','narrator@example.com',
   'Castle A new name','Novo destinatário'])assert.equal(output.includes(secret),false);
});
test('source deletion blocks offline rehearsal until explicitly reviewed',()=>{
 const after=copy(baseline);
 after[0].rows.pop();
 const r=assessLot3Offline({baseline,candidate:after,coverage:coverage(),emulator});
 assert.equal(r.readyForOfflineRehearsal,false);
 assert.ok(r.blockers.includes('source_rows_removed_review_required'));
 assert.equal(r.cloudWrites,0);
 assert.equal(r.sourceLiveReconciled,false);
 assert.equal(r.readyForCutover,false);
});
test('detects dropped source tables and schema changes, never silently ignores them',()=>{
 const dropped=copy(baseline).slice(1);
 const d=compareVerifiedSourceTables(baseline,dropped);
 assert.equal(d.missingTables,1);
 assert.equal(d.removedRows,2);
 assert.equal(d.destructiveDrift,true);
 const changed=copy(baseline);
 changed[0].columns.push('newColumn');
 changed[0].rows.forEach(r=>{r.newColumn='new value';});
 assert.equal(compareVerifiedSourceTables(baseline,changed).schemaChanged,1);
});
test('rejects duplicate IDs, schema row corruption, or duplicate table inventories',()=>{
 const duplicate=copy(baseline);
 duplicate[0].rows.push(entry('a','duplicates cannot be trusted'));
 const d=compareVerifiedSourceTables(baseline,duplicate);
 assert.equal(d.duplicateIds,1);
 assert.equal(d.destructiveDrift,true);
 assert.throws(()=>compareVerifiedSourceTables(baseline,[...baseline,baseline[0]]));
 assert.throws(()=>compareVerifiedSourceTables(baseline,[
  table('public.campaign_letters',[{id:'x',body:undefined}]),
 ]));
});
test('compares keyless rows as multisets, including duplicate entries',()=>{
 const old=[table('public.memberships',[{member:'a'},{member:'a'},{member:'b'}],['member'])];
 const newer=[table('public.memberships',[{member:'a'},{member:'b'},{member:'b'}],['member'])];
 const d=compareVerifiedSourceTables(old,newer);
 assert.equal(d.createdRows,1);
 assert.equal(d.removedRows,1);
 assert.equal(d.tables[0].comparison,'row-multiset');
});
test('excludes infrastructure but never silently calls application tables migrated',()=>{
 assert.equal(excludedNonDomainTable('auth.sessions'),true);
 assert.equal(excludedNonDomainTable('storage.objects'),true);
 assert.equal(excludedNonDomainTable('public.campaign_letters'),false);
 assert.equal(excludedNonDomainTable('public.noble_house_ledger'),false);
 const r=assessLot3Offline({
  baseline,candidate:baseline,
  coverage:coverage([{table:'public.secret_domain',rows:8},{table:'storage.objects',rows:10}]),
  emulator,
 });
 assert.equal(r.readyForOfflineRehearsal,false);
 assert.deepEqual(r.coverage.unmodeled,[{table:'public.secret_domain',rows:8}]);
 assert.ok(r.blockers.includes('unmodeled_source_data'));
});
test('a clean offline comparison never claims cloud import or a frozen live source',()=>{
 const report=assessLot3Offline({
  baseline,candidate:copy(baseline),coverage:coverage(),emulator,
 });
 assert.equal(report.readyForOfflineRehearsal,true);
 assert.equal(report.sourceFreezeVerified,false);
 assert.equal(report.destinationEmptyVerified,false);
 assert.equal(report.storageObjectsVerified,false);
 assert.equal(report.readyForCloudImport,false);
 assert.equal(report.readyForCutover,false);
});
