import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {readOverlayRows, clearOverlayCache} from './operational-table-overlay';
import {cachedPublicRead, clearPublicCache} from '@/lib/server/public-cache.server';
import {createFirebaseCloudReadonly} from '../../../scripts/firebase/cloud-readonly-service.mjs';

const snapshot = 'a'.repeat(64);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

describe('Phase 1 Firebase & public cache optimizations', () => {
  it('readOverlayRows queries Firestore with where(table == ...) and caches read-only calls', async () => {
    let whereCalls = 0;
    let getCalls = 0;
    const docs = [
      {data: () => ({table: 'campaign_houses', key: 'h1', row: {id: 'h1', name: 'Ashkar'}, deleted: false})},
      {data: () => ({table: 'noble_house_gm_notes', key: 'h1', row: {house_id: 'h1', notes: 'secret'}, deleted: false})},
    ];
    const db = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: (field: string, op: string, value: string) => {
              whereCalls++;
              expect(field).toBe('table');
              expect(op).toBe('==');
              return {
                limit: () => ({
                  get: async () => {
                    getCalls++;
                    return {docs: docs.filter(d => d.data().table === value)};
                  },
                }),
              };
            },
          }),
        }),
      }),
    };

    const first = await readOverlayRows(db, snapshot, 'campaign_houses', {useCache: true});
    const second = await readOverlayRows(db, snapshot, 'campaign_houses', {useCache: true});
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(whereCalls).toBe(1);
    expect(getCalls).toBe(1);

    clearOverlayCache(db, snapshot, 'campaign_houses');
    await readOverlayRows(db, snapshot, 'campaign_houses', {useCache: true});
    expect(getCalls).toBe(2);
  });

  it('cachedPublicRead deduplicates concurrent reads, skips failed responses, and clears by prefix', async () => {
    clearPublicCache();
    let calls = 0;
    const [a, b] = await Promise.all([
      cachedPublicRead('public-time:test', 15_000, async () => {
        calls++;
        return {version: 1};
      }),
      cachedPublicRead('public-time:test', 15_000, async () => {
        calls++;
        return {version: 2};
      }),
    ]);
    expect(a).toEqual({version: 1});
    expect(b).toEqual({version: 1});
    expect(calls).toBe(1);

    clearPublicCache('public-time:');
    const c = await cachedPublicRead('public-time:test', 15_000, async () => {
      calls++;
      return {version: 3};
    });
    expect(c).toEqual({version: 3});
    expect(calls).toBe(2);

    let errCalls = 0;
    await expect(
      cachedPublicRead('public-err:test', 15_000, async () => {
        errCalls++;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const ok = await cachedPublicRead('public-err:test', 15_000, async () => {
      errCalls++;
      return {ok: true};
    });
    expect(ok).toEqual({ok: true});
    expect(errCalls).toBe(2);
  });

  it('cloud-readonly caches immutable stages and active season-2 houses when cacheImmutableStages=true', async () => {
    const readCounts = new Map<string, number>();
    const store = new Map<string, Record<string, unknown>>([
      [`migrationDomainStage/${snapshot}`, {status: 'complete', private: true}],
      [`migrationAuthStage/${snapshot}`, {status: 'complete', private: true}],
      [
        `migrationDomainStage/${snapshot}/access/user-1`,
        {
          userId: 'user-1',
          profile: 'jogador',
          active: true,
          admin: false,
          requirePasswordChange: false,
          playerId: 'player-1',
          memberHouseIds: ['house-a'],
          editHouseIds: [],
        },
      ],
      [
        `migrationDomainStage/${snapshot}/houses/${hash('house:house-a')}`,
        {sourceId: 'house-a', name: 'House A', active: true, season: 2},
      ],
    ]);
    const node = (path: string) => ({
      collection: (name: string) => node(path ? `${path}/${name}` : name),
      doc: (id: string) => node(`${path}/${id}`),
      get: async () => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        const val = store.get(path);
        return {exists: val !== undefined, data: () => val};
      },
    });
    const db = {collection: (name: string) => node(name)};
    const auth = {
      verifyIdToken: async () => ({uid: 'user-1'}),
      getUser: async () => ({uid: 'user-1', disabled: false}),
    };
    const svc = createFirebaseCloudReadonly({
      auth,
      db,
      snapshotId: snapshot,
      projectId: 'cormyr',
      enabled: true,
      env: {},
      cacheImmutableStages: true,
    });

    await svc.session('valid-token-123456');
    await svc.session('valid-token-123456');

    expect(readCounts.get(`migrationDomainStage/${snapshot}`)).toBe(1);
    expect(readCounts.get(`migrationAuthStage/${snapshot}`)).toBe(1);
    expect(readCounts.get(`migrationDomainStage/${snapshot}/houses/${hash('house:house-a')}`)).toBe(1);
    // Account access is ALWAYS read fresh to respect immediate revocations.
    expect(readCounts.get(`migrationDomainStage/${snapshot}/access/user-1`)).toBe(2);
  });
});
