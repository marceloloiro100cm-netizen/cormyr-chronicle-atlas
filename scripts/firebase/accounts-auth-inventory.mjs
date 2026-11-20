/**
 * Dedicated operator OIDC identity: aggregate Auth and Firestore inventory,
 * READ ONLY. Never modifies Auth, Firestore, IAM, Storage or an account.
 * Neither credential nor user information may enter GitHub logs.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const SNAP=/^[a-f0-9]{64}$/;
const UID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const categories=['narrador','jogador','editor'];
const result=()=>({
 authUsers:0,authDisabled:0,authEnabled:0,linkedAccounts:0,
 sourceAccessRecords:0,operationalOverlays:0,
 unlinkedAuthUsers:0,accessWithoutAuth:0,activeAccess:0,
 activeAuthWithInactiveAccess:0,disabledAuthWithActiveAccess:0,
 pendingPasswordRotation:0,missingProfiles:0,playersWithoutHouse:0,
 roleCounts:{narrador:0,jogador:0,editor:0,outro:0},
 runtimeReconciled:false,inventoryVerified:false,realRoleE2EVerified:false,
 releaseDecision:'NO_GO',blockers:[],
});
const mark=(r,code)=>{if(!r.blockers.includes(code))r.blockers.push(code)};
const safe=v=>Number.isSafeInteger(v)&&v>=0&&v<10000?v:'indisponível';
export async function auditAuthInventory({auth,db}={}){
 const r=result();
 if(typeof auth?.listUsers!=='function'||typeof db?.collection!=='function'){
  mark(r,'OPERATOR_UNAVAILABLE');return r;
 }
 let users,roots;
 try{
  [users,roots]=await Promise.all([
   auth.listUsers(1000),
   db.collection('migrationDomainStage').limit(2).get(),
  ]);
 }catch{mark(r,'AUTH_OR_FIRESTORE_READ_DENIED');return r}
 if(users?.pageToken||!Array.isArray(users?.users)||
    !Array.isArray(roots?.docs)||roots.docs.length!==1||
    !SNAP.test(roots.docs[0].id)||
    roots.docs[0].data()?.status!=='complete'||roots.docs[0].data()?.private!==true){
  mark(r,'INVENTORY_INCOMPLETE');return r;
 }
 const snapshot=roots.docs[0].id;
 let access,overlays,live;
 try{
  [access,overlays,live]=await Promise.all([
   db.collection('migrationDomainStage').doc(snapshot).collection('access').get(),
   db.collection('campaignCloudRuntime').doc(snapshot).collection('accountAccess').limit(251).get(),
   db.collection('campaignCloudRuntime').doc(snapshot).get(),
  ]);
 }catch{mark(r,'ACCESS_OR_RUNTIME_READ_DENIED');return r}
 if(!Array.isArray(access?.docs)||!Array.isArray(overlays?.docs)||
    overlays.docs.length>250){
  mark(r,'ACCESS_INVENTORY_INCOMPLETE');return r;
 }
 const rt=live.data();
 r.runtimeReconciled=live.exists&&rt?.status==='active'&&rt.private===true&&
  rt.sourceSnapshotId===snapshot&&rt.sourceSnapshotReconciled===true&&
  rt.applicationEnabled===true;
 if(!r.runtimeReconciled)mark(r,'RUNTIME_NOT_RECONCILED');
 const byUid=new Map();
 for(const doc of access.docs){
  const a=doc.data();
  if(!UID.test(doc.id)||a?.userId!==doc.id||byUid.has(doc.id)){
   mark(r,'ACCESS_SCOPE_INCONSISTENT');continue;
  }
  byUid.set(doc.id,a);
 }
 for(const doc of overlays.docs){
  const a=doc.data();
  if(!UID.test(doc.id)||a?.userId!==doc.id||
     a.profile==='narrador'||a.admin!==false||
     !['jogador','editor'].includes(a?.profile)){
   mark(r,'ACCESS_SCOPE_INCONSISTENT');continue;
  }
  byUid.set(doc.id,a);
 }
 r.sourceAccessRecords=access.docs.length;
 r.operationalOverlays=overlays.docs.length;
 const userSet=new Set();
 for(const u of users.users){
  if(!u||!UID.test(u.uid)||userSet.has(u.uid)||
     typeof u.disabled!=='boolean'){
   mark(r,'AUTH_INVENTORY_INVALID');continue;
  }
  userSet.add(u.uid);
  r.authUsers++;
  if(u.disabled===true)r.authDisabled++;
  else r.authEnabled++;
  const a=byUid.get(u.uid);
  if(!a){r.unlinkedAuthUsers++;continue}
  r.linkedAccounts++;
  if(a.active===true)r.activeAccess++;
  if(u.disabled===false&&a.active!==true)r.activeAuthWithInactiveAccess++;
  if(u.disabled===true&&a.active===true)r.disabledAuthWithActiveAccess++;
  if(a.requirePasswordChange===true)r.pendingPasswordRotation++;
  const role=categories.includes(a.profile)?a.profile:'outro';
  r.roleCounts[role]++;
  if(role==='outro')r.missingProfiles++;
  if(role==='jogador'&&(!Array.isArray(a.memberHouseIds)||!a.memberHouseIds.length))
   r.playersWithoutHouse++;
 }
 r.accessWithoutAuth=[...byUid.keys()].filter(id=>!userSet.has(id)).length;
 if(r.unlinkedAuthUsers||r.accessWithoutAuth||r.blockers.length)
  mark(r,'AUTH_ACCESS_LINKAGE_UNVERIFIED');
 if(r.missingProfiles||r.playersWithoutHouse)
  mark(r,'INCOMPLETE_ROLE_OR_HOUSE');
 r.inventoryVerified=!r.blockers.some(b=>['AUTH_OR_FIRESTORE_READ_DENIED',
  'INVENTORY_INCOMPLETE','ACCESS_INVENTORY_INCOMPLETE','AUTH_INVENTORY_INVALID',
  'ACCESS_SCOPE_INCONSISTENT','AUTH_ACCESS_LINKAGE_UNVERIFIED'].includes(b))&&
  r.authUsers===r.linkedAccounts&&r.accessWithoutAuth===0;
 mark(r,'ACCOUNT_ROLE_E2E_PENDING');
 return r;
}
export function authInventorySummary(r){
 return [
  '### Firebase Auth e contas: inventário de autenticação somente leitura',
  '| Verificação | Resultado |','|---|---|',
  '| Usuários Auth examinados | '+safe(r.authUsers)+' |',
  '| Auth habilitados | '+safe(r.authEnabled)+' |',
  '| Auth desabilitados | '+safe(r.authDisabled)+' |',
  '| Contas com vínculo de acesso | '+safe(r.linkedAccounts)+' |',
  '| Auth sem acesso vinculado | '+safe(r.unlinkedAuthUsers)+' |',
  '| Acessos sem conta Auth | '+safe(r.accessWithoutAuth)+' |',
  '| Contas com acesso ativo | '+safe(r.activeAccess)+' |',
  '| Auth ativo com acesso inativo | '+safe(r.activeAuthWithInactiveAccess)+' |',
  '| Auth desativado com acesso ativo | '+safe(r.disabledAuthWithActiveAccess)+' |',
  '| Troca de senha pendente | '+safe(r.pendingPasswordRotation)+' |',
  '| Perfis incompletos | '+safe(r.missingProfiles)+' |',
  '| Jogadores sem Casa | '+safe(r.playersWithoutHouse)+' |',
  '| Runtime reconciliado | '+Boolean(r.runtimeReconciled)+' |',
  '| Inventário conferido | '+Boolean(r.inventoryVerified)+' |',
  '| Testes com perfis reais | NÃO COMPROVADOS |',
  '| Escrita de contas | **NO_GO** |',
  'Restrições: '+r.blockers.join(', '),
  'Somente listagem Admin. Nenhuma conta, senha, papel, Casa ou saldo alterado.',
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr')
   throw Error('wrong_project');
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
   await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),
    import('firebase-admin/firestore')]);
  const app=getApps().find(x=>x.name==='cormyr-auth-inventory')??
   initializeApp({projectId:'cormyr',credential:applicationDefault()},
    'cormyr-auth-inventory');
  const r=await auditAuthInventory({auth:getAuth(app),db:getFirestore(app)});
  const output=authInventorySummary(r);
  if(process.env.GITHUB_STEP_SUMMARY)
   appendFileSync(process.env.GITHUB_STEP_SUMMARY,output+'\n');
  process.stdout.write(output+'\n');
 }catch{
  process.stderr.write('AUTH_INVENTORY_OPERATOR_UNAVAILABLE; sem leitura conclusiva.\n');
  process.exitCode=2;
 }
}
