/**
 * Dedicated GitHub Actions release-convergence gate for Cormyr App Hosting.
 * Only already-available GitHub OIDC App Hosting metadata GETs.
 * Does not deploy, activate Auth, publish data, change IAM, or enable access.
 *
 * Distinct from the short, advisory live-revision audit: the CI job succeeds
 * ONLY when the exact main commit is observed serving 100% of domain traffic.
 * A job may fail while rollout is merely slow. Re-run to confirm, never force.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {observeServingRevision} from './apphosting-live-revision-readonly.mjs';

const SHA=/^[a-f0-9]{40}$/;
const reasons=new Set([
  'MATCH_OBSERVED','READ_PERMISSION_REQUIRED','NO_EXPECTED_COMMIT',
  'SERVING_BACKEND_UNCONFIRMED','BRANCH_NOT_MAIN_OR_UNCONFIRMED',
  'AUTOMATIC_ROLLOUT_DISABLED_OR_UNCONFIRMED',
  'OBSERVATION_WINDOW_EXHAUSTED','INCONCLUSIVE',
]);
const safeSha=value=>SHA.test(value??'')?value:null;

export async function inspectReleaseConvergence({
  expectedSha,
  observe=observeServingRevision,
}={}){
  if(!safeSha(expectedSha))return {
    scope:'APPHOSTING_MAIN_RELEASE_CONVERGENCE_READ_ONLY',
    expectedCommit:null,servingCommit:null,
    observationCount:0,
    stopReason:'NO_EXPECTED_COMMIT',
    revisionServingConfirmed:false,
    verifiedAtOnly:false,
    readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',writes:0,
  };
  const {report,observation}=await observe({
    expectedSha,maxAttempts:16,intervalMs:20_000,
  });
  const confirmed=observation?.matchingCommitObserved===true&&
    observation?.comparison==='MATCH'&&
    observation?.stopReason==='MATCH_OBSERVED'&&
    report?.auditComplete===true&&
    report?.domainServingCommit===expectedSha;
  return {
    scope:'APPHOSTING_MAIN_RELEASE_CONVERGENCE_READ_ONLY',
    expectedCommit:expectedSha,
    servingCommit:safeSha(report?.domainServingCommit),
    observationCount:Number.isSafeInteger(observation?.attempts)&&
      observation.attempts>=0&&observation.attempts<=16
        ?observation.attempts:null,
    stopReason:reasons.has(observation?.stopReason)
      ?observation.stopReason:'INCONCLUSIVE',
    // Only confirms the exact revision at the instant the API was read.
    revisionServingConfirmed:confirmed,
    verifiedAtOnly:confirmed,
    readyForPlayers:false,
    readyForCutover:false,
    releaseDecision:'NO_GO',
    writes:0,
  };
}

export function formatReleaseConvergenceSummary(result){
  const verified=result?.revisionServingConfirmed===true;
  const cell=value=>safeSha(value)??'não confirmado';
  const reason=reasons.has(result?.stopReason)
    ?result.stopReason:'INCONCLUSIVE';
  return [
    '### App Hosting — confirmação independente da revisão servida',
    '- Commit esperado (main): '+cell(result?.expectedCommit),
    '- Commit servido durante a última consulta: '+cell(result?.servingCommit),
    '- Correspondência no domínio: **'+(verified?'CONFIRMADA':'NÃO CONFIRMADA')+'**',
    '- Observações limitadas: '+(Number.isSafeInteger(result?.observationCount)
      ?result.observationCount:'indefinidas'),
    '- Motivo: '+reason,
    '- Controle: somente metadados GET via OIDC GitHub; nenhuma publicação,',
    '  ativação de conta, IAM, DNS, Firestore ou Storage foram modificados.',
    '- Este check **não** aprova dados, login, permissões por Casa ou missivas.',
    '- Prontidão dos jogadores: **NO_GO** até aceite administrativo e E2E real.',
    '',
  ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const report=await inspectReleaseConvergence({
      expectedSha:process.env.GITHUB_SHA,
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        formatReleaseConvergenceSummary(report)+'\n','utf8');
    if(!report.revisionServingConfirmed)process.exitCode=2;
  }catch{
    process.stderr.write(
      'Auditoria da revisão inconclusiva. Nenhuma alteração no Cloud realizada.\n');
    process.exitCode=2;
  }
}
