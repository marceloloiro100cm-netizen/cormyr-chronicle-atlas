/**
 * Investigate newsroom image 503s without secrets, media bytes, names, object
 * paths, private identities, raw log messages or request URLs in the output.
 * Both Cloud Logging and the public unauthenticated API probe are read-only.
 * Never use an editor token in CI.
 */
import {applicationDefault} from 'firebase-admin/app';
const ROOT='https://atlas.cormyr.com.br';
const labels=['media_parse_backend_unavailable','media_sdk_initialization_failed',
 'media_service_initialization_failed','media_operation_unavailable'];
const summary={
 scope:'CORMYR_NEWSROOM_IMAGE_FAILURE_READONLY',
 cloudWrites:0,storageWrites:0,firestoreWrites:0,iamChanges:0,
 mediaEndpoint:{status:null,body:'UNKNOWN',handlerMarker:false},
 staffPhotoEndpoint:{status:null,body:'UNKNOWN',handlerMarker:false},
 logging:{available:false,status:null,windowHours:12,mediaRequests:0,media503:0,
  httpCodes:{'2xx':0,'4xx':0,'5xx':0},sizeBands:{small:0,medium:0,large:0,unknown:0},
  latencyBands:{fast:0,slow:0,verySlow:0,unknown:0},phaseWarnings:
   {parse:0,sdk:0,service:0,operation:0},truncated:false},
};
const knownStatus=n=>[200,201,202,400,401,403,404,405,409,413,415,429,500,502,503,504].includes(n)?n:null;
const requestSize=entry=>Number(entry?.httpRequest?.requestSize??NaN);
function accumulateRequest(entry){
 const status=Number(entry?.httpRequest?.status);
 if(!Number.isSafeInteger(status))return;
 summary.logging.mediaRequests++;
 const codeBand=status>=500?'5xx':status>=400?'4xx':'2xx';
 summary.logging.httpCodes[codeBand]++;
 if(status===503)summary.logging.media503++;
 const size=requestSize(entry);
 const sizes=summary.logging.sizeBands;
 if(!Number.isFinite(size)||size<0)sizes.unknown++;
 else if(size<1024*1024)sizes.small++;
 else if(size<8*1024*1024)sizes.medium++;
 else sizes.large++;
 const raw=entry?.httpRequest?.latency;
 const seconds=typeof raw==='string'&&/^\d+(?:\.\d+)?s$/.test(raw)?Number(raw.slice(0,-1)):NaN;
 const lat=summary.logging.latencyBands;
 if(!Number.isFinite(seconds))lat.unknown++;
 else if(seconds<1)lat.fast++;
 else if(seconds<10)lat.slow++;
 else lat.verySlow++;
}
async function probe(path,key){
 try{
  const response=await fetch(ROOT+path,{
   method:'POST',cache:'no-store',redirect:'error',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'read',path:'invalid'}),
   signal:AbortSignal.timeout(12000),
  });
  const result={status:knownStatus(response.status),
   handlerMarker:response.headers.get('x-cormyr-media-handler')==='v2',body:'UNKNOWN'};
  const content=await response.text();
  try{
   const parsed=JSON.parse(content);
   if(parsed&&typeof parsed==='object'&&typeof parsed.error==='string'&&
      /^[a-z_]{3,60}$/.test(parsed.error))result.body='STRUCTURED_ERROR';
   else result.body='OTHER_JSON';
  }catch{
   result.body=content.length===0?'EMPTY':'NON_JSON';
  }
  summary[key]=result;
 }catch{summary[key]={status:null,body:'UNREACHABLE',handlerMarker:false};}
}
await Promise.all([
 probe('/api/firebase-newspaper-media','mediaEndpoint'),
 probe('/api/firebase-newspaper-staff-photo','staffPhotoEndpoint'),
]);
try{
 const token=(await applicationDefault().getAccessToken())?.access_token;
 if(typeof token!=='string'||token.length<12)throw Error('auth unavailable');
 const since=new Date(Date.now()-12*3600_000).toISOString();
 const base='timestamp>="'+since+'" AND resource.type="cloud_run_revision"';
 async function query(filter,max=400){
  const response=await fetch('https://logging.googleapis.com/v2/entries:list',{
   method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(18000),
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({resourceNames:['projects/cormyr'],filter,
    pageSize:max,orderBy:'timestamp desc'}),
  });
  summary.logging.status=knownStatus(response.status);
  if(!response.ok)throw Error('log read unavailable');
  const result=await response.json();
  if(result.nextPageToken)summary.logging.truncated=true;
  return Array.isArray(result.entries)?result.entries:[];
 }
 const requests=await query(base+' AND httpRequest.requestUrl:"/api/firebase-newspaper-media"');
 requests.forEach(accumulateRequest);
 const warnings=await query(base+' AND textPayload:"NEWSPAPER_MEDIA_UNCLASSIFIED_503"',100);
 for(const event of warnings){
  const message=event?.textPayload;
  if(typeof message!=='string')continue;
  const index=labels.findIndex(value=>message.includes('NEWSPAPER_MEDIA_UNCLASSIFIED_503 '+value));
  if(index>=0)summary.logging.phaseWarnings[['parse','sdk','service','operation'][index]]++;
 }
 summary.logging.available=true;
}catch{/* No IAM expansions, and never output error details or log bodies. */}
console.log(JSON.stringify(summary));
