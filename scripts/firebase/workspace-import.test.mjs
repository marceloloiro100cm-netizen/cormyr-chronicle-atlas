import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeRow,archiveValues,digest,workspaceTables} from './workspace-import.mjs';
test('decodes source types without changing strings or losing mail links',()=>{
 assert.deepEqual(decodeRow('campaign_letters',['content','delivery_week','court_member_id','military_unit_id'],['false','2','court','unit']),{content:'false',delivery_week:2,court_member_id:'court',military_unit_id:'unit'});
 assert.deepEqual(decodeRow('campaign_players',['active'],['t']),{active:true});
 assert.deepEqual(decodeRow('noble_house_sheets',['state'],['{"units":[]}']),{state:{units:[]}});
});
test('malformed source types fail instead of inventing values',()=>{
 assert.throws(()=>decodeRow('campaign_players',['active'],['yes']));
 assert.throws(()=>decodeRow('noble_house_sheets',['state'],['broken']));
 assert.throws(()=>decodeRow('campaign_letters',['delivery_week'],['two']));
});
test('source integrity is required before using the raw row',async()=>{
 const columns=['content'],rawValues=['Carta real'];
 const sourceRowSha256=digest(JSON.stringify([['content','Carta real']]));
 assert.deepEqual(await archiveValues({data:()=>({rawValues,sourceRowSha256})},columns),rawValues);
 await assert.rejects(archiveValues({data:()=>({rawValues:['changed'],sourceRowSha256})},columns));
});
test('allowlist includes history and editorial originals but excludes credentials and roles',()=>{
 for(const n of ['campaign_letters','letter_replies','letter_receipts','campaign_records','spy_operations','campaign_newspapers'])assert.ok(workspaceTables.has(n));
 for(const n of ['auth.users','users','profiles','campaign_access_profiles'])assert.ok(!workspaceTables.has(n));
});
