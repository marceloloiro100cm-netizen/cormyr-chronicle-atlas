import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

async function freePort() {
  const socket=createServer();
  await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
  const address=socket.address();
  const port=address.port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}

async function boot({locked,port}) {
  const child=spawn(process.execPath,['scripts/apphosting/preview-server.mjs'],{
    env:{...process.env,PORT:String(port),CORMYR_PREVIEW_LOCKED:locked?'1':'0'},
    stdio:'ignore',
  });
  if(!locked) {
    await new Promise(resolve=>child.once('exit',resolve));
    return child;
  }
  const base='http://127.0.0.1:'+port;
  for(let n=0;n<80;n++){
    if(child.exitCode!==null)throw Error('Preview server exited before test');
    try {const r=await fetch(base+'/__health');if(r.ok)return {base,child};}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  child.kill();
  throw Error('Preview holding server did not listen');
}

test('locked preview has no live app routes, APIs, credentials, or static assets',async()=>{
  const port=await freePort();
  const {base,child}=await boot({locked:true,port});
  try{
    const home=await fetch(base+'/');
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-type'),/text\/html/);
    assert.match(home.headers.get('x-robots-tag'),/noindex/);
    assert.match(home.headers.get('cache-control'),/no-store/);
    assert.match(home.headers.get('content-security-policy'),/default-src 'none'/);
    const html=await home.text();
    assert.match(html,/O reino está preparando/);
    assert.doesNotMatch(html,/supabase\.co|sb_publishable_|\.env|auth\.users/i);
    const health=await fetch(base+'/__health');
    assert.equal((await health.json()).mode,'locked-preview');
    const rejectedPaths=[
      '/cormyr/index.html','/api/private','/admin','/assets/index.js',
      '/migrationDomainStage','/__data','/robots.txt',
    ];
    for(const path of rejectedPaths){
      const response=await fetch(base+path);
      assert.equal(response.status,404,path);
      assert.equal(await response.text(),'Not Found');
    }
    assert.equal((await fetch(base+'/',{method:'POST'})).status,404);
  }finally{
    child.kill('SIGTERM');
    await new Promise(resolve=>child.once('exit',resolve));
  }
});

test('preview server refuses startup if locked runtime flag is missing',async()=>{
  const child=await boot({locked:false,port:await freePort()});
  assert.notEqual(child.exitCode,0);
});
