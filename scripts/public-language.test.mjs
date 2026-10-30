import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const read = name => readFileSync('public/cormyr/' + name, 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function boot(initialLocale) {
  const dom = new JSDOM(read('index.html'), {
    url: 'https://example.test/cormyr/index.html',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  if (initialLocale) w.localStorage.setItem('cormyr-locale', initialLocale);
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.fetch = async url => {
    if (String(url).startsWith('/api/public/translations?locale=en')) {
      return { ok: true, json: async () => ({
        translations: {'region:Horselands:description':'The fertile lands of Horselands.'},
      }) };
    }
    return { ok:true, json:async () => ({houses:[],playerHouses:[]}) };
  };
  w.eval(read('language.js'));
  w.eval(read('data.js'));
  w.eval(read('app.js'));
  return dom;
}

test('public flags appear in the archive header and share locale with player area', async () => {
  const dom = boot('en');
  try {
    await settle();
    const d=dom.window.document;
    const controls=d.querySelectorAll('#public-language-switcher button[data-locale]');
    assert.equal(controls.length, 4);
    assert.deepEqual([...controls].map(b=>b.dataset.locale), ['pt','en','es','de']);
    assert.equal(d.documentElement.lang, 'en');
    assert.equal(d.querySelector('[data-view="reino"]').textContent, 'Kingdom and regions');
    assert.equal(d.querySelector('#public-language-switcher button[data-locale="en"]').getAttribute('aria-pressed'), 'true');
    assert.equal(d.querySelector('#region-content .region-description').textContent, 'The fertile lands of Horselands.');
    d.querySelector('#public-language-switcher button[data-locale="es"]').click();
    await settle();
    assert.equal(d.documentElement.lang, 'es');
    assert.equal(writtenLocale(dom), 'es');
    assert.equal(d.querySelector('[data-view="reino"]').textContent, 'Reino y regiones');
    d.querySelector('#public-language-switcher button[data-locale="pt"]').click();
    await settle();
    assert.equal(d.documentElement.lang, 'pt-BR');
    assert.equal(d.querySelector('[data-view="reino"]').textContent, 'Reino e regiões');
    assert.notEqual(d.querySelector('#region-content .region-description').textContent, 'The fertile lands of Horselands.');
  } finally { dom.window.close(); }
});

function writtenLocale(dom) { return dom.window.localStorage.getItem('cormyr-locale'); }

test('newly rendered public region views keep interface locale', async () => {
  const dom=boot('de');
  try {
    const d=dom.window.document;
    const select=d.getElementById('region-select');
    select.value='Crownlands';
    select.dispatchEvent(new dom.window.Event('change'));
    await settle();
    assert.equal(d.querySelector('[data-view="reino"]').textContent, 'Königreich und Regionen');
    assert.equal(d.documentElement.lang,'de');
    assert.ok(d.querySelector('#region-content .region-description').textContent.length>0);
  } finally { dom.window.close(); }
});
