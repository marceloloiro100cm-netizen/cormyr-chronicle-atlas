/**
 * Smoke test for the separate Cloud Run/Nitro SSR build.
 * Uses only localhost; does not contact Firebase, change production or send credentials.
 */
import { access, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const SERVER = resolve(ROOT, '.output/server/index.mjs');
const PUBLIC = resolve(ROOT, '.output/public');

async function checkFiles() {
  await access(SERVER);
  if (!(await stat(PUBLIC)).isDirectory()) throw new Error('Nitro public output missing');
}

export async function testServer(port = 48619) {
  await checkFiles();
  const server = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
      NITRO_PORT: String(port), NITRO_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  for (const output of [server.stdout, server.stderr]) {
    output.on('data', chunk => { logs = (logs + chunk.toString()).slice(-1200); });
  }
  try {
    let lastError;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) {
        throw new Error('Nitro exited early (code ' + server.exitCode + '): ' + logs);
      }
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/', {
          signal: AbortSignal.timeout(3000), redirect: 'manual',
        });
        if (response.status < 200 || response.status >= 400) {
          throw new Error('SSR root returned HTTP ' + response.status);
        }
        const type = response.headers.get('content-type') || '';
        if (!type.includes('text/html')) throw new Error('SSR root did not return HTML');
        console.log(JSON.stringify({ outputPresent: true, ssrStatus: response.status,
          htmlResponse: true, externalBackendTested: false, productionChanged: false }));
        return;
      } catch (error) {
        lastError = error;
        if (error.message?.includes('SSR root') || error.message?.includes('did not return HTML')) throw error;
      }
      await delay(500);
    }
    throw new Error('Nitro did not become ready: ' + String(lastError) + '\n' + logs);
  } finally {
    server.kill('SIGTERM');
    await Promise.race([new Promise(r => server.once('exit', r)), delay(2000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}

if (process.argv[1]?.endsWith('/verify-node-build.mjs')) {
  testServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}
