import type {Firestore} from 'firebase-admin/firestore';

/** Production ADC, never an embedded JSON key or browser Firestore client. */
export async function publicContentFirestore():Promise<Firestore>{
  const [{initializeApp,getApps,applicationDefault},{getFirestore}]=
    await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/firestore'),
    ]);
  const name='cormyr-public-content';
  const app=getApps().find(entry=>entry.name===name)??initializeApp({
    credential:applicationDefault(),projectId:'cormyr',
  },name);
  return getFirestore(app);
}
