/**
 * Import private Supabase Auth backup records to the LOCAL Firebase Auth
 * Emulator, never a cloud Firebase project.
 *
 * Default: aggregate-only preflight (zero network I/O). --execute-emulator
 * requires an explicit loopback emulator and demo project. Never log user
 * identifiers, emails, OAuth subjects, password hashes or personal data.
 *
 * Historical provider configuration is NOT activated by this import.
 * No Firebase custom claims or campaign roles are set.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadVerifiedPrivateTables } from './stage-firestore-emulator.mjs';

const DEMO_PROJECT='demo-cormyr-migration';
const BCRYPT=/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;
const SUPPORTED=Object.freeze({
  google:'google.com',github:'github.com',facebook:'facebook.com',
  apple:'apple.com',twitter:'twitter.com',azure:'microsoft.com',
});

function validUid(uid) {
  return typeof uid==='string' && uid.length>0 && uid.length<=128 &&
    !/[\u0000-\u001f\u007f]/.test(uid);
}
function validEmail(email) {
  return typeof email==='string' &&
    email.length<=320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function activeBan(value,now){
  const parsed=Date.parse(value||'');
  return Number.isFinite(parsed)&&parsed>now;
}
function bool(v) {
  return v==='t'||v==='true'?true:v==='f'||v==='false'?false:null;
}

export function assertAuthEmulatorOnly(env,projectId){
  if(projectId!==DEMO_PROJECT)throw Error('Auth migration target must be the fixed demo project');
  const endpoint=env.FIREBASE_AUTH_EMULATOR_HOST||'';
  // Firebase Admin SDK expects host:port, with no URL scheme.
  if(!/^(127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{1,4})$/.test(endpoint)){
    throw Error('Local Auth emulator at loopback host:port required');
  }
  if(env.GCLOUD_PROJECT && env.GCLOUD_PROJECT!==DEMO_PROJECT) {
    // GCLOUD_PROJECT is normally set to the *real* project in Cloud Shell.
    // Explicit demo app configuration below still prevents cloud traffic.
    // Do not rely on ADC to access Auth; emulator host must be set.
  }
}

export function planAuthEmulator(users,identities,profiles,now=Date.now()){
  if(!Array.isArray(users)||!Array.isArray(identities)||!Array.isArray(profiles))
    throw Error('Private Auth, identities and access profile tables required');
  const issues={
    invalidOrDuplicateUsers:0,invalidHashes:0,orphanIdentities:0,
    unsupportedIdentityProviders:0,invalidOAuthSubjects:0,duplicateOAuthSubjects:0,
    customOnlyAccounts:0,invalidOrDuplicateProfiles:0,
  };
  const uidMap=new Map(),emailSet=new Set(),subjectSet=new Set();
  const records=[];
  let bcryptCount=0,passwordlessCount=0,disabledCount=0,verifiedCount=0;
  for(const user of users){
    const uid=user?.id;
    const email=user?.email?.trim();
    if(!validUid(uid)||!validEmail(email)||uidMap.has(uid)||
        emailSet.has(email.toLowerCase())){
      issues.invalidOrDuplicateUsers++;continue;
    }
    const hash=user.encrypted_password;
    if(hash!=null && hash!=='' && (typeof hash!=='string'||!BCRYPT.test(hash))){
      issues.invalidHashes++;continue;
    }
    const verified=Boolean(user.email_confirmed_at||user.confirmed_at);
    const disabled=Boolean(user.deleted_at)||activeBan(user.banned_until,now);
    const record={uid,email,emailVerified:verified,disabled};
    if(hash){
      record.passwordHash=Buffer.from(hash,'utf8');
      bcryptCount++;
    }else passwordlessCount++;
    if(verified)verifiedCount++;
    if(disabled)disabledCount++;
    uidMap.set(uid,record);
    emailSet.add(email.toLowerCase());
    records.push(record);
  }
  const customOwners=new Set();
  let mappedProviders=0,deferredCustomProviders=0;
  for(const identity of identities){
    const provider=identity?.provider;
    if(!provider||provider==='email')continue;
    const account=uidMap.get(identity.user_id);
    if(!account){issues.orphanIdentities++;continue;}
    const subject=identity.provider_id;
    if(typeof subject!=='string'||!subject||subject.length>256){
      issues.invalidOAuthSubjects++;continue;
    }
    if(provider.startsWith('custom:')&&provider.length>7){
      customOwners.add(identity.user_id);
      deferredCustomProviders++;
      continue;
    }
    const providerId=SUPPORTED[provider];
    if(!providerId){issues.unsupportedIdentityProviders++;continue;}
    const key=JSON.stringify([providerId,subject]);
    if(subjectSet.has(key)){issues.duplicateOAuthSubjects++;continue;}
    subjectSet.add(key);
    account.providerData=[...(account.providerData||[]),{
      providerId,uid:subject,
    }];
    mappedProviders++;
  }
  for(const uid of customOwners){
    const account=uidMap.get(uid);
    if(!account?.passwordHash && !(account?.providerData?.length)){
      issues.customOnlyAccounts++;
    }
  }

  const profileSet=new Set();
  for(const p of profiles){
    if(!uidMap.has(p?.user_id)||profileSet.has(p.user_id)||
       !['narrador','editor','jogador'].includes(p.profile)||
       bool(p.active)===null){
      issues.invalidOrDuplicateProfiles++;continue;
    }
    profileSet.add(p.user_id);
  }
  const accountsWithoutProfile=records.length-profileSet.size;
  const externalCount=mappedProviders+deferredCustomProviders+
    issues.orphanIdentities+issues.unsupportedIdentityProviders+
    issues.invalidOAuthSubjects+issues.duplicateOAuthSubjects;
  const countIssues=Object.values(issues).reduce((a,b)=>a+b,0);
  const preflightValid=countIssues===0&&records.length===users.length&&
    externalCount===identities.filter(x=>x?.provider&&x.provider!=='email').length;

  return {
    records,
    summary:{
      scope:'private-firebase-auth-emulator-only',
      sourceUsers:users.length,importCandidates:records.length,
      bcryptCount,passwordlessCount,disabledCount,verifiedCount,
      mappedProviders,deferredCustomProviders,
      accountsWithoutProfile,
      issues,preflightValid,
      customProviderRequiresLaterRelink:deferredCustomProviders>0,
      providerLoginValidated:false,
      sourceLiveReconciled:false,
      cloudAuthWrites:0,readyForCloudImport:false,
    },
  };
}

export async function loadAuthEmulatorPlan(dir){
  const {tables}=await loadVerifiedPrivateTables(dir);
  const byName=new Map(tables.map(t=>[t.table,t.rows]));
  const keys=['auth.users','auth.identities','public.campaign_access_profiles'];
  for(const key of keys)if(!byName.has(key))throw Error('Required private source table missing');
  return planAuthEmulator(...keys.map(k=>byName.get(k)));
}

export async function importAuthIntoEmulator(plan,auth,env=process.env){
  assertAuthEmulatorOnly(env,DEMO_PROJECT);
  if(!plan?.summary?.preflightValid||!Array.isArray(plan.records)||
     !plan.records.length)throw Error('Auth preflight blocked');
  const old=await auth.listUsers(1000);
  if(old.users.length||old.pageToken)throw Error('Auth emulator destination is not empty');
  // Firebase Auth supports standard BCrypt import (no salt/extra parameters).
  const result=await auth.importUsers(plan.records,{
    hash:{algorithm:'BCRYPT'},
  });
  if(result.failureCount||result.successCount!==plan.records.length){
    throw Error('Partial local Auth import; discard emulator and inspect privately');
  }
  const verified=await auth.listUsers(1000);
  const expected=new Set(plan.records.map(r=>r.uid));
  if(verified.users.length!==plan.records.length ||
     verified.users.some(u=>!expected.has(u.uid))){
    throw Error('Auth emulator verification mismatch');
  }
  return {
    scope:'firebase-auth-emulator',
    imported:result.successCount,verified:verified.users.length,
    passwordHashesRetained:plan.summary.bcryptCount,
    passwordlessAccounts:plan.summary.passwordlessCount,
    deferredCustomProviders:plan.summary.deferredCustomProviders,
    accountsWithoutProfile:plan.summary.accountsWithoutProfile,
    cloudAuthWrites:0,readyForCloudImport:false,
  };
}

export async function main(args,options={}){
  if((args.length!==2&&args.length!==3)||
     args[0]!=='--normalized'||!args[1]||
     (args.length===3&&args[2]!=='--execute-emulator')){
    throw Error('Use --normalized PRIVATE_DIR [--execute-emulator]');
  }
  const plan=await loadAuthEmulatorPlan(args[1]);
  if(args.length===2){
    if(!options.silent)process.stdout.write(JSON.stringify(plan.summary,null,2)+'\n');
    return plan.summary;
  }
  const env=options.env||process.env;
  assertAuthEmulatorOnly(env,DEMO_PROJECT);
  if(!plan.summary.preflightValid)throw Error('Private Auth preflight failed');
  let app,auth=options.auth;
  if(!auth){
    const {initializeApp,deleteApp}=await import('firebase-admin/app');
    const {getAuth}=await import('firebase-admin/auth');
    app=initializeApp({projectId:DEMO_PROJECT},'cormyr-private-auth-emulator');
    auth=getAuth(app);
  }
  try {
    const result=await importAuthIntoEmulator(plan,auth,env);
    if(!options.silent)process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return result;
  }finally{
    if(app){
      const {deleteApp}=await import('firebase-admin/app');
      await deleteApp(app);
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(()=>{
    console.error('Auth emulator migration blocked or failed. No personal values printed.');
    process.exitCode=1;
  });
}
