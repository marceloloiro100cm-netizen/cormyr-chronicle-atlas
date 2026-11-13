/**
 * Public Firebase App Hosting preview holding server.
 *
 * DO NOT PROXY TO THE CORMYR APP HERE: the current app still contains
 * live legacy Supabase/Lovable API configuration and the Firebase migration
 * has not yet reached cloud Auth/Firestore. This entrypoint intentionally
 * serves no application routes or static assets.
 *
 * No credentials, snapshots, letters, or backend connections are loaded.
 */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

const port=Number(process.env.PORT || 8080);
if (!Number.isSafeInteger(port)||port<1||port>65535) {
  throw new Error('Invalid App Hosting PORT');
}
if (process.env.CORMYR_PREVIEW_LOCKED !== '1') {
  // Missing configuration is NOT permission to serve the original app.
  throw new Error('Preview gate not configured. Refusing to start.');
}
const html=readFileSync(new URL('./holding-page.html',import.meta.url));
const securityHeaders={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
};
const server=createServer((req,res)=>{
  const method=req.method || '';
  const path=(req.url || '').split('?')[0];
  if(path==='/__health'&&(method==='GET'||method==='HEAD')){
    res.writeHead(200,{...securityHeaders,'Content-Type':'application/json; charset=utf-8'});
    res.end(method==='HEAD'?undefined:'{"status":"ready","mode":"locked-preview"}');
    return;
  }
  if(path==='/'&&(method==='GET'||method==='HEAD')){
    res.writeHead(200,{...securityHeaders,'Content-Type':'text/html; charset=utf-8'});
    res.end(method==='HEAD'?undefined:html);
    return;
  }
  res.writeHead(404,{...securityHeaders,'Content-Type':'text/plain; charset=utf-8'});
  res.end(method==='HEAD'?undefined:'Not Found');
});
server.requestTimeout=10_000;
server.headersTimeout=10_000;
server.listen(port,'0.0.0.0',()=>{
  console.info('Cormyr preview holding server listening; data routes disabled.');
});
