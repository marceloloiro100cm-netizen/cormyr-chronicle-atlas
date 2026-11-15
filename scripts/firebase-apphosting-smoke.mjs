/**
 * Read-only smoke test for the official Firebase App Hosting domain.
 * Checks publication, assets and closed Firebase homologation gates.
 * Does not authenticate, write data, or claim Firebase cutover readiness.
 */
import { pathToFileURL } from 'node:url';

export const OFFICIAL_ORIGIN = 'https://atlas.cormyr.com.br';
const CHECKS = [
  { name: 'staticAtlas', path: '/cormyr/index.html', kind: 'html' },
  { name: 'loginPage', path: '/auth', kind: 'html' },
  { name: 'spyPortrait', path: '/spy-portraits/tillet.jpg', kind: 'image' },
  { name: 'firebaseAuthGate', path: '/api/firebase-auth-verify', kind: 'closedGate' },
];
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export function canonicalDomain(origin = OFFICIAL_ORIGIN) {
  const u = new URL(origin);
  if (u.href !== OFFICIAL_ORIGIN + '/' || u.username || u.password) {
    throw new Error('official_https_origin_required');
  }
  return u;
}

export async function fetchSameOrigin(url, fetcher = fetch, timeoutMs = 10000) {
  const official = canonicalDomain();
  let target = new URL(url, official);
  for (let hops = 0; hops <= 4; hops++) {
    if (target.origin !== official.origin) {
      throw new Error('cross_origin_redirect_blocked');
    }
    const response = await fetcher(target.href, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!REDIRECTS.has(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('missing_redirect_location');
    target = new URL(location, target);
  }
  throw new Error('too_many_redirects');
}

export function classifyResponse(kind, response) {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (kind === 'html') {
    return response.status === 200 && contentType.startsWith('text/html');
  }
  if (kind === 'image') {
    return response.status === 200 && contentType.startsWith('image/');
  }
  // Disabled/unauthenticated by default: a 200 here is never proof of safety.
  // Both 401 (denied) and 503 (explicitly disabled) are acceptable.
  if (kind === 'closedGate') {
    return (response.status === 401 || response.status === 503) &&
      contentType.startsWith('application/json');
  }
  return false;
}

export async function smokeAppHosting({ fetcher = fetch } = {}) {
  const checks = [];
  for (const check of CHECKS) {
    try {
      const response = await fetchSameOrigin(check.path, fetcher);
      checks.push({
        name: check.name, status: response.status,
        passed: classifyResponse(check.kind, response),
      });
    } catch (error) {
      const reason = error instanceof Error && [
        'cross_origin_redirect_blocked', 'missing_redirect_location', 'too_many_redirects',
      ].includes(error.message) ? error.message : 'transport_unavailable';
      checks.push({ name: check.name, status: null, passed: false, reason });
    }
  }
  return {
    origin: OFFICIAL_ORIGIN,
    publicationSmokePassed: checks.every(c => c.passed),
    firebaseCloudMigrationVerified: false,
    readyForCutover: false,
    checks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await smokeAppHosting();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.publicationSmokePassed) process.exitCode = 1;
}
