/**
 * Anonymous, no-op verification of the four independently gated Firebase
 * Cloud READ routes and three legacy/WRITE routes still blocked by archive mode.
 * Never authenticates, sends a valid action, or reads private documents.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const ORIGIN='https://atlas.cormyr.com.br';
export const READ_ROUTES=Object.freeze([
  ['constructionQuote','/api/firebase-cloud-house-quote','firebase_cloud_read_disabled'],
  ['operationalEconomy','/api/firebase-operational-economy','operational_economy_read_disabled'],
  ['houseReconciliation','/api/firebase-house-reconciliation-audit','house_reconciliation_audit_disabled'],
  ['treasuryAudit','/api/firebase-treasury-audit','firebase_treasury_audit_disabled'],
]);
// These server-side Cloud routes are allowed through archive mode but require
// either a disabled feature flag (503) or a Firebase ID token (401).
// Every probe sends an impossible action without credentials.
export const CLOUD_ROUTES=Object.freeze([
  ['firebaseCloudSession','/api/firebase-cloud-read','firebase_cloud_read_disabled'],
  ['firebaseCloudMail','/api/firebase-cloud-mail','firebase_cloud_mail_disabled'],
  ['firebaseCloudNewspaper','/api/firebase-cloud-newspaper','firebase_cloud_newspaper_disabled'],
  ['firebaseCloudTreasury','/api/firebase-cloud-treasury','firebase_cloud_treasury_disabled'],
]);
export const CLOSED_ROUTES=Object.freeze([
  ['constructionPurchase','/api/firebase-cloud-construction'],
  ['treasuryAdjustment','/api/firebase-cloud-treasury'],
  ['legacyEmulatorBridge','/api/firebase-domain'],
]);
const IMPOSSIBLE_ACTION='__cormyr_readonly_probe_invalid_action__';
const BODY=JSON.stringify({action:IMPOSSIBLE_ACTION});
const MAX_BYTES=512;
const safeCode=value=>
  typeof value==='string'&&/^[a-z_]{1,60}$/.test(value)?value:null;
const safeStatus=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;

async function safeErrorCode(response){
  if(!(response.headers.get('content-type')??'').toLowerCase()
    .includes('application/json'))return null;
  if(response.headers.get('content-encoding'))return null;
  const stream=response.body?.getReader();
  if(!stream)return null;
  const chunks=[];let bytes=0;
  try{
    while(true){
      const {done,value}=await stream.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){await stream.cancel();return null;}
      chunks.push(value);
    }
    const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return safeCode(parsed?.error);
  }catch{return null;}
}
export async function inspectCloudReadonlyBoundaries(fetcher=fetch){
  const checks=[];
  for(const [name,path,disabledCode] of READ_ROUTES){
    let status=null,code=null,passed=false;
    try{
      const response=await fetcher(ORIGIN+path,{
        method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:BODY,signal:AbortSignal.timeout(12000),
      });
      status=safeStatus(response.status);
      if(status===401||status===503){
        code=await safeErrorCode(response);
        passed=(status===401&&code==='authentication_required')||
          (status===503&&code===disabledCode);
      }
      passed=passed&&
        (response.headers.get('cache-control')??'').includes('no-store');
    }catch{/* unreachable is not verified */}
    const category=passed?'expected_guard':
      code==='legacy_backend_paused'?'legacy_boundary_still_active':
      code===null?'missing_or_unsafe_json_response':'unexpected_safe_error';
    checks.push({name,status,code:passed?code:null,category,
      passed:Boolean(passed)});
  }
  for(const [name,path,disabledCode] of CLOUD_ROUTES){
    let status=null,code=null,passed=false;
    try{
      const response=await fetcher(ORIGIN+path,{
        method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:BODY,signal:AbortSignal.timeout(12000),
      });
      status=safeStatus(response.status);
      if(status===401||status===503){
        code=await safeErrorCode(response);
        passed=(status===401&&code==='authentication_required')||
          (status===503&&code===disabledCode);
      }
      passed=passed&&
        (response.headers.get('cache-control')??'').includes('no-store');
    }catch{/* missing Cloud boundary is not accepted */ }
    checks.push({name,status,code:passed?code:null,
      category:passed?'expected_guard':'cloud_boundary_not_verified',
      passed:Boolean(passed)});
  }
  for(const [name,path] of CLOSED_ROUTES){
    let status=null,passed=false;
    try{
      const response=await fetcher(ORIGIN+path,{
        method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:BODY,signal:AbortSignal.timeout(12000),
      });
      status=safeStatus(response.status);
      if(status===503)
        passed=await safeErrorCode(response)==='legacy_backend_paused'&&
          (response.headers.get('cache-control')??'').includes('no-store');
    }catch{/* unreachable is not verified */}
    checks.push({name,status,code:passed?'legacy_backend_paused':null,
      passed:Boolean(passed)});
  }
  return {
    scope:'FIREBASE_CLOUD_READONLY_BOUNDARIES_PUBLIC_NOOP',
    origin:ORIGIN,requests:checks.length,
    readonlyRoutesReachOwnGuards:checks.slice(0,READ_ROUTES.length)
      .every(x=>x.passed),
    cloudPrivateRoutesProtected:checks.slice(READ_ROUTES.length,
      READ_ROUTES.length+CLOUD_ROUTES.length).every(x=>x.passed),
    legacyWritesBlocked:checks.slice(READ_ROUTES.length+CLOUD_ROUTES.length)
      .every(x=>x.passed),
    verified:checks.every(x=>x.passed),
    checks,accountActivationVerified:false,realCloudRoleE2EVerified:false,
    firestoreOperationsVerified:false,readyForPlayers:false,
    readyForCutover:false,releaseDecision:'NO_GO',writes:0,
  };
}
export function formatCloudReadonlyBoundarySummary(report){
  const checkNames=[...READ_ROUTES,...CLOUD_ROUTES,...CLOSED_ROUTES]
    .map(x=>x[0]);
  const rows=checkNames.map(name=>{
    const c=Array.isArray(report?.checks)?
      report.checks.find(x=>x?.name===name):null;
    return '| '+name+' | '+
      (safeStatus(c?.status)===null?'sem evidência':'HTTP '+c.status)+
      ' | '+(c?.passed===true?'Confirmado':'Pendente')+' |';
  });
  return [
    '## Cormyr — rotas Cloud somente leitura',
    '',
    '| Rota fixa | Status | Verificação |',
    '| --- | --- | --- |',...rows,
    '',
    'Leituras bloqueadas por flags ou por autenticação: '+
      (report?.readonlyRoutesReachOwnGuards===true?'Confirmado':'Pendente'),
    'Leituras, missivas, jornal e tesouro Cloud exigem Auth ou flag fechada: '+
      (report?.cloudPrivateRoutesProtected===true?'Confirmado':'Pendente'),
    'Escritas e ponte legada interrompidas: '+
      (report?.legacyWritesBlocked===true?'Confirmado':'Pendente'),
    'Liberação de jogadores: NÃO AUTORIZADA (NO_GO).',
    'Somente POSTs anônimos com uma ação impossível, sem credenciais,',
    'sem comando de jogo válido, sem alterações na nuvem ou leitura privada.',
    '',
  ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await inspectCloudReadonlyBoundaries();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      formatCloudReadonlyBoundarySummary(result),'utf8');
  if(!result.verified)process.exitCode=2;
}