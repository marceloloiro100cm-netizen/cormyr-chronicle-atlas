import test from 'node:test';
import assert from 'node:assert/strict';
import {auditProductionRoleMatrix,summaryRoleMatrix,ORIGIN}
  from './production-role-readonly-acceptance.mjs';

const a='house_A',b='house_B';
const tokens={narrator:'n'.repeat(35),playerA:'a'.repeat(35),playerB:'b'.repeat(35)};
const expected=[401,200,200,200,403,200,403];
test('real role read-only matrix applies all seven scenarios without exposing tokens',async()=>{
 const seen=[];
 const fetcher=async(url,opts)=>{
   seen.push({url,opts});
   return {status:expected[seen.length-1]};
 };
 const result=await auditProductionRoleMatrix({houseA:a,houseB:b,tokens,fetcher});
 assert.equal(result.roleMatrixPassed,true);
 assert.equal(result.readyForPlayers,false);
 assert.equal(result.productionWrites,0);
 assert.equal(seen.length,7);
 assert.ok(seen.every(x=>x.url===ORIGIN+'/api/firebase-cloud-read'));
 assert.ok(seen.every(x=>x.opts.method==='POST'&&x.opts.redirect==='error'&&
   x.opts.credentials==='omit'));
 assert.equal('Authorization' in seen[0].opts.headers,false);
 const report=JSON.stringify(result)+summaryRoleMatrix(result);
 assert.ok(!report.includes(tokens.narrator)&&!report.includes(tokens.playerA));
 assert.ok(!report.includes(a)&&!report.includes(b));
});
test('wrong scope or unavailable HTTP prevents acceptance',async()=>{
 const r=await auditProductionRoleMatrix({
   houseA:a,houseB:b,tokens,
   fetcher:async()=>({status:503}),
 });
 assert.equal(r.roleMatrixPassed,false);
 assert.equal(r.scenariosPassed,0);
 assert.equal(r.readyForPlayers,false);
});
test('missing real tokens or duplicate house IDs hard block',async()=>{
 await assert.rejects(auditProductionRoleMatrix({houseA:a,houseB:a,tokens}));
 await assert.rejects(auditProductionRoleMatrix({houseA:a,houseB:b,tokens:{
   ...tokens,playerB:'',
 }}));
});
