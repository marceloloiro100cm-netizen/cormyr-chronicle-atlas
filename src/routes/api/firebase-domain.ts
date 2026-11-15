import {createFileRoute} from '@tanstack/react-router';
import {proxyFirebaseDomainRequest} from '@/integrations/backend/firebase-domain-proxy.server';

export const Route=createFileRoute('/api/firebase-domain')({
  server:{handlers:{
    POST:async({request})=>proxyFirebaseDomainRequest(request,{
      enabled:process.env['FIREBASE_DOMAIN_HOMOLOGATION_ENABLED']==='true',
      production:process.env['NODE_ENV']==='production',
      projectId:process.env['FIREBASE_PROJECT_ID'],
      firestoreEmulatorHost:process.env['FIRESTORE_EMULATOR_HOST'],
      authEmulatorHost:process.env['FIREBASE_AUTH_EMULATOR_HOST'],
      port:process.env['CORMYR_DOMAIN_PORT'],
    }),
  }},
});
