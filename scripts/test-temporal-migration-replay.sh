#!/usr/bin/env bash
# Lote 16 — reexecução DIAGNÓSTICA no PostgreSQL DESCARTÁVEL do GitHub CI.
# Cada migração usa banco CLONADO e DESCARTADO, jamais a fonte.
# NÃO é prova de que reaplicar SQL será seguro no Supabase real.
set -euo pipefail
shopt -s nullglob

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

bootstrap_check="$(psql -XAtq -v ON_ERROR_STOP=1 -d mail_test \
  -c "SELECT current_database() || ':' || current_user || ':' ||
  CASE WHEN to_regclass('auth.users') IS NOT NULL AND
  to_regclass('public.campaign_time_operations') IS NOT NULL
  THEN 'seeded' ELSE 'missing' END")"
if [[ "$bootstrap_check" != "mail_test:postgres:seeded" ]]; then
  echo "BLOQUEADO: fixture descartável não reconhecida." >&2
  exit 2
fi

# Assinaturas agregadas para demonstrar que a base-fonte não mudou.
# O cliente pg_dump recente usa tokens aleatórios em \restrict/\unrestrict;
# normalizá-los evita falsos alarmes na comparação sem remover dados SQL.
dump_hash() {
  pg_dump -d "$1" "$2" --no-owner --no-acl |
    sed -E '/^\\(un)?restrict [[:alnum:]]+$/d' |
    sha256sum | cut -d ' ' -f 1
}

source_schema_before="$(dump_hash mail_test --schema-only)"
source_data_before="$(dump_hash mail_test --data-only)"

work="$(mktemp -d "$RUNNER_TEMP/cormyr-replay.XXXXXXXX")"
active_clone=""
cleanup() {
  if [[ -n "$active_clone" ]]; then
    psql -X -q -v ON_ERROR_STOP=1 -d postgres \
      -c "DROP DATABASE IF EXISTS $active_clone WITH (FORCE)" >/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

results="$work/results.tsv"
printf "migration\treplay_exit\tschema_changed\tdata_changed\n" > "$results"
count=0
for prefix in 0060 0061 0062 0063 0064 0065 0066 0067; do
  set -- drizzle/migrations/"$prefix"_*.sql
  if [[ "$#" -ne 1 ]]; then
    echo "BLOQUEADO: $prefix exige exatamente um SQL." >&2
    exit 2
  fi
  file="$1"
  active_clone="cormyr_replay_$prefix"
  psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -c "CREATE DATABASE $active_clone TEMPLATE mail_test" >/dev/null

  schema_before="$(dump_hash "$active_clone" --schema-only)"
  data_before="$(dump_hash "$active_clone" --data-only)"

  replay_exit=0
  if ! psql -X -q -v ON_ERROR_STOP=1 -d "$active_clone" -f "$file" \
    > "$work/$prefix.stdout" 2> "$work/$prefix.stderr"; then
    replay_exit=1
  fi
  schema_after="$(dump_hash "$active_clone" --schema-only)"
  data_after="$(dump_hash "$active_clone" --data-only)"

  schema_changed=false
  data_changed=false
  [[ "$schema_before" == "$schema_after" ]] || schema_changed=true
  [[ "$data_before" == "$data_after" ]] || data_changed=true
  printf "%s\t%s\t%s\t%s\n" "$file" "$replay_exit" "$schema_changed" "$data_changed" >> "$results"

  psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE $active_clone WITH (FORCE)" >/dev/null
  active_clone=""
  count=$((count + 1))
done

[[ "$count" == 8 ]] || { echo "BLOQUEADO: ensaio incompleto." >&2; exit 2; }
source_schema_after="$(dump_hash mail_test --schema-only)"
source_data_after="$(dump_hash mail_test --data-only)"
if [[ "$source_schema_before" != "$source_schema_after" ||
      "$source_data_before" != "$source_data_after" ]]; then
  echo "BLOQUEADO: a base-fonte mudou durante o ensaio." >&2
  exit 2
fi

python3 - "$results" "$RUNNER_TEMP/cormyr-replay-report.json" "$GITHUB_STEP_SUMMARY" <<'PY'
import csv, json, sys
with open(sys.argv[1], newline='', encoding='utf8') as f:
    items = list(csv.DictReader(f, delimiter='\t'))
if len(items) != 8:
    raise SystemExit('Rehearsal missing migration results')
out = {
    'format_version': 1,
    'database': 'ephemeral-ci-clones',
    'source_database_unchanged': True,
    'production_database_touched': False,
    'production_replay_safe': None,
    'ready_for_deploy': False,
    'complete': True,
    'probes': [
        {
            'migration': x['migration'],
            'replay_succeeded_on_scratch_copy': x['replay_exit'] == '0',
            'schema_changed_in_copy': x['schema_changed'] == 'true',
            'data_changed_in_copy': x['data_changed'] == 'true',
        } for x in items
    ],
}
with open(sys.argv[2], 'w', encoding='utf8') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
succeeded = sum(p['replay_succeeded_on_scratch_copy'] for p in out['probes'])
schema = sum(p['schema_changed_in_copy'] for p in out['probes'])
data = sum(p['data_changed_in_copy'] for p in out['probes'])
summary = (
    '\n### Hub Temporal — ensaio isolado de reaplicação\n'
    f'8 clones descartáveis; {succeeded} reaplicações sem erro; '
    f'{schema} alterações de esquema e {data} alterações de dados detectadas '
    'nas cópias. **Não autoriza reaplicação ou deploy.**\n'
)
summary += '\n| Migração | Replay no clone | Esquema alterado | Dados alterados |\n'
summary += '|---|---|---|---|\n'
for probe in out['probes']:
    name = probe['migration'].rsplit('/', 1)[-1]
    status = 'Sem erro' if probe['replay_succeeded_on_scratch_copy'] else 'Falhou'
    schema_status = 'Sim' if probe['schema_changed_in_copy'] else 'Não'
    data_status = 'Sim' if probe['data_changed_in_copy'] else 'Não'
    summary += f'| ' + name + f' | {status} | {schema_status} | {data_status} |\n'
with open(sys.argv[3], 'a', encoding='utf8') as f:
    f.write(summary)
print(summary.strip())
PY
