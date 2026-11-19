/**
 * Protected, read-only Firebase workspace reconciliation.
 * Only aggregates may be emitted. Never print UIDs, hashes or contents.
 */
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {inspectWorkspaceMetadata} from './workspace-audit.mjs';
import {inspectWorkspaceLinks} from './workspace-link-audit.mjs';

try{
  if(process.env.GOOGLE_CLOUD_PROJECT!=='cormyr'||
     process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw Error('wrong_environment');
  const app=initializeApp({projectId:'cormyr',credential:applicationDefault()});
  try{
    const db=getFirestore(app);
    const imports=await db.collection('campaignWorkspaceImports').limit(2).get();
    if(imports.size!==1)throw Error('workspace_selection_ambiguous');
    const snapshot=imports.docs[0].id;
    if(!/^[a-f0-9]{64}$/.test(snapshot))throw Error('invalid_snapshot');
    const metadata=await inspectWorkspaceMetadata(db,snapshot);
    if(metadata.status!=='complete'||metadata.metadataConsistent!==true)
      throw Error('workspace_not_completed');
    const links=await inspectWorkspaceLinks(db,snapshot);
    if(links.status!=='complete'||links.sourceRelationshipsChecked!==true)
      throw Error('workspace_links_pending');
    const verdict=links.orphanReferences===0&&links.unverifiedFields===0
      ?'source_links_consistent':'manual_relationship_review_required';
    // No source record, account, message text, letter subject, or snapshot ID.
    console.log(JSON.stringify({status:'audited',verdict,
      tables:metadata.tablesImported,rows:metadata.rowsImported,
      moduleRows:metadata.modules,referenceSummary:links.modules,
      orphanReferences:links.orphanReferences,
      unverifiedFields:links.unverifiedFields,
      operationalUIConnected:false,sourceLiveReconciled:false,
    }));
    // Legacy links may legitimately target retired historical rows;
    // a non-zero count requires manual review and never opens access.
    if(verdict!=='source_links_consistent')process.exitCode=2;
  }finally{await deleteApp(app);}
}catch{
  console.error('Protected workspace relationship audit unavailable. Private data was not printed or modified.');
  process.exitCode=1;
}
