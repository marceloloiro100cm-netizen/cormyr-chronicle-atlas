import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_ROUTES,classifyCompiledRoute} from './firebase-compiled-runtime-smoke.mjs';

function response(status,type) {
  return new Response(null,{status,headers:{'content-type':type}});
}

test('the compiled runtime checks actual Firebase and existing SSR endpoint contracts',()=>{
  assert.deepEqual(EXPECTED_ROUTES.map(x=>x.path),[
    '/api/firebase-auth-verify','/api/public/translations',
    '/cormyr/index.html','/spy-portraits/tillet.jpg',
  ]);
  assert.equal(EXPECTED_ROUTES[0].status,503);
  assert.equal(EXPECTED_ROUTES[1].status,503);
});

test('Firebase homologation endpoint must be explicitly disabled in production',()=>{
  const auth=EXPECTED_ROUTES[0];
  assert.equal(classifyCompiledRoute(auth,response(503,'application/json; charset=utf-8')),true);
  assert.equal(classifyCompiledRoute(auth,response(404,'text/html')),false);
  assert.equal(classifyCompiledRoute(auth,response(200,'application/json')),false);
  assert.equal(classifyCompiledRoute(auth,response(401,'application/json')),false);
  assert.equal(classifyCompiledRoute(auth,response(503,'text/html')),false);
});

test('legacy public SSR route must be unavailable during archive-only cutover',()=>{
  const api=EXPECTED_ROUTES[1];
  assert.equal(classifyCompiledRoute(api,response(503,'application/json')),true);
  assert.equal(classifyCompiledRoute(api,response(400,'application/json')),false);
  assert.equal(classifyCompiledRoute(api,response(200,'text/html')),false);
  assert.equal(classifyCompiledRoute(api,response(404,'application/json')),false);
});

test('the compiled runtime reports static content types and not a generic HTML fallback',()=>{
  const html=EXPECTED_ROUTES[2],picture=EXPECTED_ROUTES[3];
  assert.equal(classifyCompiledRoute(html,response(200,'text/html; charset=utf-8')),true);
  assert.equal(classifyCompiledRoute(picture,response(200,'image/jpeg')),true);
  assert.equal(classifyCompiledRoute(picture,response(200,'text/html')),false);
  assert.equal(classifyCompiledRoute(html,response(301,'text/html')),false);
});
