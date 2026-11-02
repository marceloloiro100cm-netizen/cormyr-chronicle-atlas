/** Executado pelo workflow Validate: node --test scripts/*.test.mjs */
import test from 'node:test';

test('Espionagem Lote 0: matriz fiel ao catálogo e pendências preservadas', async () => {
  await import('./espionage-lote0-audit.mjs');
});
