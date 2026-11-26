import type {Firestore} from 'firebase-admin/firestore';
import {getFirebaseAdminFirestore} from '@/lib/firebase/admin.server';

/** Production ADC, never an embedded JSON key or browser Firestore client. */
export function publicContentFirestore():Promise<Firestore>{
  return getFirebaseAdminFirestore();
}
