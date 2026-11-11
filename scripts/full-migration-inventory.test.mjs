import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MIGRATION_TABLES,assertInventory,compareInventories,run} from './full-migration-inventory.mjs';

const fixture=(override={})=>({
  format_version:1,
  tables:Object.fromEntries(MIGRATION_TABLES.map(name=>[name,{present:true,count:'4'}])),
  ...override
});

test('counts match does not grant production cutover or imply password/attachment validation',()=>{
  const result=compareInventories(fixture(),fixture());
  assert.equal(result.aggregate_counts_match,true);
  assert.equal(result.users_and_password_hashes_validated,false);
  assert.equal(result.storage_file_bytes_validated,false);
  assert.equal(result.cutover_authorized,false);
});
test('reports differing category without exposing rows',()=>{
  const altered=fixture();altered.tables['auth.users'].count='3';
  const result=compareInventories(fixture(),altered);
  assert.deepEqual(result.differing_counts,['auth.users']);
  assert.equal(result.aggregate_counts_match,false);
});
test('missing storage or auth data blocks equality',()=>{
  const altered=fixture();altered.tables['storage.objects']={present:false,count:null};
  const result=compareInventories(fixture(),altered);
  assert.deepEqual(result.missing_categories,['storage.objects']);
  assert.equal(result.aggregate_counts_match,false);
});
test('refuses extra keys and malformed values',()=>{
  assert.throws(()=>assertInventory(fixture({tables:{}})),/incompleto/);
  const invalid=fixture();invalid.tables['public.campaign_letters'].count='hello';
  assert.throws(()=>assertInventory(invalid),/inválida/);
});
test('no implicit database access without explicit command',async()=>{
  await assert.rejects(()=>run([]),/Uso:/);
  await assert.rejects(()=>run(['--snapshot'],{}),/CORMYR_MIGRATION_AUDIT_DATABASE_URL/);
});
