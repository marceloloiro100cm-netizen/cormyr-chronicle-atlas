/**
 * Read-only, bounded Cloud Logging query for the editor's Firebase media 503.
 * Prints only aggregate counts and a fixed status label. Never logs event
 * payloads, paths, URLs, identities, tokens, headers, request data or stacks.
 * The existing main-only reader service account may lack logging access;
 * that is reported as READ_PERMISSION_REQUIRED, not a reason to broaden IAM.
 */
import {applicationDefault} from 'firebase-admin/app';
const summary={scope:'NEWSPAPER_MEDIA_503_LOG_AUDIT_READ_ONLY',
 evidence:'INCONCLUSIVE',httpStatus:null,matching503Count:0,
 cloudWrites:0,iamChanges:0,storageWrites:0};
try{
 const credential=applicationDefault();
 const token=(await credential.getAccessToken())?.access_token;
 if(typeof token!=='string'||token.length<12)throw Error('token_unavailable');
 const from=new Date(Date.now()-4*60*60*1000).toISOString();
 const filter='timestamp>="'+from+'" AND '+
  'resource.type="cloud_run_revision" AND httpRequest.status=503 AND '+
  'httpRequest.requestUrl:"/api/firebase-newspaper-media"';
 const res=await fetch('https://logging.googleapis.com/v2/entries:list',{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({resourceNames:['projects/cormyr'],filter,
   pageSize:50,orderBy:'timestamp desc'}),
 });
 summary.httpStatus=[200,400,401,403,404,429,500,503].includes(res.status)
  ?res.status:null;
 if(res.status===401||res.status===403)summary.evidence='READ_PERMISSION_REQUIRED';
 else if(res.status===200){
  const result=await res.json();
  if(Array.isArray(result?.entries)&&result.entries.length<=50){
   summary.matching503Count=result.entries.filter(entry=>
    entry?.httpRequest?.status===503).length;
   summary.evidence=summary.matching503Count?'HTTP_503_CONFIRMED':'NO_MATCH_IN_WINDOW';
  }else if(!result?.entries)summary.evidence='NO_MATCH_IN_WINDOW';
 }
}catch{/* Read-only audit must fail safely and emit no provider diagnostics. */}
console.log(JSON.stringify(summary));
