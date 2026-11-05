#!/usr/bin/env bash
# Mandatory scope: disposable PostgreSQL container in GitHub Actions.
# This is a backup/restore DRILL, not a backup of the real campaign database.
set -euo pipefail
if [[ "${BATTLE_DISPOSABLE_POSTGRES:-}" != "true" ||
      "${CI:-}" != "true" ||
      "${PGHOST:-}" != "localhost" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "battle_test" ||
      "${PGUSER:-}" != "postgres" ]]; then
  echo "REFUSED: battle restore drill requires isolated GitHub CI PostgreSQL." >&2
  exit 2
fi
for cmd in psql pg_dump pg_restore createdb dropdb; do
  command -v "$cmd" >/dev/null || { echo "Missing PostgreSQL client: $cmd" >&2; exit 1; }
done
RESTORE_DB="battle_restore_test"
BACKUP_DIR="$(mktemp -d)"
SESSION_ID=""
cleanup() {
  dropdb --if-exists --force "$RESTORE_DB" >/dev/null 2>&1 || true
  if [[ -n "$SESSION_ID" ]]; then
    psql -X -q -v ON_ERROR_STOP=1 -c "
      DELETE FROM public.battle_sim_events WHERE session_id='$SESSION_ID'::uuid;
      DELETE FROM public.battle_sim_sessions WHERE id='$SESSION_ID'::uuid;" >/dev/null 2>&1 || true
  fi
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.battle_sim_sessions")" != "0" ]]; then
  echo "Refusing restore drill in a populated database" >&2
  exit 2
fi
SESSION_ID="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE service_role;
SELECT public.battle_sim_commit_replay(
 '11111111-1111-4111-8111-111111111111',
 'Battle-backup-restore-CI-fixture',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}'::jsonb,
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('a',64),'[]'::jsonb);
SQL
)"
if [[ ! "$SESSION_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Failed to seed battle restore fixture" >&2
  exit 1
fi
psql -X -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
SET ROLE service_role;
SELECT public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111','$SESSION_ID'::uuid,
 0,'55555555-5555-4555-8555-555555555555',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
 'prevHash',repeat('a',64),'stateHash',repeat('b',64),
 'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('b',64));
SQL
# Dump the entire disposable DB to preserve functions, policies, RLS and grants.
pg_dump -Fc --no-owner -f "$BACKUP_DIR/battle_test.backup" "$PGDATABASE"
createdb -T template0 "$RESTORE_DB"
# Hosted runners may ship pg_dump/pg_restore 17 while the isolated server is PG16.
# Restore SQL is generated from the custom archive and the lone PG17-only
# transaction_timeout statement is omitted for compatibility with PG16.
pg_restore --no-owner --file="$BACKUP_DIR/battle_restore.sql" "$BACKUP_DIR/battle_test.backup"
sed -i '/^SET transaction_timeout = 0;$/d' "$BACKUP_DIR/battle_restore.sql"
psql -X -v ON_ERROR_STOP=1 -d "$RESTORE_DB" -f "$BACKUP_DIR/battle_restore.sql" >/dev/null
PGDATABASE="$RESTORE_DB" psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $assert$
DECLARE v_session uuid;
BEGIN
 IF (SELECT count(*) FROM public.battle_sim_sessions)<>1
   OR (SELECT count(*) FROM public.battle_sim_events)<>1
   OR (SELECT count(*) FROM public.battle_sim_scenarios)<>0
 THEN RAISE EXCEPTION 'Restored rows diverge'; END IF;
 SELECT id INTO v_session FROM public.battle_sim_sessions
 WHERE name='Battle-backup-restore-CI-fixture'
   AND state_version=1
   AND state_hash=repeat('b',64)
   AND initial_state_hash=repeat('a',64);
 IF v_session IS NULL THEN RAISE EXCEPTION 'Restored session hash or version diverges'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.battle_sim_events e WHERE e.session_id=v_session
  AND seq=1 AND prev_hash=repeat('a',64) AND state_hash=repeat('b',64))
 THEN RAISE EXCEPTION 'Restored receipt chain diverges'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN(
    'public.battle_sim_sessions'::regclass,
    'public.battle_sim_events'::regclass,
    'public.battle_sim_scenarios'::regclass) AND NOT relrowsecurity)
 THEN RAISE EXCEPTION 'RLS disabled after restore'; END IF;
 IF has_table_privilege('anon','public.battle_sim_sessions','SELECT')
   OR has_table_privilege('authenticated','public.battle_sim_sessions','INSERT')
   OR NOT has_table_privilege('authenticated','public.battle_sim_sessions','SELECT')
 THEN RAISE EXCEPTION 'Privileges diverge after restore'; END IF;
 IF has_function_privilege('authenticated',
   'public.battle_sim_commit_step(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,text)',
   'EXECUTE')
   OR NOT has_function_privilege('service_role',
   'public.battle_sim_commit_step(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,text)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'RPC grants diverge after restore'; END IF;
END $assert$;
SQL
echo "PASS: isolated pg_dump/pg_restore roundtrip, battle state+events+hashes and RLS/RPC grants preserved."
