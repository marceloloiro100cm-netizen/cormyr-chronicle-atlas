/**
 * Scheduled-job boundary (Cloud Scheduler style) for the Firebase services:
 * newspaper `publishDue` and espionage `advanceMissions`. A Bearer secret
 * authenticates the caller (same rule as src/integrations/supabase/cron-auth.ts:
 * CRON_SECRET with an optional previous secret, constant-time compare). The
 * jobs run as a configured Narrator account through an in-process identity
 * that never leaves the server; if that account is not an active Narrator the
 * services fail closed. Emulator only. Responses carry counts, never data.
 */
import {createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {createEmulatorNewspaperService} from './newspaper-service.mjs';
import {createEmulatorSpyMissionsService} from './spy-missions-service.mjs';

const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,body)=>Response.json(body,{status,headers:HEADERS});
const digest=v=>createHash('sha256').update(String(v),'utf8').digest();
const countOf=x=>Array.isArray(x)?x.length:Number.isFinite(x)?x:x&&typeof x==='object'&&Number.isFinite(x.advanced)?x.advanced:0;

/** In-process identity: one random token per process, resolving to the actor uid. */
export function createInternalAuth(actorUid){
  if(typeof actorUid!=='string'||!actorUid)throw Error('Job actor uid is required');
  const token='job.'+randomBytes(24).toString('hex');
  return {token,auth:{async verifyIdToken(t){
    if(typeof t!=='string'||t.length!==token.length||!timingSafeEqual(Buffer.from(t),Buffer.from(token)))
      throw Error('invalid');
    return {uid:actorUid};
  }}};
}

export function createEmulatorJobs({db,snapshotId,actorUid,env=process.env}){
  assertEmulatorOnly(env,'demo-cormyr-migration');
  const {token,auth}=createInternalAuth(actorUid);
  const base={db,auth,snapshotId,env};
  const newspaper=createEmulatorNewspaperService(base);
  const spy=createEmulatorSpyMissionsService(base);
  return {
    'publish-due':()=>newspaper.publishDue(token),
    'advance-missions':()=>spy.advanceMissions(token),
  };
}

export function createJobsHandler({jobs,secret,previousSecret}){
  const names=Object.keys(jobs);
  return async function handle(request){
    if(!secret)return reply(500,{error:'server_configuration'});
    const m=/^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization')||'');
    if(!m)return reply(401,{error:'unauthorized'});
    const got=digest(m[1]);
    const okCurrent=timingSafeEqual(got,digest(secret));
    const okPrevious=timingSafeEqual(got,digest(previousSecret||secret));
    if(!okCurrent&&!okPrevious)return reply(401,{error:'unauthorized'});
    const url=new URL(request.url);
    if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
    if(url.search)return reply(400,{error:'invalid_request'});
    const prefix='/api/firebase-jobs/';
    if(!url.pathname.startsWith(prefix))return reply(404,{error:'not_found'});
    const name=url.pathname.slice(prefix.length);
    const selected=name==='all'?names:Object.hasOwn(jobs,name)?[name]:null;
    if(!selected)return reply(404,{error:'not_found'});
    const results={};let failed=false;
    for(const n of selected){
      try{results[n]={status:'ok',count:countOf(await jobs[n]())};}
      catch{results[n]={status:'error'};failed=true;}
    }
    // A failed job returns 500 so the scheduler retries; the error text is never exposed.
    return reply(failed?500:200,{ok:!failed,results});
  };
}
