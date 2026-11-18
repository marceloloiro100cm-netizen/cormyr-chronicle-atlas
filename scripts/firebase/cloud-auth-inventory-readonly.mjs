/**
 * Independent protected, read-only inventory of Firebase Auth vs immutable
 * historical access. Does NOT authorize any deletion or gameplay release.
 * Never include identity identifiers in returned diagnostics or logs.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('auth_inventory_not_verified');};
export function compareHistoricalAuthInventory({historicalAccess,liveUsers,
  complete=false}={}){
  if(complete!==true||!Array.isArray(historicalAccess)||
    historicalAccess.length!==14||!Array.isArray(liveUsers))fail();
  const historic=new Set();
  for(const x of historicalAccess){
    if(!UID.test(x?.id??'')||x?.data?.userId!==x.id||
      historic.has(x.id))fail();
    historic.add(x.id);
  }
  const live=new Set();
  let disabled=0;
  for(const x of liveUsers){
    if(!UID.test(x?.uid??'')||typeof x.disabled!=='boolean'||
      live.has(x.uid))fail();
    live.add(x.uid);
    if(x.disabled)disabled++;
  }
  const missing=[...historic].filter(uid=>!live.has(uid)).length;
  const extra=[...live].filter(uid=>!historic.has(uid)).length;
  return Object.freeze({
    scope:'CORMYR_AUTH_INVENTORY_READ_ONLY',
    checked:true,historicalAccounts:historic.size,liveAccounts:live.size,
    missingHistoricalAccounts:missing,unexpectedLiveAccounts:extra,
    disabledLiveAccounts:disabled,
    exactOneMissingObserved:missing===1&&extra===0&&live.size===13,
    // Observation is intentionally distinct from approval by UID.
    deletionIdentityApproved:false,authWrites:0,firestoreWrites:0,
    readyForPlayers:false,releaseDecision:'NO_GO',
  });
}
export async function inspectProtectedAuthInventory({auth,db}={}){
  if(typeof auth?.listUsers!=='function'||typeof db?.collection!=='function')
    fail();
  const users=await auth.listUsers(1000);
  if(!Array.isArray(users?.users)||users.pageToken)fail();
  const root=await db.collection('migrationDomainStage').limit(2).get();
  if(root.docs?.length!==1)fail();
  const snapshot=root.docs[0];
  if(!HASH.test(snapshot.id)||snapshot.data()?.private!==true||
      snapshot.data()?.status!=='complete')fail();
  const access=await db.collection('migrationDomainStage')
    .doc(snapshot.id).collection('access').get();
  return compareHistoricalAuthInventory({
    historicalAccess:access.docs.map(d=>({id:d.id,data:d.data()})),
    liveUsers:users.users.map(u=>({uid:u.uid,disabled:u.disabled})),
    complete:true,
  });
}
export function safeInventorySummary(r){
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000?n:'?';
  return [
    '## Cormyr — inventário Auth protegido, somente leitura',
    '',
    '| Indicador | Quantidade |','| --- | --- |',
    '| Contas históricas | '+count(r?.historicalAccounts)+' |',
    '| Contas atuais | '+count(r?.liveAccounts)+' |',
    '| Históricas ausentes | '+count(r?.missingHistoricalAccounts)+' |',
    '| Contas atuais inesperadas | '+count(r?.unexpectedLiveAccounts)+' |',
    '| Atuais desativadas | '+count(r?.disabledLiveAccounts)+' |',
    '| Identidade excluída aprovada | **Não (auditoria separada)** |',
    '| Liberação | **NO_GO** |',
  ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr')fail();
  try{
    const [{initializeApp,applicationDefault},{getAuth},{getFirestore}]
      =await Promise.all([import('firebase-admin/app'),
        import('firebase-admin/auth'),import('firebase-admin/firestore')]);
    const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},
      'cormyr-auth-inventory-readonly');
    const result=await inspectProtectedAuthInventory({
      auth:{listUsers:(...args)=>getAuth(app).listUsers(...args)},
      db:getFirestore(app),
    });
    process.stdout.write(JSON.stringify(result)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeInventorySummary(result));
    if(result.exactOneMissingObserved!==true||
       result.disabledLiveAccounts!==0)process.exitCode=2;
  }catch{
    process.stderr.write('Auth inventory could not be confirmed; no Cloud changes.\n');
    process.exitCode=2;
  }
}
