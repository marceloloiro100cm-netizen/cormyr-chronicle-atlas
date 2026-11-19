import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudReadonly,CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {loadWorkspaceMailPage} from '@/lib/mail/firebase-workspace-mail';
import {crossOriginRejected} from '@/lib/server/request-origin';
import {cloudReadFailureCategory} from '@/lib/server/cloud-read-error-category';

/**
 * Read-only Firebase CLOUD route. This is NOT the emulator proxy and contains
 * no Supabase fallback. Requires explicit server configuration and an enabled
 * Firebase Auth user with trusted, server-side campaign access.
 *
 * POST is used to carry a bearer ID token. No cookies, logs or shared cache.
 * Runtime access remains disabled until the owner configures Cloud acceptance.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const error=(status:number,code:string)=>Response.json({error:code},{status,headers});
const flags=()=>{
  const id=process.env['CORMYR_FIREBASE_SNAPSHOT_ID'];
  return {enabled:process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true',
    snapshotId:id??''};
};

async function boundedJson(request:Request):Promise<unknown>{
  if(request.headers.get('content-encoding'))throw new CloudAccessError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudAccessError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudAccessError('invalid_request',400);
  const parts:Uint8Array[]=[];let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>2048){await reader.cancel();throw new CloudAccessError('body_too_large',413);}
    parts.push(value);
  }
  try{
    const input:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!input||typeof input!=='object'||Array.isArray(input))
      throw Error('shape');
    return input;
  }catch{throw new CloudAccessError('invalid_json',400);}
}

async function handle(request:Request):Promise<Response>{
  const {enabled,snapshotId}=flags();
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId))
    return error(503,'firebase_cloud_read_disabled');
  if(process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return error(503,'firebase_cloud_read_disabled');
  const u=new URL(request.url);
  if(u.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return error(403,'access_denied');
  const bearer=request.headers.get('authorization');
  if(!bearer||!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return error(401,'authentication_required');
  try{
    const payload=await boundedJson(request) as {action?:unknown;houseId?:unknown;editionId?:unknown;
      targetUid?:unknown;proposal?:unknown;filters?:unknown;page?:unknown;size?:unknown;
      recordId?:unknown;kind?:unknown;revisionId?:unknown};
    if(!['session','inspectWorkspaceImport','inspectWorkspaceLinks','listAccessRemediation','previewAccessRemediation','listHouses',
      'getHouse','getCalendar',
      'listOriginalMail','listOriginalRecords','getOriginalRecord',
      'listOriginalRecordVersions','listMailbox','listNewspaper','getNewspaper','listSpyAgents',
      'listSpyDossiers','listHouseBattles',
      'listOriginalSpies','listOriginalNewspapers','getOriginalNewspaper',
      'listOriginalNewspaperRevisions','getOriginalNewspaperRevision'
    ].includes(String(payload.action)))
      return error(400,'invalid_action');
    // Firebase Admin uses the App Hosting service account, not a JSON key in source.
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
    ]);
    const name='cormyr-cloud-reads';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseCloudReadonly({
      auth:getAuth(app),db:getFirestore(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const token=bearer.slice(7);
    let result:unknown;
    switch(payload.action){
      case 'session':result=await service.session(token);break;
      case 'inspectWorkspaceImport':
        result=await service.inspectWorkspaceImport(token);break;
      case 'inspectWorkspaceLinks':
        result=await service.inspectWorkspaceLinks(token);break;
      case 'listAccessRemediation':
        result=await service.listAccessRemediation(token);break;
      case 'previewAccessRemediation':
        result=await service.previewAccessRemediation(
          token,payload.targetUid,payload.proposal);break;
      case 'listHouses':result=await service.listHouses(token);break;
      case 'getCalendar':result=await service.getCalendar(token);break;
      case 'getHouse':result=await service.getHouse(token,payload.houseId);break;
      case 'listMailbox':result=await service.listMailbox(token);break;
      case 'listOriginalRecords':
        result=await service.listOriginalRecords(token,{houseId:payload.houseId,kind:payload.kind});break;
      case 'getOriginalRecord':
        result=await service.getOriginalRecord(token,payload.recordId);break;
      case 'listOriginalRecordVersions':
        result=await service.listOriginalRecordVersions(token,payload.recordId);break;
      case 'listOriginalMail':
        result=await loadWorkspaceMailPage(getFirestore(app),snapshotId,
          await service.workspaceMailScope(token),
          {filters:payload.filters,page:payload.page,size:payload.size});
        break;
      case 'listNewspaper':result=await service.listNewspaper(token);break;
      case 'listOriginalSpies':
        result=await service.listOriginalSpies(token,
          payload.houseId===undefined?{}:{houseId:payload.houseId});break;
      case 'listOriginalNewspapers':
        result=await service.listOriginalNewspapers(token);break;
      case 'getOriginalNewspaper':
        result=await service.getOriginalNewspaper(token,payload.editionId);break;
      case 'listOriginalNewspaperRevisions':
        result=await service.listOriginalNewspaperRevisions(token,payload.editionId,
          {page:payload.page,size:payload.size});break;
      case 'getOriginalNewspaperRevision':
        result=await service.getOriginalNewspaperRevision(
          token,payload.editionId,payload.revisionId);break;
      case 'getNewspaper':result=await service.getNewspaper(token,payload.editionId);break;
      case 'listSpyAgents':result=await service.listSpyAgents(token,payload.houseId);break;
      case 'listSpyDossiers':result=await service.listSpyDossiers(token,payload.houseId);break;
      case 'listHouseBattles':result=await service.listHouseBattles(token,payload.houseId);break;
      default:return error(400,'invalid_action');
    }
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudAccessError)return error(e.status,e.code);
    // Firebase provider messages may contain Firestore paths, account IDs or
    // personal details. Even Cloud Logging must never receive raw exceptions.
    // Only emit a fixed, allowlisted diagnostic category.
    console.error('[firebase-cloud-read] unavailable',
      cloudReadFailureCategory(e));
    return error(503,'firebase_cloud_unavailable');
  }
}

export const Route=createFileRoute('/api/firebase-cloud-read')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
