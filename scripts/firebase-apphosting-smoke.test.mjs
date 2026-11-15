import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_ORIGIN, canonicalDomain, fetchSameOrigin,
  classifyResponse, smokeAppHosting,
} from './firebase-apphosting-smoke.mjs';

const html = () => new Response('<!doctype html><html></html>', {
  status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
});
const image = () => new Response('image-bytes', {
  status: 200, headers: { 'content-type': 'image/jpeg' },
});
const closed = () => new Response('{"error":"unavailable"}', {
  status: 503, headers: { 'content-type': 'application/json' },
});

test('only the exact official HTTPS origin is accepted', () => {
  assert.equal(canonicalDomain().origin, OFFICIAL_ORIGIN);
  for (const wrong of [
    'http://atlas.cormyr.com.br', 'https://evil.example',
    'https://atlas.cormyr.com.br.evil.test',
    'https://atlas.cormyr.com.br:444', 'https://atlas.cormyr.com.br/private',
    'https://user:password@atlas.cormyr.com.br',
  ]) {
    assert.throws(() => canonicalDomain(wrong), /official_https_origin_required/);
  }
});

test('same-origin redirects allowed; redirects to untrusted origins denied', async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push([url, options]);
    if (seen.length === 1) {
      return new Response(null, { status: 302, headers: { location: '/cormyr/index.html' } });
    }
    return html();
  };
  const response = await fetchSameOrigin('/', fetcher);
  assert.equal(response.status, 200);
  assert.equal(seen.length, 2);
  assert.equal(seen[1][0], OFFICIAL_ORIGIN + '/cormyr/index.html');
  assert.ok(seen.every(([, opts]) => opts.credentials === 'omit' &&
    opts.redirect === 'manual' && opts.method === 'GET'));
  let calls = 0;
  const unsafe = async () => {
    calls++;
    return new Response(null, { status: 302,
      headers: { location: 'https://different.example/capture' } });
  };
  await assert.rejects(fetchSameOrigin('/', unsafe), /cross_origin_redirect_blocked/);
  assert.equal(calls, 1);
});

test('validates media content type and requires closed Firebase auth gate', () => {
  assert.equal(classifyResponse('html', html()), true);
  assert.equal(classifyResponse('image', image()), true);
  assert.equal(classifyResponse('image', html()), false);
  assert.equal(classifyResponse('validationError', new Response('{"error":"Idioma inválido"}', {
    status: 400, headers: { 'content-type': 'application/json' },
  })), true);
  assert.equal(classifyResponse('validationError', new Response('Not Found', {
    status: 404, headers: { 'content-type': 'text/plain' },
  })), false);
  assert.equal(classifyResponse('closedGate', closed()), true);
  assert.equal(classifyResponse('closedGate', new Response('{}', {
    status: 401, headers: { 'content-type': 'application/json' },
  })), true);
  assert.equal(classifyResponse('closedGate', new Response('{"authenticated":true}', {
    status: 200, headers: { 'content-type': 'application/json' },
  })), false);
  assert.equal(classifyResponse('closedGate', html()), false);
});

test('valid deployment smoke never asserts database or Firebase cutover readiness', async () => {
  const paths = [];
  const fetcher = async (url, options) => {
    paths.push({ url, options });
    if (url.endsWith('/spy-portraits/tillet.jpg')) return image();
    if (url.endsWith('/api/public/translations')) return new Response('{}', {
      status: 400, headers: { 'content-type': 'application/json' },
    });
    if (url.endsWith('/api/firebase-auth-verify')) return closed();
    return html();
  };
  const result = await smokeAppHosting({ fetcher });
  assert.equal(result.publicationSmokePassed, true);
  assert.equal(result.firebaseCloudMigrationVerified, false);
  assert.equal(result.readyForCutover, false);
  assert.equal(result.serverRoutesPublished, true);
  assert.equal(result.checks.length, 5);
  assert.ok(paths.every(({ options }) => !Object.keys(options.headers).some(k =>
    k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie')));
});

test('unavailable DNS or failed HTTP cannot falsely pass the publication gate', async () => {
  const result = await smokeAppHosting({
    fetcher: async () => { throw new Error('private token details or DNS error'); },
  });
  assert.equal(result.publicationSmokePassed, false);
  assert.ok(result.checks.every(c =>
    c.reason === 'transport_unavailable' && c.status === null));
  assert.ok(!JSON.stringify(result).includes('private token details'));
  assert.equal(result.readyForCutover, false);
});
