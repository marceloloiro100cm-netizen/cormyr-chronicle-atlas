import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeMigrationCoverage,classifyTable,
} from './audit-migration-coverage.mjs';

const table=(name,n)=>({
  table:name,columns:['id'],rows:Array.from({length:n},(_,i)=>({id:String(i)})),
});

test('classifies all source tables and never equates raw storage to functional migration',()=>{
  const report=summarizeMigrationCoverage([
    table('auth.users',4),
    table('auth.identities',5),
    table('public.campaign_houses',2),
    table('public.campaign_letters',3),
    table('public.campaign_calendar',1),
    table('public.campaign_time_operations',1),
    table('public.battle_sim_sessions',9),
    table('public.campaign_newspaper_issues',3),
    table('storage.objects',5),
  ]);
  assert.equal(report.sourceTables,9);
  assert.equal(report.sourceRows,33);
  assert.equal(report.publicTables,6);
  assert.equal(report.publicRows,19);
  assert.equal(report.typedReadOnlyRows,6);
  assert.equal(report.temporalPrivateStagingRows,1);
  assert.equal(report.notYetFunctionallyModeledPublicRows,12);
  assert.equal(report.authPreparationRows,9);
  assert.equal(report.otherSchemaRows,14);
  assert.equal(report.cloudWrites,0);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.allFunctionsReimplemented,false);
  assert.ok(!JSON.stringify(report).includes('private-uid'));
});

test('does not silently drop unknown domains or table names',()=>{
  assert.equal(classifyTable('public.campaign_newspaper_issue'),'newspaper');
  assert.equal(classifyTable('public.spy_agents'),'espionage');
  assert.equal(classifyTable('public.battle_dnd_sessions'),'battle-and-units');
  assert.equal(classifyTable('public.noble_house_sheets'),'houses-and-players');
  assert.equal(classifyTable('public.random_new_feature'),'other');
  const report=summarizeMigrationCoverage([table('public.unrecognized',4)]);
  assert.equal(report.notYetFunctionallyModeledPublicRows,4);
  assert.ok(report.sourceSchemaRequiredMissing.includes('auth.users'));
});

test('duplicate or corrupt source table blocks even aggregate coverage',()=>{
  const d=table('public.campaign_houses',1);
  assert.throws(()=>summarizeMigrationCoverage([d,d]),/duplicated/);
  assert.throws(()=>summarizeMigrationCoverage([{table:'x',rows:null}]),/Invalid/);
});
