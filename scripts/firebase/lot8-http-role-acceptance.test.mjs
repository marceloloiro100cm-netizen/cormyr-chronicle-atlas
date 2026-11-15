import test from 'node:test';
import assert from 'node:assert/strict';
import {LOT8_HTTP_SCENARIOS,assessLot8HttpRoleMatrix} from './lot8-http-role-acceptance.mjs';

test('full observed synthetic HTTP role matrix enforces cross-House isolation and revocation',()=>{
 const report=assessLot8HttpRoleMatrix(LOT8_HTTP_SCENARIOS);
 assert.equal(report.required,12);
 assert.equal(report.emulatorAcceptancePass,true);
 assert.equal(report.realIdentityCloudE2E,false);
 assert.equal(report.readyForCutover,false);
 assert.equal(report.cloudWrites,0);
});
test('missing any role (including locked narrator) blocks acceptance',()=>{
 const report=assessLot8HttpRoleMatrix(
  LOT8_HTTP_SCENARIOS.filter(x=>x.actor!=='locked-narrator'));
 assert.equal(report.emulatorAcceptancePass,false);
 assert.equal(report.missingScenarios.length,1);
});
test('a permissive 200 after House revocation is rejected',()=>{
 const forged=LOT8_HTTP_SCENARIOS.map(x=>({...x,
   status:x.phase==='revoked'&&x.actor==='alice'?200:x.status}));
 const report=assessLot8HttpRoleMatrix(forged);
 assert.equal(report.emulatorAcceptancePass,false);
 assert.equal(report.unexpectedScenarios.length,1);
});
test('duplicate, extra or malformed results are never accepted as passing',()=>{
 const duplicate=[...LOT8_HTTP_SCENARIOS,LOT8_HTTP_SCENARIOS[0]];
 assert.equal(assessLot8HttpRoleMatrix(duplicate).emulatorAcceptancePass,false);
 const extra=[...LOT8_HTTP_SCENARIOS,{phase:'baseline',actor:'guest',house:'B',status:200}];
 assert.equal(assessLot8HttpRoleMatrix(extra).emulatorAcceptancePass,false);
 assert.throws(()=>assessLot8HttpRoleMatrix([{}]),/Invalid role observation/);
});
