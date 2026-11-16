import {createFileRoute} from '@tanstack/react-router';
import {createCloudMailHttpHandler} from '../../../scripts/firebase/cloud-mail-http-handler.mjs';
import {createCloudMailService} from '../../../scripts/firebase/cloud-mail-service.mjs';

/**
 * Firebase CLOUD ONLY: delivered mail on a separate campaign runtime.
 *
 * Historical migration stages are immutable. Both an explicit environment
 * feature gate and a reconciled, activated Firestore runtime are required.
 * Server IAM comes from App Hosting's service account, never a JSON key.
 */
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const enabled=process.env['CORMYR_FIREBASE_CLOUD_MAIL_WRITE_ENABLED']==='true'&&
    /^[a-f0-9]{64}$/.test(snapshotId)&&
    !process.env['FIRESTORE_EMULATOR_HOST']&&
    !process.env['FIREBASE_AUTH_EMULATOR_HOST'];

  const handler=createCloudMailHttpHandler({
    enabled,
    service:{
      async send(token:string,payload:unknown){
        // Loading Firebase Admin only occurs after authentication header,
        // method, origin and bounded JSON have passed the HTTP boundary.
        const [{initializeApp,getApps,applicationDefault},
          {getAuth},{getFirestore}]=await Promise.all([
          import('firebase-admin/app'),
          import('firebase-admin/auth'),
          import('firebase-admin/firestore'),
        ]);
        const name='cormyr-cloud-mail';
        const app=getApps().find(a=>a.name===name)??initializeApp({
          projectId:'cormyr',credential:applicationDefault(),
        },name);
        return createCloudMailService({
          auth:getAuth(app),db:getFirestore(app),snapshotId,
          projectId:'cormyr',enabled:true,
        }).send(token,payload);
      },
    },
  });
  return handler(request);
}

export const Route=createFileRoute('/api/firebase-cloud-mail')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
