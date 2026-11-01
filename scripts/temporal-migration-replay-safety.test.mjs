import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const shell=readFileSync(resolve(root,'scripts/test-temporal-migration-replay.sh'),'utf8');
const targets=['0060','0061','0062','0063','0064','0065','0066','0067'];

describe('Lote 16 · ensaio seguro de migrações em banco de CI descartável',()=>{
 it('possui exatamente oito fontes temporais e cada prefixo é único',()=>{
  const sqls=readdirSync(resolve(root,'drizzle/migrations')).filter(f=>f.endsWith('.sql'));
  for(const prefix of targets)
   assert.equal(sqls.filter(f=>f.startsWith(prefix+'_')).length,1,prefix);
  assert.match(shell,/for prefix in 0060 0061 0062 0063 0064 0065 0066 0067;/);
 });
 it('não habilita execução fora da fixture efêmera reconhecida',()=>{
  for(const guard of [
   'GITHUB_ACTIONS','TEMPORAL_DISPOSABLE_POSTGRES','PGHOST',
   'PGDATABASE','PGPASSWORD','PGUSER','PGPORT',
  ])assert.ok(shell.includes('$'+guard),guard);
  assert.ok(shell.includes('mail_test:postgres:seeded'));
  assert.match(shell,/if \[\[ "\$GITHUB_ACTIONS" != "true"/);
  assert.ok(!shell.includes('LOVABLE_DB_MIGRATION_URL'));
  assert.ok(!shell.includes('CORMYR_AUDIT_DATABASE_URL'));
 });
 it('usa clones nomeados e descartados, preservando a base de origem',()=>{
  assert.match(shell,/CREATE DATABASE \$active_clone TEMPLATE mail_test/);
  assert.match(shell,/DROP DATABASE \$active_clone WITH \(FORCE\)/);
  assert.match(shell,/trap cleanup EXIT INT TERM/);
  assert.match(shell,/dump_hash\(\)/);
  assert.match(shell,/un\)\?restrict/);
  assert.match(shell,/source_schema_before=/);
  assert.match(shell,/source_schema_after=/);
  assert.match(shell,/source_data_before=/);
  assert.match(shell,/source_data_after=/);
  assert.match(shell,/source_schema_before" != "\$source_schema_after/);
  assert.match(shell,/source_data_before" != "\$source_data_after/);
  assert.ok(!shell.includes('psql -d mail_test -f'));
  assert.ok(!shell.includes('drizzle-kit migrate'));
 });
 it('assinala downgrade real se a migração 0066 for reaplicada depois da 0067',()=>{
  const old=readFileSync(resolve(root,
   'drizzle/migrations/0066_temporal_consumer_outbox.sql'),'utf8');
  const current=readFileSync(resolve(root,
   'drizzle/migrations/0067_temporal_release_preflight.sql'),'utf8');
  assert.match(old,/WHEN 'season' THEN from_season<>to_season/);
  assert.match(current,/WHEN 'season' THEN season_crossings>0/);
  assert.match(shell,/season_fix_state\(\)/);
  assert.match(shell,/season_fix_state mail_test/);
  assert.match(shell,/season_fix_regressed_in_copy/);
 });
 it('indica resultados como diagnóstico e nunca certifica replay produtivo',()=>{
  assert.match(shell,/'production_replay_safe': None/);
  assert.match(shell,/'ready_for_deploy': False/);
  assert.match(shell,/'production_database_touched': False/);
  assert.match(shell,/'complete': True/);
  assert.match(shell,/replay_succeeded_on_scratch_copy/);
  assert.match(shell,/schema_changed_in_copy/);
  assert.match(shell,/data_changed_in_copy/);
 });
});
