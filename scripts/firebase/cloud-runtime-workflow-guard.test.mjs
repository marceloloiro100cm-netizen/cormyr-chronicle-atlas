import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('.github/workflows/firebase-cloud-runtime-drafts.yml','utf8');
test('unprotected automatic job can only invoke fixed preview as reader',()=>{
  const a=s.slice(s.indexOf('  readonly-preview:'),s.indexOf('  protected-bootstrap:'));
  assert.ok(a.includes("CORMYR_RUNTIME_DRAFT_MODE: preview"));
  assert.ok(a.includes("CORMYR_RUNTIME_DRAFT_CONFIRMATION: ''"));
  assert.ok(a.includes('cormyr-gh-reader@cormyr.iam.gserviceaccount.com'));
  assert.ok(!a.includes('firebase-auth-test-activation'));
  assert.ok(!a.includes('inputs.confirmation'));
  assert.ok(!a.includes("MODE: apply"));
  assert.ok(!a.includes('write: all'));
});
test('only protected explicitly approved apply can create disabled roots',()=>{
  const b=s.slice(s.indexOf('  protected-bootstrap:'));
  assert.ok(b.includes("inputs.mode == 'apply'"));
  assert.ok(b.includes('environment: firebase-auth-test-activation'));
  assert.ok(b.includes('CORMYR_RUNTIME_DRAFT_MODE: apply'));
  assert.ok(b.includes('inputs.confirmation'));
  assert.ok(b.includes('vars.CORMYR_FIREBASE_AUTH_TEST_OPERATOR'));
  assert.ok(!b.includes("CORMYR_RUNTIME_DRAFT_MODE: preview"));
  assert.ok(s.includes('github.event_name'));
});
