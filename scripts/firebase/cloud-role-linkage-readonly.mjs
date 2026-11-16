/**
 * Cloud Shell operator audit for Auth -> private Firestore access linkage.
 * Exactly three bounded GETs, fixed project, no writes or public identities.
 * Prints only aggregates; never print raw Google errors, UIDs, emails,
 * snapshot hashes, house IDs, tokens or record content.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const PROJECT='cormyr';
const ROOT='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const PREFIX='projects/cormyr/databases/(default)/documents/migrationDomainStage/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const HASH=/^[a-f0-9]{64}$/;
const PROFILE_TYPES=['narrador','jogador','editor'];
const MASK=['userId','profile','active','admin','requirePasswordChange',
  'memberHouseIds','editHouseIds'];
const validUid=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
  !/[/\u0000-\u001f\u007f]/.test(id);
const fieldString=v=>typeof v?.stringValue==='string'?v.stringValue:null;
const fieldBool=v=>v?.booleanValue===true;
const fieldArray=v=>{
  if(!v||typeof v!=='object'||!v.arrayValue)return null;
  const values=v.arrayValue.values??[];
  if(!Array.isArray(values)||values.length>250)return null;
  const names=values.map(fieldString);
  return names.every(validUid)&&new Set(names).size===names.length?names:null;
};

export async function inspectCloudRoleLinkage({
  tokenProvider=()=>execFileSync('gcloud',['auth','print-access-token','--quiet'],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim(),
  fetcher=fetch,
}={}){
  const token=await tokenProvider();
  if(typeof token!=='string'||token.length<10)
    throw Error('operator_token_unavailable');
  const request=async(url,auth=false)=>{
    // No external URL can be passed to this script: only our fixed project.
    if(url!==AUTH&&!url.startsWith(ROOT))throw Error('invalid_audit_target');
    let response;
    try{
      response=await fetcher(url,{
        method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{
          Authorization:'Bearer '+token,
          ...(auth?{'X-Goog-User-Project':PROJECT}:{}),
        },
        signal:AbortSignal.timeout(20000),
      });
    }catch{return {status:null,body:null};}
    if(response.status!==200)return {status:response.status,body:null};
    try{
      const body=await response.json();
      return {status:200,body:body&&typeof body==='object'&&!Array.isArray(body)
        ?body:null};
    }catch{return {status:200,body:null};}
  };
  const metadata=await request(ROOT+'migrationDomainStage?pageSize=2'+
    '&mask.fieldPaths=status&mask.fieldPaths=private');
  const docs=Array.isArray(metadata.body?.documents)?
    metadata.body.documents:[];
  const rootDoc=docs.length===1&&!metadata.body?.nextPageToken?docs[0]:null;
  const name=rootDoc?.name;
  const snapshotId=typeof name==='string'&&name.startsWith(PREFIX)&&
    HASH.test(name.slice(PREFIX.length))&&
    fieldString(rootDoc.fields?.status)==='complete'&&
    fieldBool(rootDoc.fields?.private)
      ?name.slice(PREFIX.length):null;
  const accounts=await request(AUTH,true);
  const users=Array.isArray(accounts.body?.users)?accounts.body.users:[];
  const ids=users.map(user=>user?.localId);
  const authComplete=accounts.status===200&&!!accounts.body&&
    !accounts.body.nextPageToken&&users.length<=1000&&
    ids.every(validUid)&&new Set(ids).size===ids.length;
  const base={
    project:PROJECT,scope:'FIREBASE_ROLE_LINKAGE_READ_ONLY',
    firestoreHttpStatus:metadata.status,authHttpStatus:accounts.status,
    accessHttpStatus:null,singleVerifiedSnapshot:Boolean(snapshotId),
    authListComplete:authComplete,accessListComplete:false,
    accounts:authComplete?users.length:null,
    disabledAccounts:authComplete?users.filter(v=>v.disabled===true).length:null,
    linkedAccounts:null,unlinkedAccounts:null,unmatchedAccessDocuments:null,
    profileCounts:null,structurallyEligibleProfiles:null,
    writes:0,cloudRoleE2EVerified:false,
    releaseDecision:'NO_GO',readyForCutover:false,
  };
  if(!snapshotId||!authComplete)return base;
  const query=new URLSearchParams({pageSize:'1000'});
  for(const field of MASK)query.append('mask.fieldPaths',field);
  const access=await request(ROOT+'migrationDomainStage/'+snapshotId+
    '/access?'+query.toString());
  const accessDocs=Array.isArray(access.body?.documents)?
    access.body.documents:[];
  const accessComplete=access.status===200&&!!access.body&&
    !access.body.nextPageToken&&accessDocs.length<=1000;
  if(!accessComplete)return {
    ...base,accessHttpStatus:access.status,accessListComplete:false,
  };
  const byUid=new Map();
  let malformedDocs=0;
  for(const doc of accessDocs){
    const id=fieldString(doc?.fields?.userId);
    if(!validUid(id)||doc?.name!==PREFIX+snapshotId+'/access/'+id||
       byUid.has(id)){
      malformedDocs++;
      continue;
    }
    byUid.set(id,doc.fields);
  }
  const profiles={narrador:0,jogador:0,editor:0,other:0};
  let linked=0,eligible=0;
  for(const uid of ids){
    const v=byUid.get(uid);
    if(!v)continue;
    linked++;
    const role=fieldString(v.profile);
    if(PROFILE_TYPES.includes(role))profiles[role]++;
    else profiles.other++;
    const members=fieldArray(v.memberHouseIds);
    const edits=fieldArray(v.editHouseIds);
    if(!members||!edits||!edits.every(x=>members.includes(x)))continue;
    const roleValid=role==='narrador'?fieldBool(v.admin):
      (role==='jogador'||role==='editor')&&v.admin?.booleanValue===false;
    const houseValid=role==='jogador'?members.length>0:
      role==='editor'?members.length===0:true;
    if(roleValid&&houseValid&&fieldBool(v.active)&&
       v.requirePasswordChange?.booleanValue===false)eligible++;
  }
  return {
    ...base,accessHttpStatus:access.status,accessListComplete:true,
    linkedAccounts:linked,unlinkedAccounts:users.length-linked,
    unmatchedAccessDocuments:accessDocs.length-linked,
    malformedAccessDocuments:malformedDocs,
    profileCounts:profiles,structurallyEligibleProfiles:eligible,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const report=await inspectCloudRoleLinkage();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }catch{
    process.stderr.write('Auditoria não concluída; nenhuma alteração realizada.\n');
    process.exitCode=1;
  }
}
