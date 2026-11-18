import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseNarratorWeekDraft,NarratorWeekDraftError}
  from '../../../scripts/firebase/cloud-narrator-week-draft.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

/**
 * Protected narrator draft and explicit one-time operational calendar publication.
 * Imported migration documents remain immutable.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const error=(status:number,code:string)=>Response.json({error:code},{status,headers});

async function boundedJson(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new NarratorWeekDraftError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new NarratorWeekDraftError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new NarratorWeekDraftError('invalid_request',400);
  const parts:Uint8Array[]=[];let bytes=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>2048){
      await reader.cancel();
      throw new NarratorWeekDraftError('body_too_large',413);
    }
    parts.push(value);
  }
  try{
    const parsed:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      throw Error('invalid');
    return parsed as Record<string,unknown>;
  }catch{throw new NarratorWeekDraftError('invalid_json',400);}
}

async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const enabled=process.env['CORMYR_FIREBASE_NARRATOR_WEEK_DRAFT_ENABLED']==='true'&&
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true';
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return error(503,'narrator_week_draft_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return error(403,'access_denied');
  const authHeader=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(authHeader))
    return error(401,'authentication_required');
  try{
    const payload=await boundedJson(request);
    if(!['get','save','publish'].includes(String(payload['action'])))
      return error(400,'invalid_action');
    if(payload['action']==='get'&&Object.keys(payload).length!==1)
      return error(400,'invalid_request');
    if(payload['action']==='save'&&Object.keys(payload).some(key=>
      !['action','expectedCalendarVersion','expectedDraftVersion',
        'proposedDate','openRound','reason'].includes(key)))
      return error(400,'invalid_request');
    if(payload['action']==='publish'&&(
       process.env['CORMYR_FIREBASE_CAMPAIGN_LAUNCH_ENABLED']!=='true'||
       Object.keys(payload).some(key=>!['action','expectedDraftVersion','adoptFirebaseSource'].includes(key))))
      return error(403,'campaign_launch_disabled');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([import('firebase-admin/app'),
        import('firebase-admin/auth'),import('firebase-admin/firestore')]);
    const name='cormyr-narrator-week-draft';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseNarratorWeekDraft({
      db:getFirestore(app),auth:getAuth(app),snapshotId,
      projectId:'cormyr',enabled:true,
    });
    const token=authHeader.slice(7);
    const result=payload['action']==='publish'
      ?await service.publish(token,{expectedDraftVersion:payload['expectedDraftVersion'],adoptFirebaseSource:payload['adoptFirebaseSource']})
      :payload['action']==='get'
      ?await service.get(token)
      :await service.save(token,{
        expectedCalendarVersion:payload['expectedCalendarVersion'],
        expectedDraftVersion:payload['expectedDraftVersion'],
        proposedDate:payload['proposedDate'],openRound:payload['openRound'],
        reason:payload['reason'],
      });
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof NarratorWeekDraftError)
      return error(e.status,e.code);
    // No Google provider messages, UIDs, document IDs or user input in logs.
    return error(503,'narrator_week_draft_unavailable');
  }
}

export const Route=createFileRoute('/api/firebase-narrator-week')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});

