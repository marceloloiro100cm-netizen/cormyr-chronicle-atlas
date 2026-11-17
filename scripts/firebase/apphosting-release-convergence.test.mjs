import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectReleaseConvergence,formatReleaseConvergenceSummary,
} from './apphosting-release-convergence.mjs';

const EXPECTED='b'.repeat(40);
const STALE='a'.repeat(40);
function result(served,{
  complete=true,match=false,reason='OBSERVATION_WINDOW_EXHAUSTED',
  attempts=16,
}={}){
  return {
    report:{auditComplete:complete,domainServingCommit:served},
    observation:{
      attempts,comparison:match?'MATCH':'NOT_YET_MATCHING',
      matchingCommitObserved:match,stopReason:reason,
    },
  };
}

test('strict main release check confirms only exact serving revision',async()=>{
  let opts;
  const report=await inspectReleaseConvergence({
    expectedSha:EXPECTED,
    observe:async args=>{
      opts=args;
      return result(EXPECTED,{match:true,
        reason:'MATCH_OBSERVED',attempts:5});
    },
  });
  assert.deepEqual(opts,{expectedSha:EXPECTED,maxAttempts:16,
    intervalMs:20_000});
  assert.equal(report.revisionServingConfirmed,true);
  assert.equal(report.verifiedAtOnly,true);
  assert.equal(report.servingCommit,EXPECTED);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.writes,0);
  assert.match(formatReleaseConvergenceSummary(report),/CONFIRMADA/);
});

test('stale commit cannot produce false positive even after full polling window',async()=>{
  const report=await inspectReleaseConvergence({
    expectedSha:EXPECTED,observe:async()=>result(STALE),
  });
  assert.equal(report.revisionServingConfirmed,false);
  assert.equal(report.stopReason,'OBSERVATION_WINDOW_EXHAUSTED');
  assert.equal(report.observationCount,16);
  assert.equal(report.readyForPlayers,false);
  assert.match(formatReleaseConvergenceSummary(report),/NÃO CONFIRMADA/);
});

test('inconclusive API, IAM, or mismatched proof cannot become a release',async()=>{
  for(const values of [
    result(EXPECTED,{complete:false,match:true,reason:'MATCH_OBSERVED'}),
    result(EXPECTED,{complete:true,match:false,reason:'MATCH_OBSERVED'}),
    result(EXPECTED,{complete:true,match:true,reason:'READ_PERMISSION_REQUIRED'}),
    result(STALE,{complete:true,match:true,reason:'MATCH_OBSERVED'}),
  ]){
    const report=await inspectReleaseConvergence({
      expectedSha:EXPECTED,observe:async()=>values,
    });
    assert.equal(report.revisionServingConfirmed,false);
    assert.equal(report.readyForPlayers,false);
  }
});

test('invalid expected commit short circuits before contacting Cloud',async()=>{
  for(const invalid of [undefined,'',STALE.slice(0,15),
    'not_sha','X'.repeat(40)]){
    let calls=0;
    const report=await inspectReleaseConvergence({
      expectedSha:invalid,observe:async()=>{calls++;throw Error('must not call');},
    });
    assert.equal(calls,0);
    assert.equal(report.stopReason,'NO_EXPECTED_COMMIT');
    assert.equal(report.revisionServingConfirmed,false);
    assert.equal(report.writes,0);
  }
});

test('GitHub summary never prints untrusted provider errors or secrets',()=>{
  const text=formatReleaseConvergenceSummary({
    expectedCommit:EXPECTED,
    servingCommit:'Bearer PRIVATE_OIDC_TOKEN',
    stopReason:'PRIVATE_ERROR_WITH_EMAIL',
    observationCount:1,
    revisionServingConfirmed:false,
  });
  assert.ok(!text.includes('PRIVATE_'));
  assert.ok(!text.includes('Bearer'));
  assert.ok(text.includes('INCONCLUSIVE'));
});
