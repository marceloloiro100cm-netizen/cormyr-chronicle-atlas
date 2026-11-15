import { createFileRoute } from '@tanstack/react-router';
import { verifyFirebaseHomologationRequest } from '@/integrations/auth/firebase-homologation-auth.server';
import { proxyFirebaseDomainRequest } from '@/integrations/backend/firebase-domain-proxy.server';

/**
 * Local Auth Emulator tokens are unsigned: they must NEVER be validated by
 * Google's production JWT verifier. The local gateway checks them using
 * Firebase Admin SDK only when the fixed demo project is explicitly selected.
 */
export const Route = createFileRoute('/api/firebase-auth-verify')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const useLocal = process.env['NODE_ENV'] !== 'production' &&
          process.env['FIREBASE_DOMAIN_HOMOLOGATION_ENABLED'] === 'true' &&
          process.env['FIREBASE_PROJECT_ID'] === 'demo-cormyr-migration';
        if (useLocal) {
          return proxyFirebaseDomainRequest(request, {
            enabled: process.env['FIREBASE_AUTH_HOMOLOGATION_ENABLED'] === 'true',
            production: process.env['NODE_ENV'] === 'production',
            projectId: process.env['FIREBASE_PROJECT_ID'],
            firestoreEmulatorHost: process.env['FIRESTORE_EMULATOR_HOST'],
            authEmulatorHost: process.env['FIREBASE_AUTH_EMULATOR_HOST'],
            port: process.env['CORMYR_DOMAIN_PORT'],
          }, 'identity');
        }
        return verifyFirebaseHomologationRequest(request, {
          enabled: process.env['FIREBASE_AUTH_HOMOLOGATION_ENABLED'] === 'true',
          projectId: process.env['FIREBASE_PROJECT_ID'],
        });
      },
    },
  },
});
