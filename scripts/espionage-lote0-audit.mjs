/** Lote 0 — smoke test da matriz contra as fontes versionadas. Sem banco nem rede. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const matrix = JSON.parse(read('docs/espionage/lote-0-matriz-canonica.json'));
const catalog = JSON.parse(read('src/lib/house/prosperity-catalog.json'));
const audit = JSON.parse(read('src/lib/house/source-audit.json'));
const regions = read('src/lib/house/regions.ts');
assert.equal(matrix.schemaVersion, 1);
assert.equal(matrix.lifecycle, 'narrator_rules_amended_2026-11-02');
assert.equal(matrix.holdings.length, 12);
for (const frozen of matrix.holdings) {
  const original = catalog.find((item) => item.id === frozen.id);
  assert.ok(original, 'Posse não encontrada: ' + frozen.id);
  assert.deepEqual(frozen.costs, original.costs, 'Custo divergiu: ' + frozen.id);
  assert.deepEqual(frozen.durationInCatalog, original.duration, 'Prazo divergiu: ' + frozen.id);
  assert.equal(frozen.repeatable, original.repeatable, 'Repetição divergiu: ' + frozen.id);
}
assert.equal(matrix.geography.regions.length, 11);
for (const regionId of matrix.geography.regions) {
  assert.match(regions, new RegExp('^\\s*' + regionId + ':\\s*\\{', 'm'));
}
assert.deepEqual(matrix.geography.canonicalRouteEdges, [], 'Lote 0 não autoriza arestas sem fonte');
assert.equal(matrix.rules.baseSpyNetworkInitialCells, 1);
assert.equal(matrix.rules.contractor.enabledForQuote, true);
assert.equal(matrix.rules.contractor.hiringCostWealth, 5);
assert.equal(matrix.rules.contractor.agentsPerPurchase, 2);
assert.equal(matrix.rules.contractor.repeatable, true);
assert.equal(matrix.law.regionalCreationBonusIsEffectiveLaw, false);
assert.equal(matrix.law.player.approved, false);
assert.ok(matrix.approvalsRequired.length >= 10);
const action = audit.acoes.find((item) => item.original === 'Spy Cell Infiltration');
assert.ok(action, 'Ação de infiltração não encontrada na auditoria');
assert.match(action.regra, /Status \(Steward\).*dificuldade 9/i);
assert.equal(matrix.rules.spyCellInfiltration.difficulty, 9);
const sourceNetwork = audit.catalogo.Personage.find((item) => item.original === 'Spy Network');
assert.ok(sourceNetwork && sourceNetwork.tempo === null && sourceNetwork.incerteza);
assert.equal(matrix.holdings.find((item) => item.id === 'pros-spy-network').durationAuthority, 'reconstructed_unverified');
console.log('Lote 0 OK: 12 posses, 11 regiões, fontes conciliadas; sem células, tarifa, Lei ou rotas inventadas.');
