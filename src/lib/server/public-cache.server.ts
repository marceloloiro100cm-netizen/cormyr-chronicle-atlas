/**
 * Lightweight short-TTL in-memory server cache for approved public read
 * endpoints (/api/public/time, /api/public/newspaper, /api/public/catalog,
 * /api/public/calendar-events).
 *
 * Security & correctness invariants:
 * - Only stores already-validated public responses (never errors or private data).
 * - Deduplicates concurrent requests (in-flight promise sharing).
 * - Bounded map size to prevent unbounded memory growth.
 * - Explicitly invalidated on narrator/editor mutations.
 */
type CacheEntry = {at: number; value: Promise<unknown>};

const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = 200;

export function cachedPublicRead<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const promise = loader();
  const entry: CacheEntry = {at: now, value: promise};
  if (store.size >= MAX_ENTRIES) {
    for (const [k, v] of store) {
      if (now - v.at >= ttlMs) store.delete(k);
    }
    if (store.size >= MAX_ENTRIES) store.clear();
  }
  store.set(key, entry);
  promise.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return promise;
}

export function clearPublicCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
