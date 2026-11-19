import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {importWorkspace} from './workspace-import.mjs';
try{
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.GOOGLE_CLOUD_PROJECT!=='cormyr')throw Error('invalid_environment');
 const app=initializeApp({projectId:'cormyr',credential:applicationDefault()});
 const db=getFirestore(app);
 const snapshots=await db.collection('migrationPrivateSnapshots').limit(2).get();
 if(snapshots.size!==1)throw Error('snapshot_selection_ambiguous');
 const result=await importWorkspace(db,snapshots.docs[0].id);
 // Aggregate counts only. No identifiers, hashes, content or credentials.
 console.log(JSON.stringify({status:'complete',...result}));
}catch{
 console.error('Workspace import failed. Private source preserved; no account, permission or original data was changed.');
 process.exitCode=1;
}
