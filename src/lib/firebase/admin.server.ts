import type {App} from 'firebase-admin/app';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import type {Storage} from 'firebase-admin/storage';

/**
 * Shared Firebase Admin singleton for all Nitro server routes.
 *
 * Uses Application Default Credentials (App Hosting service account), never an
 * embedded service-account JSON key. Sharing a single App/Firestore/Auth/Storage
 * instance across routes avoids ~25 duplicate gRPC pools and keeps in-memory
 * WeakMap caches unified within the 1 GiB Cloud Run container.
 */
const ADMIN_APP_NAME = 'cormyr-firebase-admin';

type AdminServices = {
  app: App;
  auth: Auth;
  db: Firestore;
  storage: Storage;
};

let servicesPromise: Promise<AdminServices> | undefined;

export function getFirebaseAdminServices(): Promise<AdminServices> {
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
      import('firebase-admin/storage'),
    ])
      .then(([{applicationDefault, getApps, initializeApp}, {getAuth}, {getFirestore}, {getStorage}]) => {
        const app =
          getApps().find(entry => entry.name === ADMIN_APP_NAME) ??
          initializeApp({credential: applicationDefault(), projectId: 'cormyr'}, ADMIN_APP_NAME);
        return {
          app,
          auth: getAuth(app),
          db: getFirestore(app),
          storage: getStorage(app),
        };
      })
      .catch(error => {
        servicesPromise = undefined;
        throw error;
      });
  }
  return servicesPromise;
}

export async function getFirebaseAdminAuth(): Promise<Auth> {
  return (await getFirebaseAdminServices()).auth;
}

export async function getFirebaseAdminFirestore(): Promise<Firestore> {
  return (await getFirebaseAdminServices()).db;
}

export async function getFirebaseAdminStorage(): Promise<Storage> {
  return (await getFirebaseAdminServices()).storage;
}
