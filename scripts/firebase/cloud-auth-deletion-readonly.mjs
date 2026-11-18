/**
 * Protected read-only Auth deletion audit. The approved UID arrives only via
 * GitHub protected environment secret, never CLI arguments or source control.
 * No Auth, Firestore or IAM mutation is permitted.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {reconcileAuthorizedAuthDeletions} from './auth-deletion-reconciliation.mjs';

const HASH=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error('protected_auth_deletion_audit_'+code);};
const neverWrite=()=>fail('write_forbidden');

/** Dependencies injected to test without credentials. No private IDs returned. */
export async function auditProtectedAuthDeletion({
  auth,db,approvedDeletedUids,
}={}){
  if(!auth||typeof auth.listUsers!=='function'||!db||
     typeof db.collection!=='function')fail('configuration_invalid');
  const users=await auth.listUsers(1000);
  if(!Array.isArray(users?.users)||users.pageToken)
    fail('auth_inventory_incomplete');
  const roots=await db.collection('migrationDomainStage').limit(2).get();
  if(roots.docs?.length!==1)fail('snapshot_unverified');
  const snap=roots.docs[0];
  if(!HASH.test(snap.id)||snap.data()?.private!==true||
     snap.data()?.status!=='complete')fail('snapshot_unverified');
  const access=await db.collection('migrationDomainStage')
    .doc(snap.id).collection('access').get();
  const result=reconcileAuthorizedAuthDeletions({
    historicalAccess:access.docs.map(d=>({id:d.id,data:d.data()})),
    liveAuth:users.users.map(u=>({uid:u.uid,disabled:u.disabled})),
    approvedDeletedUids,authListComplete:true,
  });
  return {scope:'CORMYR_AUTH_DELETION_READ_ONLY',...result};
}
export function safeDeletionSummary(report){
  const num=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000?n:'?';
  return ['## Cormyr — reconciliação privada Auth (somente leitura)',
    '',
    '| Evidência | Resultado |','| --- | --- |',
    '| Contas no histórico imutável | '+num(report?.historicalAccounts)+' |',
    '| Contas Auth atuais | '+num(report?.liveAccounts)+' |',
    '| Exclusões autorizadas verificadas | '+num(report?.authorizedDeletionsVerified)+' |',
    '| Exclusões inesperadas | '+num(report?.unexpectedMissing)+' |',
    '| Contas inesperadas | '+num(report?.unexpectedNew)+' |',
    '| Modificações Auth / Firestore | 0 / 0 |',
    '| Liberação de jogadores | **NÃO AUTORIZADA** |',
    ''].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  // Fail closed: empty/missing authorization cannot be replaced with count-only
  // evidence. Only the environment-protected approved UID may satisfy this.
  const raw=process.env.CORMYR_APPROVED_DELETED_AUTH_UIDS;
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||!raw||
     raw.length>1024)fail('private_approval_missing');
  let approvedDeletedUids;
  try{approvedDeletedUids=JSON.parse(raw);}catch{fail('private_approval_invalid');}
  const [{initializeApp,applicationDefault},{getAuth},{getFirestore}]
    =await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/auth'),
      import('firebase-admin/firestore')]);
  const app=initializeApp({projectId:'cormyr',
    credential:applicationDefault()},'protected-auth-deletion-readonly');
  try{
    const report=await auditProtectedAuthDeletion({
      auth:{listUsers:(...args)=>getAuth(app).listUsers(...args),
        updateUser:neverWrite,deleteUser:neverWrite},
      db:getFirestore(app),approvedDeletedUids,
    });
    // Only aggregate evidence, never any UID/email or provider message.
    process.stdout.write(JSON.stringify(report)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeDeletionSummary(report));
  }catch{
    process.stderr.write('Protected Auth reconciliation did not verify. No changes applied.\n');
    process.exitCode=2;
  }
}
