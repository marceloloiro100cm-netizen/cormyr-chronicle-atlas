import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=readFileSync(resolve(new URL('../scripts/test-temporal-restore-drill.sh',
 import.meta.url).pathname),'utf8');

describe('Lote 18 — backup e restauração exclusiva de fixture descartável',()=>{
 it('bloqueia uso fora da conexão efêmera e variáveis de redirecionamento libpq',()=>{
  for(const env of ['GITHUB_ACTIONS','TEMPORAL_DISPOSABLE_POSTGRES','PGHOST',
   'PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGHOSTADDR','PGSERVICE',
   'PGSERVICEFILE','PGOPTIONS'])
    assert.ok(source.includes(env),env);
  assert.match(source,/mail_test:postgres:ready/);
  assert.match(source,/BLOQUEADO: apenas PostgreSQL efêmero do CI/);
  assert.ok(!source.includes('CORMYR_AUDIT_DATABASE_URL'));
  assert.ok(!source.includes('LOVABLE_DB_MIGRATION_URL'));
 });
 it('recusa apagar banco preexistente e só remove banco criado no ensaio',()=>{
  assert.match(source,/SELECT count\(\*\) FROM pg_database WHERE datname/);
  assert.match(source,/created_by_test=false/);
  assert.match(source,/createdb --template=template0 "\$restore_db"/);
  assert.match(source,/created_by_test=true/);
  assert.match(source,/if \[\[ "\$created_by_test" == "true" \]\]/);
  assert.match(source,/trap cleanup EXIT/);
  assert.match(source,/rm -rf "\$tmp"/);
  assert.ok(!source.includes('DROP DATABASE mail_test'));
 });
 it('gera arquivo temporário e restaura transacionalmente o mesmo dump',()=>{
  assert.match(source,/pg16_client pg_dump -d mail_test -Fc/);
  assert.match(source,/pg16_client pg_restore --list/);
  assert.match(source,/docker run --rm -i --network host/);
  assert.match(source,/postgres:16 "\$@"/);
  assert.match(source,/pg_restore --list/);
  assert.match(source,/pg_restore --exit-on-error --single-transaction --no-owner/);
  assert.match(source,/pg_restore.*--dbname="\$restore_db"/s);
  assert.ok(!source.includes('--clean'));
  assert.ok(!source.includes('drizzle-kit migrate'));
  assert.ok(!source.includes('drizzle.__drizzle_migrations'));
 });
 it('compara fonte, restauração e persistência do rollback de testes',()=>{
  for(const marker of ['schema_before','data_before','clock_before','schema_restored',
   'data_restored','clock_restored','season_fix','--schema-only','--data-only'])
   assert.ok(source.includes(marker),marker);
  assert.match(source,/scripts\/test-temporal-homologation-contracts.sql/);
  assert.match(source,/hash_dump mail_test --schema-only/);
  assert.match(source,/hash_dump mail_test --data-only/);
  assert.match(source,/testes de segurança alteraram a restauração/);
 });
 it('nunca atribui a uma restauração de fixture o status de backup real',()=>{
  assert.match(source,/"production_backup_restored": False/);
  assert.match(source,/"real_user_data_examined": False/);
  assert.match(source,/"drizzle_history_reconciled": False/);
  assert.match(source,/"production_release_authorized": False/);
  assert.match(source,/NO_GO para implantação/);
 });
});
