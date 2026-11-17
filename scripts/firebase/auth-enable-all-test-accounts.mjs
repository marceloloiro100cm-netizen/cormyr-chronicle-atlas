/**
 * One-off, explicitly authorized bulk TEST enablement for the 14 existing
 * Firebase Auth users in cormyr. No creation, deletion, role/House changes,
 * password reset, Firestore writes or secret logging.
 *
 * Use ONLY from a manually confirmed GitHub Actions workflow with a dedicated,
 * short-lived IAM identity that can read the private access stage and perform
 * firebaseauth.users.update. Existing cormyr-gh-reader is NOT that identity.
 *
 * This script is not a game release gate. Profileless accounts and players
 * without Houses can sign in after enablement but cannot gain game permissions:
 * access controls remain entirely server-side.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const PROJECT_ID='cormyr';
export const EXPECTED_AUTH_ACCOUNTS=14;
export const ACTIVATION_PHRASE='ENABLE_ALL_14_CORMYR_TEST_ACCOUNTS';
const SNAP=/^[a-f0-9]{64}$/;
const UID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const profile=v=>['narrador','jogador','editor'].includes(v)?v:'other';
const cleanHouses=value=>Array.isArray(value)&&value.length<=250&&
  value.every(id=>typeof id==='string'&&UID.test(id))&&
  new Set(value).size===value.length;
const failed=code=>{
  // Static errors only: never include user IDs or provider error bodies.
  throw Error('activation_preflight_'+code);
};

/** Preserve a fixed, privacy-safe failure label, never provider error bodies. */
export function safePreflightFailureCode(error){
  const msg=typeof error?.message==='string'?error.message:'';
  const match=/^activation_preflight_([a-z_]{1,80})$/.exec(msg);
  return match?.[1]??'unclassified_cloud_or_runtime_error';
}

const readWithSafeDiagnostic=async (phase,read)=>{
  try{return await read();}
  catch(error){
    const code=String(error?.code??'').toLowerCase();
    const kind=code==='7'||code.includes('permission')?
      'permission_denied':
      code==='16'||code.includes('credential')||
      code.includes('unauthenticated')?'authentication_failed':
      'request_failed';
    failed(phase+'_'+kind);
  }
};

/** Pure, all-or-nothing inventory validation. Keep returned UIDs private. */
export function planAllExistingAuthTestAccounts({users,accessDocs,houses}={}){
  if(!Array.isArray(users)||users.length!==EXPECTED_AUTH_ACCOUNTS||
     !Array.isArray(accessDocs)||accessDocs.length!==EXPECTED_AUTH_ACCOUNTS||
     !Array.isArray(houses)||houses.length<1||houses.length>250)
    failed('inventory_mismatch');
  const userIds=new Set();
  for(const u of users){
    if(!u||!UID.test(u.uid)||typeof u.disabled!=='boolean'||
       userIds.has(u.uid))failed('auth_user_inventory_invalid');
    userIds.add(u.uid);
  }
  const accessByUser=new Map();
  for(const doc of accessDocs){
    const v=doc?.data;
    if(!doc||!UID.test(doc.id)||!v||v.userId!==doc.id||
       !userIds.has(doc.id)||accessByUser.has(doc.id))
      failed('access_linkage_invalid');
    if(!(v.profile===null||v.profile===undefined||
       ['narrador','jogador','editor'].includes(v.profile))||
       typeof v.active!=='boolean'||
       typeof v.admin!=='boolean'||
       typeof v.requirePasswordChange!=='boolean'||
       !cleanHouses(v.memberHouseIds)||!cleanHouses(v.editHouseIds)||
       v.editHouseIds.some(id=>!v.memberHouseIds.includes(id))||
       (v.profile==='narrador'&&v.admin!==true)||
       (v.profile!=='narrador'&&v.admin!==false)||
       (v.profile==='editor'&&v.memberHouseIds.length!==0))
      failed('access_schema_invalid');
    accessByUser.set(doc.id,v);
  }
  if(accessByUser.size!==userIds.size)failed('access_linkage_incomplete');

  const activeHouses=new Set(),allHouses=new Set();
  for(const h of houses){
    const v=h?.data;
    if(!v||!UID.test(v.sourceId)||allHouses.has(v.sourceId)||
       typeof v.active!=='boolean'||
       !Number.isSafeInteger(v.season))failed('house_catalog_invalid');
    allHouses.add(v.sourceId);
    if(v.active===true&&v.season===2)activeHouses.add(v.sourceId);
  }
  const roleCounts={narrador:0,jogador:0,editor:0,other:0};
  let pendingRoleOrHouse=0;
  let missingProfiles=0;
  let playersWithoutHouse=0;
  let inactiveAccess=0;
  let passwordResetPending=0;
  for(const uid of userIds){
    const v=accessByUser.get(uid);
    const role=profile(v.profile);
    roleCounts[role]++;
    if(role==='other')missingProfiles++;
    if(role==='jogador'&&v.memberHouseIds.length===0)
      playersWithoutHouse++;
    if(role==='other'||
       role==='jogador'&&v.memberHouseIds.length===0)
      pendingRoleOrHouse++;
    if(v.active===false)inactiveAccess++;
    if(v.requirePasswordChange===true)passwordResetPending++;
    for(const id of v.memberHouseIds){
      if(!activeHouses.has(id))failed('house_reference_invalid');
    }
  }

  const uidToEnable=users.filter(u=>u.disabled===true).map(u=>u.uid);
  return {
    // Do not JSON.stringify this private plan in Actions logs.
    privatePlan:{uidToEnable},
    summary:{
      project:PROJECT_ID,
      scope:'FIREBASE_ALL_14_TEST_AUTH_ACTIVATION',
      accounts:users.length,linkedAccounts:accessByUser.size,
      toEnable:uidToEnable.length,alreadyEnabled:users.length-uidToEnable.length,
      profileCounts:roleCounts,
      pendingRoleOrHouse,missingProfiles,playersWithoutHouse,
      inactiveAccess,passwordResetPending,
      houseCatalogCount:allHouses.size,
      activeSeason2Houses:activeHouses.size,
      firestoreWrites:0,profilesModified:0,houseAssignmentsModified:0,
      readyForPlayers:false,readyForCutover:false,
      releaseDecision:'NO_GO',
    },
  };
}

/**
 * Real network is injected for tests. The actual runner initializes Firebase
 * Admin using OIDC credentials; never pass a project, UID or House in CLI args.
 */
export async function executeAllExistingAuthTestAccounts({
  auth,db,mode='preview',confirmation='',
}={}){
  if(mode!=='preview'&&mode!=='activate')failed('invalid_mode');
  if(mode==='activate'&&confirmation!==ACTIVATION_PHRASE)
    failed('explicit_confirmation_required');
  if(!auth||typeof auth.listUsers!=='function'||
     typeof auth.updateUser!=='function'||typeof auth.getUser!=='function'||
     !db||typeof db.collection!=='function')
    failed('admin_identity_not_configured');
  const inventory=await readWithSafeDiagnostic('auth_inventory',()=>auth.listUsers(1000));
  if(inventory.pageToken)failed('auth_list_incomplete');

  const root=await readWithSafeDiagnostic('domain_snapshot',()=>db.collection('migrationDomainStage').limit(2).get());
  if(root.docs?.length!==1)failed('snapshot_unverified');
  const snapshot=root.docs[0];
  if(!SNAP.test(snapshot.id)||snapshot.data()?.status!=='complete'||
     snapshot.data()?.private!==true)failed('snapshot_unverified');

  const stage=await readWithSafeDiagnostic('auth_stage',()=>db.collection('migrationAuthStage').doc(snapshot.id).get());
  if(!stage.exists||stage.data()?.status!=='complete'||
     stage.data()?.private!==true)failed('auth_stage_unverified');

  const access=await readWithSafeDiagnostic('access_inventory',()=>db.collection('migrationDomainStage')
    .doc(snapshot.id).collection('access').get());
  const houses=await readWithSafeDiagnostic('house_inventory',()=>db.collection('migrationDomainStage')
    .doc(snapshot.id).collection('houses').get());
  const reviewed=planAllExistingAuthTestAccounts({
    users:inventory.users,
    accessDocs:access.docs.map(doc=>({id:doc.id,data:doc.data()})),
    houses:houses.docs.map(doc=>({id:doc.id,data:doc.data()})),
  });
  if(mode==='preview')return {
    ...reviewed.summary,mode:'preview',
    authUpdatesAttempted:0,authUsersEnabled:0,
    activationComplete:false,
  };

  let authUpdatesAttempted=0,authUsersEnabled=0;
  for(const uid of reviewed.privatePlan.uidToEnable){
    authUpdatesAttempted++;
    try{
      await auth.updateUser(uid,{disabled:false});
      const verified=await auth.getUser(uid);
      if(verified.uid!==uid||verified.disabled!==false)
        failed('post_update_verification_failed');
      authUsersEnabled++;
    }catch{
      // Partial updates are possible. Never claim all accounts were enabled.
      // Do not disclose the identity/UID or Google error message in logs.
      return {
        ...reviewed.summary,mode:'activate',
        authUpdatesAttempted,authUsersEnabled,
        activationComplete:false,
        failureCode:'AUTH_UPDATE_OR_VERIFY_FAILED',
      };
    }
  }
  // Recheck entire account inventory, not just the last changed account.
  let accountsAfter=null,remainingDisabled=null;
  try{
    const latest=await auth.listUsers(1000);
    if(!latest.pageToken&&latest.users.length===EXPECTED_AUTH_ACCOUNTS&&
       latest.users.every(user=>UID.test(user.uid)&&
         inventory.users.some(before=>before.uid===user.uid))){
      accountsAfter=latest.users.length;
      remainingDisabled=latest.users.filter(u=>u.disabled===true).length;
    }
  }catch{/* Incomplete final audit is not full success. */}
  const complete=accountsAfter===EXPECTED_AUTH_ACCOUNTS&&
    remainingDisabled===0;
  return {
    ...reviewed.summary,mode:'activate',
    authUpdatesAttempted,authUsersEnabled,
    accountsAfter,remainingDisabled,
    activationComplete:complete,
  };
}

export function safeActivationSummary(r){
  const yes=v=>v===true?'sim':'não';
  const num=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000?v:'desconhecido';
  const mode=r?.mode==='activate'?'ativação':'prévia';
  return [
    '### Cormyr — Firebase Auth: todas as 14 contas para teste',
    '- Modo: '+mode,
    '- Contas conferidas: '+num(r?.accounts),
    '- Vínculos de acesso conferidos: '+num(r?.linkedAccounts),
    '- Contas inicialmente desativadas: '+num(r?.toEnable),
    '- Contas inicialmente habilitadas: '+num(r?.alreadyEnabled),
    '- Atualizações Auth verificadas: '+num(r?.authUsersEnabled),
    '- Contas ainda desativadas: '+num(r?.remainingDisabled),
    '- Conclusão da habilitação Auth: **'+yes(r?.activationComplete)+'**',
    '- Perfis ou Casas incompletos (ainda sem permissão de jogo): '+
      num(r?.pendingRoleOrHouse),
    '- Contas sem perfil: '+num(r?.missingProfiles),
    '- Jogadores sem Casa: '+num(r?.playersWithoutHouse),
    '- Vínculos de acesso inativos: '+num(r?.inactiveAccess),
    '- Mudança de perfis, Casas, Firestore ou permissões: **nenhuma**',
    '- Jogo liberado: **NÃO**, requer runtimes e aceite real.',
    '- Nenhum UID, e-mail, token, hash, nome de Casa ou erro do Google foi logado.',
    '',
  ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.env.GOOGLE_CLOUD_PROJECT&&
       process.env.GOOGLE_CLOUD_PROJECT!==PROJECT_ID)
      failed('wrong_project');
    const [{initializeApp,getApps,applicationDefault},{getAuth},
      {getFirestore}]=await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
    ]);
    const app=getApps().find(a=>a.name==='cormyr-auth-test-activation')??
      initializeApp({projectId:PROJECT_ID,credential:applicationDefault()},
        'cormyr-auth-test-activation');
    const report=await executeAllExistingAuthTestAccounts({
      auth:getAuth(app),db:getFirestore(app),
      mode:process.env.CORMYR_AUTH_ACTIVATION_MODE,
      confirmation:process.env.CORMYR_AUTH_ACTIVATION_CONFIRMATION,
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        safeActivationSummary(report)+'\n');
    if(report.mode==='activate'&&!report.activationComplete)
      process.exitCode=2;
  }catch(error){
    // Emit a static phase/code only; never propagate sensitive provider details.
    process.stderr.write(
      'Firebase Auth test activation preflight failed ['+
      safePreflightFailureCode(error)+
      ']. No successful activation was verified.\n');
    process.exitCode=2;
  }
}
