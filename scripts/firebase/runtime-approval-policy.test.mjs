import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeApprovalEnabled} from './runtime-approval-policy.mjs';

const activeRuntime = {
  status: 'active',
  applicationEnabled: true,
  sourceSnapshotReconciled: true,
  houseOpsWriteApproved: false,
  spyWriteApproved: undefined,
  mailWriteApproved: true,
};

test('fail-closed por padrão quando a variável de produção não está ativa', () => {
  assert.equal(runtimeApprovalEnabled(activeRuntime, 'mailWriteApproved', {}), true);
  assert.equal(runtimeApprovalEnabled(activeRuntime, 'houseOpsWriteApproved', {}), false);
  assert.equal(runtimeApprovalEnabled(activeRuntime, 'spyWriteApproved', {}), false);
});

test('libera todas as funções automaticamente em produção apenas com runtime ativo e reconciliado', () => {
  const prodEnv = {CORMYR_FIREBASE_ALL_CAMPAIGN_FUNCTIONS_ENABLED: 'true'};
  assert.equal(runtimeApprovalEnabled(activeRuntime, 'houseOpsWriteApproved', prodEnv), true);
  assert.equal(runtimeApprovalEnabled(activeRuntime, 'spyWriteApproved', prodEnv), true);
  assert.equal(
    runtimeApprovalEnabled({...activeRuntime, status: 'draft'}, 'houseOpsWriteApproved', prodEnv),
    false,
  );
  assert.equal(
    runtimeApprovalEnabled({...activeRuntime, applicationEnabled: false}, 'houseOpsWriteApproved', prodEnv),
    false,
  );
  assert.equal(
    runtimeApprovalEnabled({...activeRuntime, sourceSnapshotReconciled: false}, 'houseOpsWriteApproved', prodEnv),
    false,
  );
  assert.equal(runtimeApprovalEnabled(null, 'houseOpsWriteApproved', prodEnv), false);
});
