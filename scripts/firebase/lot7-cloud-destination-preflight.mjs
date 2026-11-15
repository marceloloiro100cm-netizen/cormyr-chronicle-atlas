/**
 * Lote 7: read-only destination emptiness preflight.
 *
 * Deliberately restricted to an isolated homologation project. The real
 * project "cormyr" cannot be selected and no import is performed here.
 * firebase-admin is loaded only for an explicitly invoked operator probe.
 */
import {pathToFileURL} from 'node:url';

export function isolatedDestination(projectId) {
  return typeof projectId==='string' &&
    /^cormyr-(?:homolog|migration)-[a-z0-9][a-z0-9-]{2,38}$/.test(projectId) &&
    !projectId.endsWith('-');
}

const verifyCount = (value,label) => {
  if(!Number.isInteger(value)||value<0)throw Error('Invalid '+label+' count');
  return value;
};

/** The injected read methods MUST NOT mutate Cloud, and only return counts. */
export async function preflightEmptyDestination({projectId, readAuthCount, readCollectionCount}) {
  if(!isolatedDestination(projectId))throw Error('isolated_homologation_project_required');
  if(typeof readAuthCount!=='function'||typeof readCollectionCount!=='function')
    throw Error('read_only_sources_required');
  const [users, collections] = await Promise.all([
    readAuthCount(),readCollectionCount(),
  ]);
  const authCount=verifyCount(users,'Auth');
  const collectionCount=verifyCount(collections,'Firestore');
  const empty=authCount===0&&collectionCount===0;
  return Object.freeze({
    scope:'READ_ONLY_ISOLATED_CLOUD_PREFLIGHT', projectId,
    authAccountsFound:authCount, firestoreCollectionsFound:collectionCount,
    destinationEmpty:empty,
    canPrepareDryRun:empty,
    sourceBackupVerified:false,sourceLiveReconciled:false,
    destinationStorageVerified:false,oauthProvidersVerified:false,
    productionImportAuthorized:false,cloudWrites:0,readyForCutover:false,
    blockers:empty
      ? ['source_and_storage_reconciliation_required','cloud_role_e2e_required']
      : ['destination_not_empty','no_import_to_occupied_project'],
  });
}

export async function inspectFirebaseAdminDestination(projectId, loadAdmin) {
  if(!isolatedDestination(projectId))throw Error('isolated_homologation_project_required');
  if(typeof loadAdmin!=='function')throw Error('admin_reader_required');
  const {initializeApp, deleteApp, getAuth, getFirestore} = await loadAdmin();
  const app=initializeApp({projectId},'cormyr-lot7-readonly-'+process.pid);
  try {
    return await preflightEmptyDestination({
      projectId,
      readAuthCount:async()=>{
        // One user proves the project is NOT empty; never enumerate all users.
        const response=await getAuth(app).listUsers(1);
        if(!response||!Array.isArray(response.users))throw Error('auth_read_failed');
        return response.users.length;
      },
      readCollectionCount:async()=>{
        // Collection identifiers are never printed to stdout or CI logs.
        const references=await getFirestore(app).listCollections();
        if(!Array.isArray(references))throw Error('firestore_read_failed');
        return references.length;
      },
    });
  }finally{
    await deleteApp(app);
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==3||args[0]!=='--readonly'||args[1]!=='--project'){
    console.error('Usage: node scripts/firebase/lot7-cloud-destination-preflight.mjs --readonly --project cormyr-homolog-EXPLICIT');
    process.exitCode=2;
  }else{
    inspectFirebaseAdminDestination(args[2],()=>import('firebase-admin').then(async sdk=>{
      const auth=await import('firebase-admin/auth');
      const firestore=await import('firebase-admin/firestore');
      return {initializeApp:sdk.initializeApp,deleteApp:sdk.deleteApp,
        getAuth:auth.getAuth,getFirestore:firestore.getFirestore};
    })).then(result=>{
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
      if(!result.destinationEmpty)process.exitCode=1;
    }).catch(()=>{
      console.error('Cloud destination preflight unavailable or blocked. No data printed or written.');
      process.exitCode=2;
    });
  }
}
