#!/usr/bin/env bash
# Lote 18: backup/restore de fixture EFÊMERA, nunca do Supabase real.
# Os arquivos são apagados automaticamente após o teste.
set -euo pipefail
umask 077

# Falha por padrão se qualquer variável faltar ou estiver diferente.
if [[ "$GITHUB_ACTIONS" != "true" ||
      "$TEMPORAL_DISPOSABLE_POSTGRES" != "true" ||
      "$PGHOST" != "localhost" ||
      "$PGPORT" != "5432" ||
      "$PGUSER" != "postgres" ||
      "$PGDATABASE" != "mail_test" ||
      "$PGPASSWORD" != "isolated" ]]; then
  echo "BLOQUEADO: apenas PostgreSQL efêmero do CI." >&2
  exit 2
fi
[[ -n "$RUNNER_TEMP" && -n "$GITHUB_STEP_SUMMARY" ]] || exit 2
# Variáveis libpq podem redirecionar a conexão mesmo com PGHOST definido.
if [[ -n "${PGHOSTADDR:-}" || -n "${PGSERVICE:-}" || -n "${PGSERVICEFILE:-}" ||
      -n "${PGOPTIONS:-}" ]]; then
  echo "BLOQUEADO: configuração externa do libpq detectada." >&2
  exit 2
fi

fixture="$(psql -XAtq -v ON_ERROR_STOP=1 -d mail_test \
  -c "SELECT current_database()||':'||current_user||':'||
  CASE WHEN to_regclass('auth.users') IS NOT NULL AND
            to_regclass('public.campaign_time_operations') IS NOT NULL AND
            to_regclass('public.campaign_temporal_deliveries') IS NOT NULL AND
            to_regprocedure('public.get_public_campaign_time()') IS NOT NULL
       THEN 'ready' ELSE 'missing' END")"
if [[ "$fixture" != "mail_test:postgres:ready" ]]; then
  echo "BLOQUEADO: fixture de teste incompleta." >&2
  exit 2
fi

restore_db="cormyr_temporal_restore_18"
tmp="$(mktemp -d "$RUNNER_TEMP/temporal-restore.XXXXXXXX")"
created_by_test=false
cleanup() {
  if [[ "$created_by_test" == "true" ]]; then
    psql -X -q -v ON_ERROR_STOP=1 -d postgres \
      -c "DROP DATABASE IF EXISTS $restore_db WITH (FORCE)" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

# Nunca destruir um banco anterior para abrir espaço ao teste.
existing="$(psql -XAtq -v ON_ERROR_STOP=1 -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname='$restore_db'")"
if [[ "$existing" != "0" ]]; then
  echo "BLOQUEADO: destino já existe" >&2
  exit 2
fi

# Remove SOMENTE tokens aleatórios de pg_dump (\restrict/\unrestrict).
hash_dump() {
  pg_dump -d "$1" "$2" --no-owner --no-acl |
    sed -E '/^\\(un)?restrict [[:alnum:]]+$/d' |
    sha256sum | cut -d ' ' -f 1
}
schema_before="$(hash_dump mail_test --schema-only)"
data_before="$(hash_dump mail_test --data-only)"
clock_before="$(psql -XAtq -v ON_ERROR_STOP=1 -d mail_test \
  -c "SELECT public.get_public_campaign_time()::text")"

pg_dump -d mail_test -Fc --file="$tmp/fixture.backup"
pg_restore --list "$tmp/fixture.backup" > "$tmp/manifest.txt"
if [[ ! -s "$tmp/fixture.backup" || ! -s "$tmp/manifest.txt" ]]; then
  echo "BLOQUEADO: arquivo de backup inválido" >&2
  exit 2
fi

createdb --template=template0 "$restore_db"
created_by_test=true
pg_restore --exit-on-error --single-transaction --no-owner \
  --dbname="$restore_db" "$tmp/fixture.backup" \
  > "$tmp/restore.stdout" 2> "$tmp/restore.stderr" || {
    echo "BLOQUEADO: pg_restore falhou em clone efêmero." >&2
    exit 2
  }

schema_restored="$(hash_dump "$restore_db" --schema-only)"
data_restored="$(hash_dump "$restore_db" --data-only)"
clock_restored="$(psql -XAtq -v ON_ERROR_STOP=1 -d "$restore_db" \
  -c "SELECT public.get_public_campaign_time()::text")"
if [[ "$schema_before" != "$schema_restored" ||
      "$data_before" != "$data_restored" ||
      "$clock_before" != "$clock_restored" ]]; then
  echo "BLOQUEADO: schema, dados ou relógio divergiram na restauração." >&2
  exit 2
fi

# Validar segurança efetiva na cópia, em transação com rollback.
psql -X -q -v ON_ERROR_STOP=1 -d "$restore_db" \
  -f scripts/test-temporal-homologation-contracts.sql > "$tmp/rls.stdout" \
  2> "$tmp/rls.stderr" || {
    echo "BLOQUEADO: contratos RLS/RPC falharam na cópia restaurada." >&2
    exit 2
  }
season_fix="$(psql -XAtq -v ON_ERROR_STOP=1 -d "$restore_db" \
  -c "SELECT strpos(pg_get_functiondef(
   'public.enqueue_campaign_temporal_consumers()'::regprocedure),
   'season_crossings:=')>0")"
if [[ "$season_fix" != "t" ]]; then
  echo "BLOQUEADO: correção sazonal 0067 não foi preservada." >&2
  exit 2
fi

if [[ "$(hash_dump "$restore_db" --schema-only)" != "$schema_restored" ||
      "$(hash_dump "$restore_db" --data-only)" != "$data_restored" ]]; then
  echo "BLOQUEADO: testes de segurança alteraram a restauração." >&2
  exit 2
fi
if [[ "$(hash_dump mail_test --schema-only)" != "$schema_before" ||
      "$(hash_dump mail_test --data-only)" != "$data_before" ||
      "$(psql -XAtq -v ON_ERROR_STOP=1 -d mail_test \
       -c "SELECT public.get_public_campaign_time()::text")" != "$clock_before" ]]; then
  echo "BLOQUEADO: origem foi alterada durante o ensaio." >&2
  exit 2
fi

python3 - "$RUNNER_TEMP/temporal-restore-drill.json" "$GITHUB_STEP_SUMMARY" <<'PY'
import json, sys
report = {
    "format_version": 1, "kind": "disposable_postgres_fixture_restore",
    "source": "mail_test", "destination": "cormyr_temporal_restore_18",
    "archive_format": "pg_dump_custom", "restore_transactional": True,
    "schema_equivalent": True, "data_equivalent": True,
    "canonical_clock_preserved": True, "security_contracts_passed": True,
    "season_fix_preserved": True, "source_unchanged": True,
    "production_backup_restored": False,
    "real_user_data_examined": False,
    "drizzle_history_reconciled": False,
    "production_release_authorized": False,
}
with open(sys.argv[1], 'w', encoding='utf8') as out:
    json.dump(report, out, indent=2, ensure_ascii=False)
with open(sys.argv[2], 'a', encoding='utf8') as summary:
    summary.write(
        "\n### Hub Temporal — restauração em PostgreSQL descartável\n"
        "Backup custom, restauração transacional, esquema, dados, relógio, "
        "RLS, permissões e regra sazonal: **aprovados**. "
        "**Backup de produção não usado. NO_GO para implantação.**\n"
    )
print('Restauração de fixture descartável validada, sem dados reais.')
PY
