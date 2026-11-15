/**
 * An executable, non-mutating inventory for the 18 items (6, 9, 11–26)
 * requested in Cormyr's next migration phase.
 *
 * The presence of a script proves only that source code exists; local tests
 * additionally prove emulator behavior. Neither proves Cloud migration.
 * Outputs expose no account IDs, data rows, private file names or credentials.
 */
import {access} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectLot9RepositorySafety,evaluateLot9CutoverGate}
  from './lot9-cutover-gate.mjs';

const item=(id,title,group,files,requiresCloud=true)=>Object.freeze({
  id,title,group,files:Object.freeze(files),requiresCloud,
});
export const EXECUTION_ITEMS=Object.freeze([
  item(6,'Quarentena e integridade de missivas','communications',[
    'scripts/firebase/stage-mail-history-emulator.mjs',
    'scripts/firebase/stage-mail-history-emulator.test.mjs',
  ]),
  item(9,'Permissoes dos tres perfis','security',[
    'scripts/firebase/lot5-role-security.integration.mjs',
    'src/lib/auth/role-self-audit.test.ts',
  ]),
  item(11,'Casas nobres e livro-caixa','houses',[
    'scripts/firebase/noble-house-service.integration.mjs',
    'scripts/firebase/noble-house-service.mjs',
  ]),
  item(12,'Missivas e historico','communications',[
    'scripts/firebase/mail-command-service.integration.mjs',
    'scripts/firebase/mail-unified-service.integration.mjs',
    'scripts/firebase/mail-history-fixtures.mjs',
  ]),
  item(13,'Jornal e publicacao','communications',[
    'scripts/firebase/newspaper-service.integration.mjs',
    'scripts/firebase/newspaper-service.mjs',
  ]),
  item(14,'Calendario e Hub Temporal','operations',[
    'scripts/firebase/time-service.integration.mjs',
    'src/integrations/backend/firebase-calendar-polling.test.ts',
  ]),
  item(15,'Espionagem e dossies','strategy',[
    'scripts/firebase/spy-agents-service.integration.mjs',
    'scripts/firebase/spy-missions-service.integration.mjs',
    'scripts/firebase/spy-intel-service.integration.mjs',
  ]),
  item(16,'Batalha e simulacao','strategy',[
    'scripts/firebase/battle-service.integration.mjs',
    'scripts/firebase/battle-service.mjs',
  ]),
  item(17,'Personagens e registros privados','houses',[
    'scripts/firebase/character-service.integration.mjs',
    'scripts/firebase/record-service.integration.mjs',
    'scripts/firebase/private-gm-service.integration.mjs',
  ]),
  item(18,'Adaptadores para aplicativo','security',[
    'src/integrations/backend/firebase-read-adapter.test.ts',
    'src/integrations/backend/firebase-domain-client.test.ts',
    'src/integrations/backend/firebase-domain-proxy.test.ts',
  ]),
  item(19,'Atualizacao em tempo real','operations',[
    'src/integrations/backend/firebase-calendar-polling.ts',
    'src/integrations/backend/firebase-calendar-polling.test.ts',
  ]),
  item(20,'Storage e escopo de imagens','operations',[
    'scripts/firebase/storage-access-service.integration.mjs',
    'scripts/firebase/storage-resolvers.integration.mjs',
    'scripts/firebase/verify-storage-homologation.test.mjs',
  ]),
  item(21,'Integracao com Google Drive','operations',[
    'scripts/firebase/drive-service.integration.mjs',
    'scripts/firebase/google-drive-read-adapter.test.mjs',
  ]),
  item(22,'Automacoes e agendamentos','operations',[
    'scripts/firebase/scheduled-jobs.integration.mjs',
    'scripts/firebase/scheduled-jobs-handler.test.mjs',
  ]),
  item(23,'Isolamento de Casas e direitos','security',[
    'scripts/firebase/lot5-role-security.integration.mjs',
    'scripts/firebase/lot8-http-role-acceptance.test.mjs',
  ]),
  item(24,'Aceite E2E dos dominios','security',[
    'scripts/firebase/full-domain-emulator-acceptance.mjs',
    'scripts/firebase/full-domain-emulator-acceptance.test.mjs',
  ]),
  item(25,'Desempenho e observabilidade','operations',[
    'scripts/firebase-production-acceptance-smoke.mjs',
    'scripts/firebase-production-acceptance-smoke.test.mjs',
  ]),
  item(26,'Ensaio de corte e rollback','security',[
    'scripts/firebase/lot9-cutover-gate.mjs',
    'scripts/firebase/lot9-cutover-gate.test.mjs',
    'docs/firebase/CUTOVER-RUNBOOK.md',
  ]),
]);

export const ITEM_IDS=Object.freeze([6,9,...Array.from({length:16},(_,i)=>i+11)]);

function safePaths(root,files){
  return files.map(p=>{
    // Even though the paths are literals, defend the test harness against
    // changes to its own registry or traversal through symlinks.
    if(typeof p!=='string'||!/^([a-z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(p))
      throw Error('invalid_evidence_path');
    const full=resolve(root,p);
    const rel=relative(root,full);
    if(rel.startsWith('..')||rel.split(sep).includes('..'))
      throw Error('unsafe_evidence_path');
    return full;
  });
}
export async function evaluateExecutionItems(root=process.cwd(),check=access){
  const results=[];
  for(const entry of EXECUTION_ITEMS){
    const paths=safePaths(root,entry.files);
    let found=0;
    for(const path of paths){
      try{await check(path);found++}catch{/* missing source is not proof */}
    }
    results.push({
      id:entry.id,group:entry.group,title:entry.title,
      sourceContractsFound:found,
      sourceContractsExpected:paths.length,
      codeEvidencePresent:found===paths.length,
      emulatorProofInThisReport:false,
      realCloudE2EVerified:false,
      sourceDataReconciled:false,
      releaseApproved:false,
      status:found===paths.length?'CODE_PRESENT_TESTS_REQUIRED':'MISSING_SOURCE_CONTRACTS',
    });
  }
  return results;
}
export async function runExecutionReadiness({root=process.cwd(),check=access,inspectSafety=inspectLot9RepositorySafety}={}){
  const safety=await inspectSafety(root);
  const gate=evaluateLot9CutoverGate({sourceSafety:safety});
  const entries=await evaluateExecutionItems(root,check);
  return {
    scope:'OFFLINE_18_ITEM_EXECUTION_INVENTORY_NOT_CLOUD_ACCEPTANCE',
    requestedItems:ITEM_IDS.length,
    fullyImplementedInCloud:0,
    codeContractsPresent:entries.filter(x=>x.codeEvidencePresent).length,
    codeContractsMissing:entries.filter(x=>!x.codeEvidencePresent).length,
    allSourceContractsPresent:entries.every(x=>x.codeEvidencePresent),
    emulatorSuitesMustPassSeparately:true,
    independentExternalEvidenceVerified:false,
    appHostingPublishedDoesNotProveCloudData:true,
    productionWrites:0,
    readyForPlayersOnFirebaseCloud:false,
    readyForCutover:false,
    decision:gate.decision,
    items:entries,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runExecutionReadiness().then(r=>{
    process.stdout.write(JSON.stringify(r,null,2)+'\n');
    if(!r.allSourceContractsPresent)process.exitCode=1;
  }).catch(()=>{
    console.error('Readiness audit blocked; no cloud mutation performed.');
    process.exitCode=1;
  });
}
