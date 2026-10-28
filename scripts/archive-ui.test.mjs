import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const read = name => readFileSync('public/cormyr/' + name, 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function boot(fetchRegion) {
  const dom = new JSDOM(read('index.html'), { url: 'https://example.test/cormyr/index.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.fetch = (url) => url === '/api/public/catalog'
    ? Promise.resolve({ ok: true, json: async () => ({ houses: [], playerHouses: [] }) })
    : fetchRegion(url);
  w.eval(read('data.js'));
  w.eval(read('app.js'));
  return dom;
}

test('regional text loads only on request, remains escaped and reuses session cache', async () => {
  let calls = 0;
  const dom = boot(async () => { calls++; return { ok: true, json: async () => ({ text: '<script>alert(1)</script>\nTexto preservado.' }) }; });
  try {
    await settle();
    assert.equal(calls, 0);
    const d = dom.window.document, button = d.getElementById('region-read-more');
    button.click(); await settle();
    assert.equal(calls, 1);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(d.querySelector('#region-full-text script'), null);
    assert.ok(d.getElementById('region-full-text').textContent.includes('<script>alert(1)</script>'));
    button.click();
    assert.equal(d.getElementById('region-full-text').hidden, true);
    button.click(); await settle();
    assert.equal(calls, 1);
  } finally { dom.window.close(); }
});

test('failed regional text can be retried', async () => {
  let calls = 0;
  const dom = boot(async () => ({ ok: ++calls > 1, json: async () => ({ text: 'Texto recuperado.' }) }));
  try {
    await settle();
    const d = dom.window.document, button = d.getElementById('region-read-more');
    button.click(); await settle();
    assert.equal(button.textContent, 'Tentar novamente');
    assert.equal(button.disabled, false);
    button.click(); await settle();
    assert.equal(button.textContent, 'Ler menos');
    assert.ok(d.getElementById('region-full-text').textContent.includes('Texto recuperado.'));
  } finally { dom.window.close(); }
});

test('a late response never replaces the newly selected region', async () => {
  let finish;
  const dom = boot(() => new Promise(resolve => { finish = resolve; }));
  try {
    await settle();
    const d = dom.window.document;
    d.getElementById('region-read-more').click();
    const selector = d.getElementById('region-select');
    selector.value = 'Crownlands';
    selector.dispatchEvent(new dom.window.Event('change'));
    finish({ ok: true, json: async () => ({ text: 'Resposta antiga.' }) });
    await settle();
    assert.equal(d.getElementById('region-read-more').getAttribute('aria-expanded'), 'false');
    assert.ok(!d.getElementById('region-full-text').textContent.includes('Resposta antiga.'));
  } finally { dom.window.close(); }
});
