import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSql, inventory } from './firebase-inventory.mjs';

test('recognizes qualified, quoted and unqualified SQL declarations without line comments', () => {
  const result = inspectSql('-- CREATE TABLE secret(x int);\nCREATE TABLE IF NOT EXISTS "public"."letters"(id uuid); CREATE TABLE players(id uuid); CREATE OR REPLACE FUNCTION public.deliver() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;');
  assert.deepEqual(result.tables, ['players','public.letters']);
  assert.deepEqual(result.functions, ['public.deliver']);
});
test('inventory includes later modules and never represents source candidates as verified production', async () => {
  const result = await inventory(process.cwd());
  assert.equal(result.productionVerified, false);
  assert.ok(result.tables.includes('public.campaign_newspaper_staff'));
  assert.ok(result.dependencies.some(d => d.path === 'src/lib/house/drive-adapter.server.ts'));
  assert.ok(result.dependencies.every(d => d.matches.every(m => Object.keys(m).join(',') === 'line,kinds')));
});
