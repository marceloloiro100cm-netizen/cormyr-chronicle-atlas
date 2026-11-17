/**
 * A single protected, read-only OIDC audit of Firebase Cloud migration gates.
 * No Firebase Auth update, Firestore write, secret logging or release action.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {inspectFirebaseCloudReadiness} from './cloud-access-readiness.mjs';
import {executeAllExistingAuthTestAccounts,safePreflightFailureCode}
  from './auth-enable-all-test-accounts.mjs';

const safeCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000?n:null;
const safeHttp=n=>Number.isSafeInteger(n)&&n>=100&&n<=599?n:null;

export function evaluateOperatorEvidence({cloud=null,authPreview=null,authError=null,cloudError=false}={}){
  const stages=cloud?.singleVerifiedSnapshot===true&&cloud?.stagesVerified===6;
  const auxiliary=cloud?.auxiliaryStagesComplete===true&&cloud?.auxiliaryStagesVerified===4;
  const authValid=authPreview?.mode==='preview'&&
    authPreview.accounts===14&&authPreview.linkedAccounts===14&&
    authPreview.authUpdatesAttempted===0&&authPreview.authUsersEnabled===0&&
    authPreview.activationComplete===false&&
    safeCount(authPreview.toEnable)!==null&&
    safeCount(authPreview.alreadyEnabled)!==null&&
    authPreview.toEnable+authPreview.alreadyEnabled===14;
  const mail=cloud?.mailRuntimeEnabled===true;
  const runtime=cloud?.operationalRuntimeReconciled===true;
  const blockingCodes=[];
  if(cloudError)blockingCodes.push('CLOUD_READ_FAILED');
  if(!stages)blockingCodes.push('PRIVATE_SNAPSHOT_STAGES_UNVERIFIED');
  if(!auxiliary)blockingCodes.push('AUXILIARY_STAGES_UNVERIFIED');
  if(!mail)blockingCodes.push('MAIL_RUNTIME_UNVERIFIED');
  if(!runtime)blockingCodes.push('OPERATIONAL_RUNTIME_UNVERIFIED');
  if(!authValid)blockingCodes.push('AUTH_INVENTORY_UNVERIFIED');
  if(authValid&&authPreview.toEnable>0)blockingCodes.push('AUTH_ACCOUNTS_STILL_DISABLED');
  if(authValid&&authPreview.pendingRoleOrHouse>0)
    blockingCodes.push('ROLES_OR_HOUSE_LINKS_INCOMPLETE');
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
    privateStagesComplete:stages,auxiliaryStagesComplete:auxiliary,
    mailRuntimeVerified:mail,operationalRuntimeVerified:runtime,
    authUpdatesAttempted:0,firestoreWrites:0,roleWrites:0,
    sourceLiveReconciliationVerified:false,storageVerified:false,
    crossHouseE2EVerified:false,readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',blockingCodes,
  };
}
export async function inspectOperatorEvidence({readCloud,previewAuth}={}){
  if(typeof readCloud!=='function'||typeof previewAuth!=='function')
    throw Error('two_read_probes_required');
  let cloud=null,authPreview=null,authError=null,cloudError=false;
  try{cloud=await readCloud();}catch{cloudError=true;}
  try{authPreview=await previewAuth();}
  catch(e){authError=safePreflightFailureCode(e);}
  return evaluateOperatorEvidence({cloud,authPreview,authError,cloudError});
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
    '| Correio operacional | '+yes(report?.mailRuntimeVerified)+' |',
    '| Runtime de Casas | '+yes(report?.operationalRuntimeVerified)+' |',
    '| Aceite real de jogadores e Casas | Pendente |',
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
    const report=await inspectOperatorEvidence({
      readCloud:()=>inspectFirebaseCloudReadiness(),
      previewAuth:async()=>{
        const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]
          =await Promise.all([import('firebase-admin/app'),
            import('firebase-admin/auth'),import('firebase-admin/firestore')]);
        const name='cormyr-protected-readonly-audit';
        const app=getApps().find(a=>a.name===name)??initializeApp({
          credential:applicationDefault(),projectId:'cormyr'},name);
        const real=getAuth(app);
        const neverWrite=()=>{throw Error('read_only_audit');};
        return executeAllExistingAuthTestAccounts({
          auth:{listUsers:(...args)=>real.listUsers(...args),
            updateUser:neverWrite,getUser:neverWrite},
          db:getFirestore(app),mode:'preview',confirmation:'',
        });
      },
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeOperatorSummary(report));
    if(!report.authInventoryValid||!report.privateStagesComplete||
      !report.auxiliaryStagesComplete)process.exitCode=2;
  }
}