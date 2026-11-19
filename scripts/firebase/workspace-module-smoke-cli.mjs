/**
 * Protected Cloud real-source module compatibility audit (GET-only).
 * Source values are never written to logs. The temporary esbuild bundle only
 * compiles the existing original mailPage TypeScript contract for Node.
 */
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectWorkspaceMetadata} from './workspace-audit.mjs';
import {MODULE_TABLES,inspectModuleSourceContracts}
  from './workspace-module-smoke.mjs';
import {readWorkspaceTable} from './workspace-import.mjs';

let app=null,temporary=null;
try{
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||
     process.env.FIRESTORE_EMULATOR_HOST||
     process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw Error('cloud_audit_environment_invalid');
  app=initializeApp({projectId:'cormyr',credential:applicationDefault()},
    'workspace-module-contract-audit');
  const db=getFirestore(app);
  const imports=await db.collection('campaignWorkspaceImports').limit(2).get();
  if(imports.size!==1)throw Error('workspace_selection_ambiguous');
  const snapshot=imports.docs[0].id;
  if(!/^[a-f0-9]{64}$/.test(snapshot))throw Error('workspace_snapshot_invalid');
  const meta=await inspectWorkspaceMetadata(db,snapshot);
  if(meta.status!=='complete'||meta.metadataConsistent!==true)
    throw Error('workspace_metadata_unverified');

  // No downloaded source row is persisted to disk.
  temporary=await mkdtemp(join(tmpdir(),'cormyr-mail-'));
  const output=join(temporary,'original-mail.mjs');
  await build({entryPoints:[resolve('src/lib/mail/firebase-workspace-mail.ts')],
    bundle:true,platform:'node',format:'esm',target:'node24',outfile:output,
    logLevel:'silent',packages:'external'});
  const {runWorkspaceMailPage}=await import(pathToFileURL(output).href);
  if(typeof runWorkspaceMailPage!=='function')
    throw Error('workspace_mail_bundle_unavailable');
  const rows=await Promise.all(MODULE_TABLES.map(t=>
    readWorkspaceTable(db,snapshot,t)));
  const dataset=Object.fromEntries(MODULE_TABLES.map((n,i)=>[n,rows[i]]));
  const report=inspectModuleSourceContracts(dataset,runWorkspaceMailPage);
  if(report.status!=='source_projection_consistent')
    throw Error('workspace_module_projection_unverified');
  console.log(JSON.stringify(report));
}catch{
  console.error('Protected workspace module source verification blocked. No private record, identity or text was printed.');
  process.exitCode=2;
}finally{
  if(temporary)await rm(temporary,{recursive:true,force:true}).catch(()=>{});
  if(app)await deleteApp(app).catch(()=>{});
}
