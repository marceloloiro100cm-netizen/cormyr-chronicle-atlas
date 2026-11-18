/**
 * GitHub-only, anonymous Firebase player-pilot diagnostic.
 *
 * Fixed anonymous GETs and no-op POST denials; no credentials or private responses.
 * Each POST contains an impossible action and no valid command arguments.
 * It does NOT establish actual login, Cloud runtime availability or GO.
 * A green workflow means this bounded preflight completed, not a player launch.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const ORIGIN='https://atlas.cormyr.com.br';
const ENDPOINTS=Object.freeze([
  ['firebasePilotPage','/firebase-access'],
  ['campaignTime','/api/public/time'],
  ['publicCatalog','/api/public/catalog'],
  ['publicTranslations','/api/public/translations?locale=en'],
]);
const PRIVATE_BOUNDARIES=Object.freeze([
  ['cloudHouseRead','/api/firebase-cloud-read'],
  ['cloudMail','/api/firebase-cloud-mail'],
  ['cloudNewspaper','/api/firebase-cloud-newspaper'],
  ['cloudTreasury','/api/firebase-cloud-treasury'],
]);
const ANONYMOUS_NOOP=JSON.stringify({
  action:'__cormyr_anonymous_preflight_never_a_valid_command__',
});
const observedStatus=v=>Number.isInteger(v)&&v>=100&&v<=599?v:null;
const closedToAnonymous=code=>code===401||code===403||code===503;

export async function inspectPlayerPilotPublicPreflight({fetcher=fetch}={}){
  const statuses={};
  for(const [key,path] of ENDPOINTS){
    let code=null;
    try{
      const response=await fetcher(ORIGIN+path,{
        method:'GET',redirect:'manual',credentials:'omit',
        cache:'no-store',headers:{Accept:'text/html, application/json'},
        signal:AbortSignal.timeout(10000),
      });
      // No redirect following, no body reads and no response-header logging:
      // prevent a compromised hosting redirect from exfiltrating context.
      code=observedStatus(response.status);
    }catch{/* network failure remains inconclusive */}
    statuses[key]=code;
  }
  const anonymousStatusCodes={};
  for(const [key,path] of PRIVATE_BOUNDARIES){
    let code=null;
    try{
      const response=await fetcher(ORIGIN+path,{
        method:'POST',redirect:'manual',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:ANONYMOUS_NOOP,
        signal:AbortSignal.timeout(10000),
      });
      // Deliberately ignore bodies, headers and redirects.
      code=observedStatus(response.status);
    }catch{/* Missing evidence cannot prove a denial. */}
    anonymousStatusCodes[key]=code;
  }
  const privateEndpointsFailClosedNow=Object.values(anonymousStatusCodes)
    .every(closedToAnonymous);
  const privateAuthGuardVerified=Object.values(anonymousStatusCodes)
    .every(code=>code===401);
  const pilotPageReachable=statuses.firebasePilotPage===200;
  return {
    scope:'FIREBASE_PLAYER_PILOT_PUBLIC_PREFLIGHT',
    origin:ORIGIN,
    statusCodes:statuses,
    anonymousPrivateStatusCodes:anonymousStatusCodes,
    privateEndpointsFailClosedNow,
    privateAuthGuardVerified,
    cloudReadAuthGuardVerified:anonymousStatusCodes.cloudHouseRead===401,
    pilotPageReachable,
    publicContentAvailable:statuses.publicCatalog===200&&
      statuses.publicTranslations===200,
    calendarPublicAvailable:statuses.campaignTime===200,
    // All real launch gates are independent of these unauthenticated GETs.
    accountActivationVerified:false,
    cloudRuntimeReconciled:false,
    crossAccountRoleE2EVerified:false,
    mailboxAndCalendarWritesVerified:false,
    rollbackOperationallyApproved:false,
    readyForPlayers:false,readyForCutover:false,
    releaseDecision:'NO_GO',
    requests:ENDPOINTS.length+PRIVATE_BOUNDARIES.length,writes:0,
  };
}

export function formatPlayerPilotPreflightSummary(report){
  const http=value=>observedStatus(value)===null?'indisponível':
    'HTTP '+value;
  const status=report?.statusCodes??{};
  const privateStatus=report?.anonymousPrivateStatusCodes??{};
  return [
    '## Cormyr — piloto Firebase (somente diagnóstico público)',
    '',
    '| Prova pública sem login | Resultado |',
    '| --- | --- |',
    '| Página /firebase-access | '+http(status.firebasePilotPage)+' |',
    '| Relógio público | '+http(status.campaignTime)+' |',
    '| Catálogo público | '+http(status.publicCatalog)+' |',
    '| Traduções públicas | '+http(status.publicTranslations)+' |',
    '| Casas sem login (comando impossível) | '+http(privateStatus.cloudHouseRead)+' |',
    '| Missivas sem login (comando impossível) | '+http(privateStatus.cloudMail)+' |',
    '| Jornal sem login (comando impossível) | '+http(privateStatus.cloudNewspaper)+' |',
    '| Tesouro sem login (comando impossível) | '+http(privateStatus.cloudTreasury)+' |',
    '| APIs privadas recusaram acesso anônimo | '+
      (report?.privateEndpointsFailClosedNow===true?'Sim, nesta consulta':
      '**Não comprovado**')+' |',
    '| Leitura Firebase 401 sem autenticação | '+
      (report?.cloudReadAuthGuardVerified===true?'Confirmado nesta consulta':
      'Não comprovado (pode estar desativado)')+' |',
    '| Auth 401 em todas as APIs privadas | '+
      (report?.privateAuthGuardVerified===true?'Sim':
      'Não comprovado ou serviço desativado')+' |',
    '| Autenticação de usuários reais | **Não verificada** |',
    '| Runtime de escrita reconciliado | **Não verificado** |',
    '| Aceite real de isolamento entre Casas | **Não verificado** |',
    '| Escrita de missivas e calendário | **Não verificada** |',
    '| Rollback administrativo | **Não aprovado** |',
    '| Liberação dos jogadores | **NÃO AUTORIZADA (NO_GO)** |',
    '',
    'Somente GETs públicos e POSTs sem credenciais com ação deliberadamente inválida.',
    'Não envia nenhuma operação de jogo válida e jamais lê respostas privadas.',
    'Este job não ativa usuários, importa dados, publica conteúdo, faz deploy,',
    'configura segredos, promove rollout ou modifica Firestore, Storage ou IAM.',
    'Um job verde comprova execução do diagnóstico, nunca autorização para jogar.',
    '',
  ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await inspectPlayerPilotPublicPreflight();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      formatPlayerPilotPreflightSummary(result),'utf8');
  // Unexpected status, redirect or missing evidence must fail the privacy CI.
  // A 503 is a closed feature flag, not proof of Auth guard.
  if(!result.privateEndpointsFailClosedNow)process.exitCode=2;
}
