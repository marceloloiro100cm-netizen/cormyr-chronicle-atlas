import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Canonical chain cross-checked against the Horselands noble-house
// documents in Google Drive on 2026-11-01. A direct parent is not
// interchangeable with the region's ultimate Major House.
const parents = {
  Mantlepard: 'Phelles',
  Bryarn: 'Hartalan',
  Crakehall: 'Handragon',
  Dragonwood: 'Mantlepard',
  Erdenor: 'Yellander',
  Eveningspire: 'Mantlepard',
  Everet: 'Everlost',
  Everlost: 'Mantlepard',
  Greatgaunt: 'Mantlepard',
  Haelbroke: 'Mantlepard',
  Handragon: 'Dragonwood',
  Harcourt: 'Mantlepard',
  Hartalan: 'Mantlepard',
  Mistwind: 'Mantlepard',
  Silversky: 'Mantlepard',
  Stormserpent: 'Mantlepard',
  Vaeren: 'Mantlepard',
  Yellander: 'Mistwind',
};

const raw = readFileSync(new URL('../public/cormyr/data.js', import.meta.url), 'utf8');
const data = JSON.parse(raw.replace(/^window\.CORMYR_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const region = data.regions.find(region => region.name === 'Horselands');
const byName = new Map((region?.houses ?? []).map(house => [house.name, house]));

test('Horselands official roster has one Major House and all 18 documented houses', () => {
  assert.equal(region?.major, 'Mantlepard');
  assert.equal(region?.houses?.length, 18);
  assert.equal(byName.size, 18);
  assert.deepEqual([...byName.keys()].sort(), Object.keys(parents).sort());
  assert.equal(byName.get('Mantlepard')?.hierarchy?.kind, 'regional');
});

test('each Horselands house has the correct immediate liege', () => {
  for (const [name, parent] of Object.entries(parents)) {
    const hierarchy = byName.get(name)?.hierarchy;
    assert.equal(hierarchy?.parent, parent, name);
    assert.equal(hierarchy?.kind, name === 'Mantlepard' ? 'regional' : 'documented', name);
  }
});

test('all 17 subordinate houses reach Mantlepard without cycles or missing ancestors', () => {
  for (const name of byName.keys()) {
    if (name === 'Mantlepard') continue;
    let current = name;
    const seen = new Set();
    while (current !== 'Mantlepard') {
      assert.equal(seen.has(current), false, `Cycle in ${name}: ${current}`);
      seen.add(current);
      assert.ok(byName.has(current), `Missing ancestor ${current} of ${name}`);
      current = byName.get(current).hierarchy.parent;
      assert.ok(current !== 'Phelles', `Unexpected direct royal vassal: ${name}`);
      assert.ok(seen.size <= 18, `Excessive depth for ${name}`);
    }
  }
});
