/**
 * A single protected, read-only OIDC audit of Firebase Cloud migration gates.
 * No Firebase Auth update, Firestore write, secret logging or release action.
 * A protected preview after dual-runtime alignment validation requires
 * environment approval; it never enables gameplay or changes any Cloud data.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {inspectFirebaseCloudReadiness} from './cloud-access-readiness.mjs';
import {inspectCloudRuntimeSources} from './cloud-runtime-source-preflight.mjs';
import {inspectPublicArchiveCoverage} from './public-archive-coverage-readonly.mjs';
import {inspectCloudRoleLinkage} from './cloud-role-linkage-readonly.mjs';
import {executeAllExistingAuthTestAccounts,safePreflightFailureCode}
  from './auth-enable-all-test-accounts.mjs';

const safeCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000?n:null;
const safeHttp=n=>Number.isSafeInteger(n)&&n>=100&&n<=599?n:null;
const ROLE_TYPES=Object.freeze(['narrador','jogador','editor','other']);
const ROLE_REASONS=Object.freeze([
  'missingProfile','unrecognizedProfile','accessInactiveOrInvalid',
  'passwordChangePendingOrInvalid','adminFlagMismatch',
  'invalidHouseLists','editScopeOutsideMembership',
  'playerWithoutHouse','editorWithHouse',
]);
/** Extract only validated aggregate data; never forward UIDs or private values. */
export function summarizeRoleLinkageEvidence(report){
  const checked=report?.scope==='FIREBASE_ROLE_LINKAGE_READ_ONLY'&&
    report.singleVerifiedSnapshot===true&&
    report.authListComplete===true&&report.accessListComplete===true&&
    report.houseReferenceAuditComplete===true&&
    report.accounts===14&&report.linkedAccounts===14&&
    report.writes===0;
  if(!checked)return {
    checked:false,accounts:null,eligible:null,
    blockingReasonCounts:null,eligibleByProfile:null,
    unresolvedHouseReferences:null,ready:false,
  };
  const reasons=Object.fromEntries(ROLE_REASONS.map(k=>[
    k,safeCount(report.blockingReasonCounts?.[k]),
  ]));
  const eligibleByProfile=Object.fromEntries(ROLE_TYPES.map(k=>[
    k,safeCount(report.structurallyEligibleByProfile?.[k]),
  ]));
  const complete=Object.values(reasons).every(v=>v!==null)&&
    Object.values(eligibleByProfile).every(v=>v!==null)&&
    safeCount(report.structurallyEligibleProfiles)!==null&&
    safeCount(report.unresolvedPlayerHouseReferences)!==null;
  return {
    checked:complete,accounts:14,
    eligible:complete?report.structurallyEligibleProfiles:null,
    blockingReasonCounts:complete?reasons:null,
    eligibleByProfile:complete?eligibleByProfile:null,
    unresolvedHouseReferences:complete?report.unresolvedPlayerHouseReferences:null,
    // Structural eligibility is NOT production authorization.
    ready:false,
  };
}
const AUX_STAGE_NAMES=new Set([
  'migrationPrivateGmStage','migrationDriveSyncStage',
  'migrationPublicContentStage','migrationStorageStage',
]);

/** Inspect a provider exception locally, but never print its message. */
export function classifyOperatorCredentialError(error){
  const msg=typeof error?.message==='string'?error.message:'';
  return /iam\.serviceAccounts\.getAccessToken/.test(msg)?
    'oidc_impersonation_denied':'oidc_credential_unavailable';
}

export function evaluateOperatorEvidence({
  cloud=null,authPreview=null,authError=null,cloudError=false,
  runtimeSources=null,runtimeSourceError=false,
  roleLinkage=null,roleLinkageError=false,
}={}){
  const stages=cloud?.singleVerifiedSnapshot===true&&cloud?.stagesVerified===6;
  const auxiliary=cloud?.auxiliaryStagesComplete===true&&cloud?.auxiliaryStagesVerified===4;
  // The source supplies fixed stage identifiers, never Firestore document IDs.
  const auxiliaryPendingStages=Array.isArray(cloud?.auxiliaryPendingStages)
    ?[...new Set(cloud.auxiliaryPendingStages.filter(name=>
      typeof name==='string'&&AUX_STAGE_NAMES.has(name)))]
    :[];
  const authValid=authPreview?.mode==='preview'&&
    authPreview.accounts===14&&authPreview.linkedAccounts===14&&
    authPreview.authUpdatesAttempted===0&&authPreview.authUsersEnabled===0&&
    authPreview.activationComplete===false&&
    safeCount(authPreview.toEnable)!==null&&
    safeCount(authPreview.alreadyEnabled)!==null&&
    authPreview.toEnable+authPreview.alreadyEnabled===14;
  const mail=cloud?.mailRuntimeEnabled===true;
  const runtime=cloud?.operationalRuntimeReconciled===true;
  const mailWriteGatesAligned=cloud?.mailWriteGatesAligned===true;
  const publicStage=cloud?.publicContentStageVerified===true;
  // Four independent, fail-closed production gates. These are not approvals.
  const fourBlocks={
    publicContent:{
      stageHttpStatus:safeHttp(cloud?.publicContentStageHttpStatus),
      stageVerified:publicStage,perRecordPublicReviewVerified:false,
      // Only exact public-name candidates; matching is NEVER review approval.
      archiveCoverage:{
        checked:runtimeSources?.archiveCoverage?.checked===true,
        archivedHouses:safeCount(runtimeSources?.archiveCoverage?.archivedHouses),
        archivedRegions:safeCount(runtimeSources?.archiveCoverage?.archivedRegions),
        sourceHouses:safeCount(runtimeSources?.archiveCoverage?.sourceHouses),
        activeSourceHouses:safeCount(runtimeSources?.archiveCoverage?.activeSourceHouses),
        exactMatches:safeCount(runtimeSources?.archiveCoverage?.exactMatches),
        ambiguousMatches:safeCount(runtimeSources?.archiveCoverage?.ambiguousMatches),
        unmatchedActive:safeCount(runtimeSources?.archiveCoverage?.unmatchedActive),
        candidateFields:Object.fromEntries(
          ['region','classification','crest','historyReference',
            'directDescription'].map(k=>[k,
              safeCount(runtimeSources?.archiveCoverage?.candidateFields?.[k])])),
        reviewApproved:false,ready:false,
      },
      ready:false,
    },
    operations:{
      mailRuntimeHttpStatus:safeHttp(cloud?.mailRuntimeHttpStatus),
      houseRuntimeHttpStatus:safeHttp(cloud?.operationalRuntimeHttpStatus),
      mailVerified:mail,houseVerified:runtime,
      mailWriteGatesAligned,
      calendarMetadataVerified:cloud?.historicalCalendarVersionVerified===true,
      sourceDeltaReconciled:false,
      sourcePreflight:{
        checked:runtimeSources!==null&&!runtimeSourceError,
        completeStages:safeCount(runtimeSources?.sourceStagesVerified),
        completeAuxiliaryStages:safeCount(runtimeSources?.auxiliaryStagesVerified),
        calendarDocumentVerified:runtimeSources?.calendarDocumentVerified===true,
        historicalRoundFound:runtimeSources?.calendarHasHistoricalRound===true,
        houseDraftConfirmed:runtimeSources?.houseDraftConfirmed===true,
        mailDraftConfirmed:runtimeSources?.mailDraftConfirmed===true,
        disabledDraftsConfirmed:runtimeSources?.disabledDraftsConfirmed===true,
        currentRoundApproved:false,
        ready:false,
      },
      ready:false,
    },
    playerAccess:{
      authAccountsEnabled:authValid&&authPreview.toEnable===0,
      linkageDiagnostics:roleLinkageError
        ?summarizeRoleLinkageEvidence()
        :summarizeRoleLinkageEvidence(roleLinkage),
      missingProfiles:authValid?safeCount(authPreview.missingProfiles):null,
      playersWithoutHouse:authValid?safeCount(authPreview.playersWithoutHouse):null,
      inactiveAccess:authValid?safeCount(authPreview.inactiveAccess):null,
      passwordResetPending:authValid?safeCount(authPreview.passwordResetPending):null,
      ready:false,
    },
    acceptance:{
      authenticatedCloudRoleE2EVerified:false,
      crossHouseIsolationVerified:false,
      gameplayWriteAndReloadVerified:false,
      ready:false,
    },
  };
  const blockingCodes=[];
  if(authError==='oidc_impersonation_denied')
    blockingCodes.push('OIDC_OPERATOR_IMPERSONATION_DENIED');
  else if(authError==='oidc_credential_unavailable')
    blockingCodes.push('OIDC_OPERATOR_CREDENTIAL_UNAVAILABLE');
  if(cloudError)blockingCodes.push('CLOUD_READ_FAILED');
  if(!stages)blockingCodes.push('PRIVATE_SNAPSHOT_STAGES_UNVERIFIED');
  if(!auxiliary)blockingCodes.push('AUXILIARY_STAGES_UNVERIFIED');
  if(!mail)blockingCodes.push('MAIL_RUNTIME_UNVERIFIED');
  if(!runtime)blockingCodes.push('OPERATIONAL_RUNTIME_UNVERIFIED');
  if(!mailWriteGatesAligned)blockingCodes.push('MAIL_WRITE_GATES_UNALIGNED');
  if(!authValid)blockingCodes.push('AUTH_INVENTORY_UNVERIFIED');
  if(authValid&&authPreview.toEnable>0)blockingCodes.push('AUTH_ACCOUNTS_STILL_DISABLED');
  if(authValid&&authPreview.pendingRoleOrHouse>0)
    blockingCodes.push('ROLES_OR_HOUSE_LINKS_INCOMPLETE');
  if(roleLinkageError||roleLinkage&&!summarizeRoleLinkageEvidence(roleLinkage).checked)
    blockingCodes.push('ROLE_LINKAGE_DIAGNOSIS_INCOMPLETE');
  blockingCodes.push('SOURCE_DELTA_AND_STORAGE_UNVERIFIED');
  blockingCodes.push('CROSS_HOUSE_CLOUD_E2E_PENDING');
  blockingCodes.push('PRODUCTION_RUNTIME_ACCEPTANCE_PENDING');
  return {
    project:'cormyr',scope:'CORMYR_PROTECTED_OPERATOR_READ_ONLY_AUDIT',
    authInventoryValid:Boolean(authValid),
    authAccounts:authValid?14:null,
    linkedAccounts:authValid?14:null,
    disabledAccounts:authValid?authPreview.toEnable:null,
    pendingRoleOrHouse:authValid?safeCount(authPreview.pendingRoleOrHouse):null,
    inactiveAccess:authValid?safeCount(authPreview.inactiveAccess):null,
    passwordResetPending:authValid?safeCount(authPreview.passwordResetPending):null,
    authPreflightFailure:typeof authError==='string'&&/^[a-z_]{1,80}$/.test(authError)
      ?authError:null,
    firestoreHttpStatus:safeHttp(cloud?.firestoreHttpStatus),
    authRestHttpStatus:safeHttp(cloud?.authHttpStatus),
    privateStagesVerified:safeCount(cloud?.stagesVerified),
    auxiliaryStagesVerified:safeCount(cloud?.auxiliaryStagesVerified),
    auxiliaryPendingStages,
    privateStagesComplete:stages,auxiliaryStagesComplete:auxiliary,
    mailRuntimeVerified:mail,operationalRuntimeVerified:runtime,
    mailWriteGatesAligned,
    runtimeSourceProbeFailed:runtimeSourceError===true,
    fourBlocks,
    authUpdatesAttempted:0,firestoreWrites:0,roleWrites:0,
    sourceLiveReconciliationVerified:false,storageVerified:false,
    crossHouseE2EVerified:false,readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',blockingCodes,
  };
}
export async function inspectOperatorEvidence({
  readCloud,previewAuth,readRuntimeSources,readRoleLinkage,
}={}){
  if(typeof readCloud!=='function'||typeof previewAuth!=='function')
    throw Error('two_read_probes_required');
  let cloud=null,authPreview=null,authError=null,cloudError=false;
  let runtimeSources=null,runtimeSourceError=false;
  let roleLinkage=null,roleLinkageError=false;
  try{cloud=await readCloud();}catch{cloudError=true;}
  try{authPreview=await previewAuth();}
  catch(e){authError=safePreflightFailureCode(e);}
  if(typeof readRuntimeSources==='function'){
    try{runtimeSources=await readRuntimeSources();}
    catch{runtimeSourceError=true;}
  }
  if(typeof readRoleLinkage==='function'){
    try{roleLinkage=await readRoleLinkage();}
    catch{roleLinkageError=true;}
  }
  return evaluateOperatorEvidence({
    cloud,authPreview,authError,cloudError,
    runtimeSources,runtimeSourceError,roleLinkage,roleLinkageError,
  });
}
/**
 * Audit execution is successful when independent protected source probes
 * completed. It is NOT a release decision: missing public review, disabled
 * operational runtimes and pending accounts still keep NO_GO.
 * An unavailable mandatory source or missing identity inventory remains a
 * technical failure, never a synthetic success.
 */
export function operatorAuditObservationComplete(report){
  return report?.authInventoryValid===true&&
    report?.privateStagesComplete===true&&
    report?.runtimeSourceProbeFailed===false&&
    report?.fourBlocks?.operations?.sourcePreflight?.checked===true&&
    report?.fourBlocks?.playerAccess?.linkageDiagnostics?.checked===true;
}

export function safeOperatorSummary(report){
  const n=v=>safeCount(v)??'desconhecido';
  const yes=v=>v===true?'Conferido':'Pendente';
  const err=/^[a-z_]{1,80}$/.test(report?.authPreflightFailure??'')
    ?report.authPreflightFailure:'nenhum';
  return [
    '## Cormyr — auditoria protegida e somente leitura',
    '',
    '| Evidência agregada | Resultado |','| --- | --- |',
    '| Auth: 14 contas e vínculos | '+yes(report?.authInventoryValid)+' |',
    '| Contas desativadas | '+n(report?.disabledAccounts)+' |',
    '| Perfis/Casas incompletos | '+n(report?.pendingRoleOrHouse)+' |',
    '| Estágios privados | '+n(report?.privateStagesVerified)+'/6 |',
    '| Estágios auxiliares | '+n(report?.auxiliaryStagesVerified)+'/4 |',
    '| Estágios auxiliares pendentes | '+
      (Array.isArray(report?.auxiliaryPendingStages)
        ?report.auxiliaryPendingStages.filter(v=>AUX_STAGE_NAMES.has(v)).join(', ')||'Nenhum identificado'
        :'Não identificado')+' |',
    '| Acervo público comparado ao snapshot (somente nomes) | '+
      yes(report?.fourBlocks?.publicContent?.archiveCoverage?.checked)+' |',
    '| Casas ativas com correspondência exata de nome | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.exactMatches)+' / '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.activeSourceHouses)+' |',
    '| Casas ativas sem correspondência | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.unmatchedActive)+' |',
    '| Casas com região localizada no acervo (a revisar) | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.candidateFields?.region)+' |',
    '| Casas com classificação localizada (a revisar) | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.candidateFields?.classification)+' |',
    '| Brasões com referência pública (a revisar) | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.candidateFields?.crest)+' |',
    '| Histórias com referência pública (a revisar) | '+
      n(report?.fourBlocks?.publicContent?.archiveCoverage?.candidateFields?.historyReference)+' |',
    '| Conteúdo público: estágio | '+
      (Number.isInteger(report?.fourBlocks?.publicContent?.stageHttpStatus)
        ?'HTTP '+report.fourBlocks.publicContent.stageHttpStatus:'Indisponível')+
      ' · '+yes(report?.fourBlocks?.publicContent?.stageVerified)+' |',
    '| Contas sem perfil | '+n(report?.fourBlocks?.playerAccess?.missingProfiles)+' |',
    '| Jogadores sem Casa | '+n(report?.fourBlocks?.playerAccess?.playersWithoutHouse)+' |',
    '| Acessos de campanha inativos | '+n(report?.fourBlocks?.playerAccess?.inactiveAccess)+' |',
    '| Trocas de senha pendentes | '+n(report?.fourBlocks?.playerAccess?.passwordResetPending)+' |',
    '| Diagnóstico privado de perfis e Casas | '+
      yes(report?.fourBlocks?.playerAccess?.linkageDiagnostics?.checked)+' |',
    '| Contas estruturalmente elegíveis (não liberadas) | '+
      n(report?.fourBlocks?.playerAccess?.linkageDiagnostics?.eligible)+' |',
    '| Referências a Casas inválidas ou desatualizadas | '+
      n(report?.fourBlocks?.playerAccess?.linkageDiagnostics?.unresolvedHouseReferences)+' |',
    ...ROLE_REASONS.map(k=>'| Motivo: '+k+' | '+
      n(report?.fourBlocks?.playerAccess?.linkageDiagnostics?.blockingReasonCounts?.[k])+' |'),
    '| Correio operacional | '+yes(report?.mailRuntimeVerified)+' |',
    '| Runtime de Casas | '+yes(report?.operationalRuntimeVerified)+' |',
    '| Rodada e versão do calendário alinhadas entre runtimes | '+
      yes(report?.fourBlocks?.operations?.mailWriteGatesAligned)+' |',
    '| Pré-validação de fontes operacionais | '+
      yes(report?.fourBlocks?.operations?.sourcePreflight?.checked)+' |',
    '| Calendário privado histórico verificado | '+
      yes(report?.fourBlocks?.operations?.sourcePreflight?.calendarDocumentVerified)+' |',
    '| Runtime de Casas criado, inativo e íntegro | '+
      yes(report?.fourBlocks?.operations?.sourcePreflight?.houseDraftConfirmed)+' |',
    '| Runtime de Missivas criado, inativo e íntegro | '+
      yes(report?.fourBlocks?.operations?.sourcePreflight?.mailDraftConfirmed)+' |',
    '| Rodada atual aprovada | **Não — depende da fonte atual** |',
    '| Operação Cloud: correio e Casas (HTTP) | '+
      (Number.isInteger(report?.fourBlocks?.operations?.mailRuntimeHttpStatus)
        ?report.fourBlocks.operations.mailRuntimeHttpStatus:'?')+' / '+
      (Number.isInteger(report?.fourBlocks?.operations?.houseRuntimeHttpStatus)
        ?report.fourBlocks.operations.houseRuntimeHttpStatus:'?')+' |',
    '| Revisão pública por registro | Não verificada |',
    '| E2E autenticado entre Casas | Não verificado |',
    '| Gravação e recarga real de missivas/calendário | Não verificada |',
    '| Auditoria administrativa executada | '+
      yes(operatorAuditObservationComplete(report))+' |',
    '| Liberação da campanha | **NÃO AUTORIZADA** |',
    '',
    'Código de erro Auth (categoria segura): '+err,
    'Nenhuma conta, role, documento, regra ou recurso Cloud foi modificado.',
    'Sem UIDs, e-mails, hashes, tokens, nomes de Casas ou erros do provedor.',
  ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||
    process.env.CORMYR_AUTH_ACTIVATION_MODE!=='preview'){
    process.stderr.write('Invalid read-only audit configuration.\n');
    process.exitCode=2;
  }else{
    // The Firebase Admin ADC credential can obtain the same temporary
    // GitHub WIF impersonation token as gcloud. Never invoke a shell or
    // publish provider errors, IAM details, tokens or account identifiers.
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]
      =await Promise.all([import('firebase-admin/app'),
        import('firebase-admin/auth'),import('firebase-admin/firestore')]);
    const credential=applicationDefault();
    let credentialError=null;
    try{
      const token=await credential.getAccessToken();
      if(typeof token?.access_token!=='string'||token.access_token.length<10)
        throw Error('missing_access_token');
    }catch(error){credentialError=classifyOperatorCredentialError(error);}
    let report;
    if(credentialError){
      report=evaluateOperatorEvidence({
        cloudError:true,authError:credentialError,
      });
    }else{
      const name='cormyr-protected-readonly-audit';
      const app=getApps().find(a=>a.name===name)??initializeApp({
        credential,projectId:'cormyr'},name);
      const neverWrite=()=>{throw Error('read_only_audit');};
      report=await inspectOperatorEvidence({
        readCloud:()=>inspectFirebaseCloudReadiness({
          tokenProvider:async()=>{
            const token=await credential.getAccessToken();
            return token.access_token;
          },
        }),
        previewAuth:()=>executeAllExistingAuthTestAccounts({
          auth:{listUsers:(...args)=>getAuth(app).listUsers(...args),
            updateUser:neverWrite,getUser:neverWrite},
          db:getFirestore(app),mode:'preview',confirmation:'',
        }),
        readRoleLinkage:()=>inspectCloudRoleLinkage({
          tokenProvider:async()=>{
            const token=await credential.getAccessToken();
            return token.access_token;
          },
        }),
        readRuntimeSources:async()=>{
          const db=getFirestore(app);
          const query=await db.collection('migrationDomainStage').limit(2).get();
          if(query.docs.length!==1||!/^[a-f0-9]{64}$/.test(query.docs[0].id)||
             query.docs[0].data()?.status!=='complete'||
             query.docs[0].data()?.private!==true)
            throw Error('runtime_source_snapshot_unverified');
          const snapshotId=query.docs[0].id;
          const base=await inspectCloudRuntimeSources({db,snapshotId});
          let archiveCoverage=null;
          try{
            archiveCoverage=await inspectPublicArchiveCoverage({db,snapshotId});
          }catch{/* Review remains pending; suppress source and provider detail. */}
          return {...base,archiveCoverage};
        },
      });
    }
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeOperatorSummary(report));
    // A missing stage is a verified NO_GO blocker, not a failed inspection.
    // Only missing mandatory evidence causes this audit job itself to fail.
    if(!operatorAuditObservationComplete(report))process.exitCode=2;
  }
}