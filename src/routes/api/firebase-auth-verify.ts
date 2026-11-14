import { createFileRoute } from '@tanstack/react-router';
import { verifyFirebaseHomologationRequest } from '@/integrations/auth/firebase-homologation-auth.server';

/** Public route name, but response requires a verified Firebase ID token. */
export const Route = createFileRoute('/api/firebase-auth-verify')({
  server: {
    handlers: {
      GET: async ({ request }) => verifyFirebaseHomologationRequest(request, {
        enabled: process.env['FIREBASE_AUTH_HOMOLOGATION_ENABLED'] === 'true',
        projectId: process.env['FIREBASE_PROJECT_ID'],
      }),
    },
  },
});
