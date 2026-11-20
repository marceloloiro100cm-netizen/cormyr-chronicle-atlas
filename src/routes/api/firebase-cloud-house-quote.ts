import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudReadonly,CloudAccessError}
  from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {ConstructionPreviewError,previewHouseConstruction}
  from '../../lib/house/firebase-construction-quote';
import {crossOriginRejected} from '@/lib/server/request-origin';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';
import {readOperationalHouseRules} from '../../../scripts/firebase/cloud-house-rules-service.mjs';
import {mergeHouseRuleCatalog} from '@/lib/house/firebase-house-rules-core';
import {catalogSchema} from '@/lib/house/schemas';

/** Read-only building quote from a permission-scoped House snapshot.
 * No direct browser Firestore access, no economic mutations, no Cloud Shell.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
async function readBody(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new ConstructionPreviewError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new ConstructionPreviewError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new ConstructionPreviewError('invalid_request',400);
  let total=0;const chunks:Uint8Array[]=[];
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.length;
    if(total>1600){
      await reader.cancel();
      throw new ConstructionPreviewError('body_too_large',413);
    }
    chunks.push(value);
  }
  try{
    const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw Error('Invalid quote');
    return value as Record<string,unknown>;
  }catch{throw new ConstructionPreviewError('invalid_json',400);}
}
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'firebase_cloud_read_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return failure(403,'access_denied');
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return failure(401,'authentication_required');
  try{
    const requestBody=await readBody(request);
    if(requestBody['action']!=='quote'||
       Object.keys(requestBody).some(k=>![
         'action','houseId','itemId','domainId',
         'parentId','supportId','replaceId',
       ].includes(k)))
      return failure(400,'invalid_quote_request');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-house-quote';
    const app=getApps().find(x=>x.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const db=getFirestore(app);
    const service=createFirebaseCloudReadonly({
      auth:getAuth(app),db,snapshotId,
      projectId:'cormyr',enabled:true,
    });
    const token=bearer.slice(7);
    const house=await service.getHouse(token,requestBody['houseId']) as {
      id:string;name:string;version:number;state:unknown;
    };
    let catalog;
    if(process.env['CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED']==='true'||
       process.env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']==='true'){
      const ruleRows=await readWorkspaceTable(db,snapshotId,
        'noble_house_rule_overrides') as {definition:unknown}[];
      const archived=ruleRows.map(row=>catalogSchema.parse(row.definition));
      const operational=await readOperationalHouseRules(db,snapshotId,
        requestBody['houseId'] as string);
      catalog=mergeHouseRuleCatalog(archived,operational.map(row=>({
        definition:catalogSchema.parse(row.definition),version:row.version,
      })));
    }
    const result=previewHouseConstruction(house.state,{
      houseId:requestBody['houseId'],itemId:requestBody['itemId'],
      domainId:requestBody['domainId'],parentId:requestBody['parentId'],
      supportId:requestBody['supportId'],replaceId:requestBody['replaceId'],
    },house.name,house.version,catalog);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof ConstructionPreviewError||e instanceof CloudAccessError)
      return failure(e.status,e.code);
    return failure(503,'firebase_cloud_quote_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-cloud-house-quote')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
