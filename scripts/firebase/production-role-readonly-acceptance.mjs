/**
 * Optional real-role read-only acceptance for the Firebase pilot.
 * Requires 3 separately authorized ephemeral test tokens, never logs them.
 * Never probes writes, secrets, mail content or user profiles.
 */
import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';

export const ORIGIN='https://atlas.cormyr.com.br';
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const TOKEN=/^[^\s]{20,10000}$/;
const CASES=[
  {name:'anonymous_A',actor:'anonymous',house:'A',expect:401},
  {name:'narrator_A',actor:'narrator',house:'A',expect:200},
  {name:'narrator_B',actor:'narrator',house:'B',expect:200},
  {name:'playerA_own',actor:'playerA',house:'A',expect:200},
  {name:'playerA_other',actor:'playerA',house:'B',expect:403},
  {name:'playerB_own',actor:'playerB',house:'B',expect:200},
  {name:'playerB_other',actor:'playerB',house:'A',expect:403},
];
export async function auditProductionRoleMatrix({
 houseA,houseB,tokens,fetcher=fetch,
}){
 if(!ID.test(houseA??'')||!ID.test(houseB??'')||houseA===houseB||
    !tokens||!['narrator','playerA','playerB'].every(k=>TOKEN.test(tokens[k]??'')))
   throw Error('real_role_test_credentials_unavailable');
 const rows=[];
 for(const scenario of CASES){
  const token=tokens[scenario.actor];
  let observed=null;
  try{
   const response=await fetcher(ORIGIN+'/api/firebase-cloud-read',{
     method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
     headers:{
       'Content-Type':'application/json',
       ...(token?{Authorization:'Bearer '+token}:{}),
     },
     body:JSON.stringify({action:'getHouse',houseId:scenario.house==='A'?houseA:houseB}),
     signal:AbortSignal.timeout(12000),
   });
   observed=response.status;
  }catch{}
  rows.push({
    scenario:scenario.name,
    expected:scenario.expect,observed,
    passed:observed===scenario.expect,
  });
 }
 return {
   scope:'REAL_FIREBASE_READONLY_ROLE_HTTP_MATRIX',
   scenariosRequired:CASES.length,scenariosPassed:rows.filter(x=>x.passed).length,
   roleMatrixPassed:rows.every(x=>x.passed),
   // Even a valid role matrix does not reconcile source, storage or game writes.
   sourceReconciled:false,mailWritesVerified:false,
   readyForPlayers:false,readyForCutover:false,productionWrites:0,
   rows,
 };
}
export function summaryRoleMatrix(report){
 return ['## Firebase Cloud — matriz de papéis reais (leitura)',
   '',
   'Cenários aprovados: '+Number(report.scenariosPassed??0)+' / '+
     Number(report.scenariosRequired??0)+'.',
   'Isolamento de Casas: '+(report.roleMatrixPassed===true?'conferido':'PENDENTE')+'.',
   '**Liberação de jogadores: NÃO AUTORIZADA** — ainda exige dados, Storage, Auth e missivas homologados.',
   'Nenhum token, UID, e-mail, Casa ou conteúdo é impresso.',
   '',
 ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const vars=process.env;
 try{
   const report=await auditProductionRoleMatrix({
     houseA:vars.CORMYR_E2E_HOUSE_A,houseB:vars.CORMYR_E2E_HOUSE_B,
     tokens:{
       narrator:vars.CORMYR_E2E_NARRATOR_TOKEN,
       playerA:vars.CORMYR_E2E_PLAYER_A_TOKEN,
       playerB:vars.CORMYR_E2E_PLAYER_B_TOKEN,
     },
   });
   if(vars.GITHUB_STEP_SUMMARY)appendFileSync(vars.GITHUB_STEP_SUMMARY,summaryRoleMatrix(report));
   // Status only; no private payload or token details.
   process.stdout.write(JSON.stringify(report)+'\n');
   if(!report.roleMatrixPassed)process.exitCode=1;
 }catch{
   process.stderr.write('Real Firebase role acceptance unavailable; no accounts were changed.\n');
   process.exitCode=1;
 }
}
