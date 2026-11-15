/**
 * Integrated Cormyr acceptance: run existing synthetic service E2E tests
 * together in a single isolated Firestore/Auth Emulator session.
 *
 * Never accepts a script name, endpoint or project from command line.
 * No production Cloud credentials, SQL writes, private backups or user data.
 */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

export const PROJECT='demo-cormyr-migration';
export const DOMAIN_GROUPS=Object.freeze({
  houses: Object.freeze([
    'noble-house-service.integration.mjs',
    'character-service.integration.mjs',
    'record-service.integration.mjs',
    'schedule-service.integration.mjs',
  ]),
  communications: Object.freeze([
    'mail-command-service.integration.mjs',
    'letter-inbox-service.integration.mjs',
    'mail-unified-service.integration.mjs',
    'newspaper-service.integration.mjs',
  ]),
  strategy: Object.freeze([
    'spy-agents-service.integration.mjs',
    'spy-missions-service.integration.mjs',
    'spy-intel-service.integration.mjs',
    'battle-service.integration.mjs',
  ]),
  operations: Object.freeze([
    'time-service.integration.mjs',
    'scheduled-jobs.integration.mjs',
    'drive-service.integration.mjs',
    'storage-access-service.integration.mjs',
    'storage-resolvers.integration.mjs',
  ]),
  security: Object.freeze([
    'lot5-role-security.integration.mjs',
    'private-gm-service.integration.mjs',
    'domain-bridge.integration.mjs',
  ]),
});
export const DOMAIN_TOTAL=Object.values(DOMAIN_GROUPS).reduce((n,group)=>n+group.length,0);

export function modulesForGroup(name){
  if(!Object.hasOwn(DOMAIN_GROUPS,name))throw Error('Unknown isolated domain test group');
  return DOMAIN_GROUPS[name];
}

export function validateIsolatedExecution(group,env){
  const modules=modulesForGroup(group);
  assertEmulatorOnly(env,PROJECT);
  if(!/^(127\.0\.0\.1|localhost|\[::1\]):9099$/.test(env.FIREBASE_AUTH_EMULATOR_HOST||''))
    throw Error('Local Auth Emulator is mandatory');
  return modules;
}

export function executeDomainAcceptance(group,{env=process.env,spawn=spawnSync}={}){
  const modules=validateIsolatedExecution(group,env);
  for(const moduleName of modules){
    const result=spawn(process.execPath,[resolve('scripts/firebase',moduleName)],{
      cwd:process.cwd(),env,stdio:'inherit',timeout:12*60*1000,
    });
    if(result.error||result.status!==0){
      // No logs or sensitive inputs are included in thrown messages.
      throw Error('Synthetic domain test failed: '+moduleName);
    }
  }
  return {
    scope:'SYNTHETIC_LOCAL_FIREBASE_AUTH_FIRESTORE_EMULATORS_ONLY',
    group,passedModules:modules.length,totalModules:DOMAIN_TOTAL,
    productionCloudWrites:0,cloudIdentityVerified:false,
    privateDataReconciled:false,readyForCutover:false,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const report=executeDomainAcceptance(process.argv[2]);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }catch{
    // No stack containing fake tokens or fixture content in the job summary.
    console.error('Isolated domain acceptance failed; no Cloud cutover is allowed.');
    process.exitCode=1;
  }
}
