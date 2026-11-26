import {describe, expect, it, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {createFirebaseRestAuth, memoryStorage} from './firebase-rest-auth';
import {googleAuthFeedback} from './firebase-google-popup';
import {FirebaseGoogleSignIn} from '@/components/firebase/FirebaseGoogleSignIn';
import {firebaseAccountActionEnabled} from '@/lib/firebase-workspace/account-feature-gates';
import {createFirebaseAccountService} from '../../../scripts/firebase/cloud-account-service.mjs';

const snapshot = 'a'.repeat(64);

describe('Phase 2 · Google Sign-In & self-service account linking', () => {
  it('acceptExternalSession adopts popup credentials into the shared session and supports signOut', async () => {
    const refreshStorage = memoryStorage();
    const idStorage = memoryStorage();
    const seen: unknown[] = [];
    const auth = createFirebaseRestAuth({
      apiKey: 'test-key',
      storage: refreshStorage,
      idTokenStorage: idStorage,
      now: () => 10_000,
    });
    auth.subscribe(s => seen.push(s));

    const session = auth.acceptExternalSession({
      uid: 'uid-google-1',
      idToken: 'firebase-id-token-1',
      refreshToken: 'firebase-refresh-token-1',
      expiresIn: 3600,
    });
    expect(session).toEqual({
      uid: 'uid-google-1',
      idToken: 'firebase-id-token-1',
      expiresAt: 3_610_000,
    });
    expect(await auth.getToken()).toBe('firebase-id-token-1');
    expect(refreshStorage.get()).toBe('firebase-refresh-token-1');
    expect(seen.at(-1)).toEqual(session);

    auth.signOut();
    expect(auth.current()).toBeNull();
    expect(refreshStorage.get()).toBeNull();
    expect(idStorage.get()).toBeNull();
  });

  it('maps Google Auth error codes to clear Portuguese feedback', () => {
    expect(googleAuthFeedback('POPUP_BLOCKED')).toMatch(/pop-ups/i);
    expect(googleAuthFeedback('UNAUTHORIZED_DOMAIN')).toMatch(/domínio/i);
    expect(googleAuthFeedback('PROVIDER_DISABLED')).toMatch(/Firebase Console/i);
    expect(googleAuthFeedback('ACCOUNT_LINK_REQUIRED')).toMatch(/vincular/i);
    expect(googleAuthFeedback('CREDENTIAL_ALREADY_IN_USE')).toMatch(/outro usuário/i);
  });

  it('renders clickable Entrar com Google button backed by popup handler when no GSI Client ID is set', () => {
    const onPopupSignIn = vi.fn(async () => {});
    const onCredential = vi.fn(async () => {});
    render(<FirebaseGoogleSignIn onCredential={onCredential} onPopupSignIn={onPopupSignIn} />);
    const btn = screen.getByRole('button', {name: /Entrar com Google/i});
    fireEvent.click(btn);
    expect(onPopupSignIn).toHaveBeenCalledTimes(1);
  });

  it('gates googleStatus as read-only and prepareGoogleLink/unlinkGoogle behind write flag', () => {
    const readOnlyEnv = {
      CORMYR_FIREBASE_CLOUD_READ_ENABLED: 'true',
      CORMYR_FIREBASE_ACCOUNTS_READ_ENABLED: 'true',
      CORMYR_FIREBASE_ACCOUNTS_ENABLED: 'false',
    };
    expect(firebaseAccountActionEnabled('googleStatus', readOnlyEnv)).toBe(true);
    expect(firebaseAccountActionEnabled('prepareGoogleLink', readOnlyEnv)).toBe(false);
    expect(firebaseAccountActionEnabled('unlinkGoogle', readOnlyEnv)).toBe(false);

    const writeEnv = {...readOnlyEnv, CORMYR_FIREBASE_ACCOUNTS_ENABLED: 'true'};
    expect(firebaseAccountActionEnabled('prepareGoogleLink', writeEnv)).toBe(true);
    expect(firebaseAccountActionEnabled('unlinkGoogle', writeEnv)).toBe(true);
  });

  it('cloud-account-service googleStatus, prepareGoogleLink and unlinkGoogle enforce active scope and password safety', async () => {
    let providerData: Array<{providerId: string; email?: string}> = [
      {providerId: 'password', email: 'jogador@example.com'},
    ];
    let unlinkedProviders: string[] | null = null;
    const docs = new Map<string, Record<string, unknown>>([
      [`migrationDomainStage/${snapshot}`, {status: 'complete', private: true}],
      [`migrationAuthStage/${snapshot}`, {status: 'complete', private: true}],
      [
        `campaignCloudRuntime/${snapshot}`,
        {
          status: 'active',
          private: true,
          applicationEnabled: true,
          sourceSnapshotId: snapshot,
          sourceSnapshotReconciled: true,
        },
      ],
      [
        `migrationDomainStage/${snapshot}/access/uid-1`,
        {
          userId: 'uid-1',
          profile: 'jogador',
          active: true,
          admin: false,
          requirePasswordChange: false,
          playerId: 'player-1',
          memberHouseIds: ['ashkar'],
          editHouseIds: [],
          attrHouseIds: [],
        },
      ],
    ]);
    const node = (path: string) => ({
      collection: (name: string) => node(path ? `${path}/${name}` : name),
      doc: (id: string) => node(`${path}/${id}`),
      get: async () => {
        const v = docs.get(path);
        return {exists: v !== undefined, data: () => v};
      },
    });
    const db = {collection: (name: string) => node(name), runTransaction: async () => {}};
    const auth = {
      verifyIdToken: async () => ({uid: 'uid-1'}),
      getUser: async () => ({uid: 'uid-1', disabled: false, providerData}),
      createCustomToken: async (uid: string) => `custom-token-for-${uid}`,
      updateUser: async (_uid: string, patch: {providersToUnlink?: string[]}) => {
        unlinkedProviders = patch.providersToUnlink ?? null;
        providerData = providerData.filter(p => !(patch.providersToUnlink ?? []).includes(p.providerId));
      },
    };
    const svc = createFirebaseAccountService({
      db,
      auth,
      snapshotId: snapshot,
      enabled: true,
      projectId: 'cormyr',
      env: {},
    });

    const token = 'valid-bearer-token-1234';
    expect(await svc.googleStatus(token)).toEqual({
      linked: false,
      googleEmail: null,
      hasPassword: true,
    });

    expect(await svc.prepareGoogleLink(token)).toEqual({
      customToken: 'custom-token-for-uid-1',
    });

    // Simulate linked Google + password
    providerData = [
      {providerId: 'password', email: 'jogador@example.com'},
      {providerId: 'google.com', email: 'jogador@gmail.com'},
    ];
    expect(await svc.googleStatus(token)).toEqual({
      linked: true,
      googleEmail: 'jogador@gmail.com',
      hasPassword: true,
    });
    expect(await svc.unlinkGoogle(token)).toEqual({
      linked: false,
      googleEmail: null,
      hasPassword: true,
    });
    expect(unlinkedProviders).toEqual(['google.com']);

    // Refuse unlinking if user has NO password provider (prevents self-lockout)
    providerData = [{providerId: 'google.com', email: 'jogador@gmail.com'}];
    await expect(svc.unlinkGoogle(token)).rejects.toMatchObject({
      code: 'password_required_to_unlink',
      status: 409,
    });
  });
});
