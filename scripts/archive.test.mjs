import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve('public/cormyr');
const source = readFileSync(resolve(root, 'data.js'), 'utf8');
const sandbox = { window: {} };
runInNewContext(source, sandbox, { timeout: 1000 });
const data = sandbox.window.CORMYR_DATA;
const local = (path) => {
  const file = resolve(root, path);
  assert.ok(file.startsWith(root + '/') || file.startsWith(root + '\\'));
  assert.ok(existsSync(file), 'Missing archive file: ' + path);
  return file;
};

test('archive preserves 11 regions, 172 unique houses and local references', () => {
  assert.equal(data.regions.length, 11);
  const houses = data.regions.flatMap(r => r.houses);
  assert.equal(houses.length, 172);
  assert.equal(new Set(houses.map(h => h.nobleId)).size, 172);
  for (const house of houses) {
    for (const key of ['crest', 'portrait', 'historyPath']) {
      if (house[key]) local(house[key]);
    }
  }
});

test('all regional texts are available on demand; initial data stays below 250 KB', () => {
  assert.ok(Buffer.byteLength(source) < 250_000);
  for (const region of data.regions) {
    assert.equal(region.fullText, undefined);
    const document = JSON.parse(readFileSync(local(region.fullTextPath), 'utf8'));
    assert.equal(typeof document.text, 'string');
    assert.ok(document.text.trim().length > 0);
  }
});

test('narrator events and adventures stay out of the public payload', () => {
  assert.equal(data.events.length, 0);
  assert.equal(data.adventures.length, 0);
});
