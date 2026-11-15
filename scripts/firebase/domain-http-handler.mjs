/**
 * Strict, emulator-only JSON boundary for the migrated domain services.
 * This is NEVER a Firebase Cloud endpoint. Every operation stays behind
 * Auth Emulator verification and the existing per-domain access checks.
 */
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

export const DOMAIN_OPERATIONS=Object.freeze({
  access:['getProfile'],
  houses:['listHouses','getHouse','commit'],
  records:['listRecords','getRecord','createRecord','saveRecord'],
  characters:['houseAges','ageDashboard','saveCharacter','saveRelation','reviewSource'],
  schedule:['getPublished','getDrafts','saveEvent'],
  time:['getCalendar','preview','publish','history'],
  mailbox:['list','getThread','markRead'],
  mailCommands:['session','send','reply','editDraft','scheduleDraft','changeTrash',
    'list','get','listReplies','listReceipts','note','initialize','openRound','closeRound'],
  newspaper:['listEditions','createEdition','saveEdition','deleteDraft','deleteEdition',
    'listRevisions','markRead','listReads','listCommissions','commissionStory',
    'rejectCommission','markCommissionsSeen','getSettings','saveSettings','calendarEvents'],
  spyAgents:['houseManagement','recruitmentOptions','recruit','createAgent','buyUpgrade',
    'assignPortrait','removeAgent'],
  spyMissions:['startMission','cancelMission','houseTimeline','previewMission',
    'resolveMission','counterintelligence','narratorOperations','incidentHistory'],
  spyIntel:['read','operationStatus','adminPending','adminOptions','finalize','adminAction'],
  battle:['listSaved','readSaved','commitReplay','commitStep','applySavedCommand',
    'liveCreate','liveList','liveGet','livePlay','inviteCreate','inviteList','inviteClose',
    'dndSave','dndList','dndLoad','dndSaveOverride','dndResetOverride',
    'dndOverrides','dndSaveCustom','dndDeleteCustom','dndCustom','dndCatalog',
    'dndVerified','rosterFor'],
  privateGm:['listGmContent','getGmContent','startRepresentation','stopRepresentation','representationAction'],
  drive:['listInbox','listBindings','resolveImport'],
});

export const MAX_DOMAIN_BODY=65_536;
const AUTH_EMULATOR=/^(?:127\.0\.0\.1|localhost|\[::1\]):(?:[1-9][0-9]{1,4})$/;
const respond=(status,error)=>Response.json({error},{status,headers:{
  'Cache-Control':'private, no-store, max-age=0',
  'Content-Type':'application/json; charset=utf-8',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'Authorization',
}});
const ok=(result)=>Response.json({result},{headers:{
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'Authorization',
}});
const isRecord=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const tokenFrom=request=>{
  const h=request.headers.get('authorization');
  return h&&/^Bearer [^\s]{1,10000}$/.test(h)?h.slice(7):null;
};
async function readJson(request){
  if(request.headers.has('content-encoding')||
      request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return null;
  const reader=request.body?.getReader();
  if(!reader)return null;
  let bytes=0;
  const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_DOMAIN_BODY){await reader.cancel();return null;}
      chunks.push(Buffer.from(value));
    }
    const obj=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return isRecord(obj)?obj:null;
  }catch{return null;}
}
const arrayArgs=args=>Array.isArray(args)&&args.length<=4&&args.every(x=>x!==undefined);
const permitted=(domain,action)=>typeof domain==='string'&&
  Object.hasOwn(DOMAIN_OPERATIONS,domain)&&
  typeof action==='string'&&DOMAIN_OPERATIONS[domain].includes(action);
const mailObject=new Set(['mailbox','mailCommands']);

export function assertLocalDomainEnvironment(env,origin){
  assertEmulatorOnly(env,'demo-cormyr-migration');
  if(!AUTH_EMULATOR.test(env.FIREBASE_AUTH_EMULATOR_HOST||'')){
    throw Error('Loopback Auth Emulator is mandatory');
  }
  const base=new URL(origin);
  if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||
      !/^\d{4,5}$/.test(base.port)||base.origin!==origin||base.pathname!=='/')
    throw Error('Explicit loopback HTTP origin required');
}

/**
 * Services are created by the local emulator entrypoint and injected.
 * Snapshot IDs and backend credentials never originate from the request.
 */
export function createEmulatorDomainHttpHandler({services,auth,origin,env=process.env}){
  assertLocalDomainEnvironment(env,origin);
  if(typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    throw Error('Auth Emulator backend required');
  const verify=async token=>{
    if(!token)return false;
    try{
      const claims=await auth.verifyIdToken(token,true);
      if(typeof claims?.uid!=='string'||!claims.uid)return false;
      const user=await auth.getUser(claims.uid);
      return !!user&&user.uid===claims.uid&&user.disabled!==true;
    }catch{return false;}
  };
  return async function handle(request){
    try{
      const u=new URL(request.url);
      if(u.origin!==origin||u.search||
         (request.headers.has('origin')&&request.headers.get('origin')!==origin)||
         request.headers.get('sec-fetch-site')==='cross-site'||
         request.headers.has('cookie'))
        return respond(403,'access_denied');
      const token=tokenFrom(request);
      if(!token)return respond(401,'authentication_required');
      if(!(await verify(token)))return respond(401,'authentication_required');
      if(u.pathname==='/api/domain/session'){
        if(request.method!=='GET')return respond(405,'method_not_allowed');
        return Response.json({authenticated:true},{headers:{
          'Cache-Control':'private, no-store','Vary':'Authorization',
          'X-Content-Type-Options':'nosniff',
        }});
      }
      if(u.pathname!=='/api/domain')return respond(404,'not_found');
      if(request.method!=='POST')return respond(405,'method_not_allowed');
      const data=await readJson(request);
      if(!data||Object.keys(data).some(k=>!['domain','action','args'].includes(k))||
         !permitted(data.domain,data.action)||!arrayArgs(data.args))
        return respond(400,'invalid_request');
      const api=services?.[data.domain];
      const method=api?.[data.action];
      if(typeof method!=='function')return respond(503,'service_unavailable');
      let result;
      if(mailObject.has(data.domain)){
        if(data.args.length>1||!isRecord(data.args[0]??{})||
           Object.hasOwn(data.args[0]??{},'idToken'))
          return respond(400,'invalid_request');
        result=await method({...data.args[0],idToken:token});
      }else{
        result=await method(token,...data.args);
      }
      return ok(result??null);
    }catch(e){
      // Never echo exceptions, IDs or private records to the browser.
      if(e?.code==='denied'||/Denied$/.test(e?.name||''))return respond(403,'access_denied');
      if(e?.code==='conflict')return respond(409,'conflict');
      if(e?.code==='invalid')return respond(422,'invalid_request');
      return respond(503,'service_unavailable');
    }
  };
}
