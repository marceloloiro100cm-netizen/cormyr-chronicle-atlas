#!/usr/bin/env bash
# REAL two-client CAS race on disposable GitHub Actions PostgreSQL only.
# Refuses any host/database that could point to production or staging.
set -euo pipefail
if [[ "${BATTLE_DISPOSABLE_POSTGRES:-}" != "true" ||
      "${PGHOST:-}" != "localhost" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "battle_test" ||
      "${CI:-}" != "true" ]]; then
  echo "Refusing CAS race test outside disposable CI PostgreSQL." >&2
  exit 2
fi

SESSION_ID=""
WORK_DIR="$(mktemp -d)"
cleanup() {
  if [[ -n "$SESSION_ID" ]]; then
    psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM public.battle_sim_events WHERE session_id='$SESSION_ID'::uuid;" >/dev/null || true
    psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM public.battle_sim_sessions WHERE id='$SESSION_ID'::uuid;" >/dev/null || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

SESSION_ID="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE service_role;
SELECT public.battle_sim_commit_replay(
 '11111111-1111-4111-8111-111111111111','BATTLE_CI_CAS_RACE',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}'::jsonb,
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('a',64),'[]'::jsonb);
SQL
)"
if [[ ! "$SESSION_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Failed to seed synthetic test session." >&2; exit 1
fi

attempt() {
  local command_uuid="$1" next_hash="$2"
  psql -X -v ON_ERROR_STOP=1 -q <<SQL
SET ROLE service_role;
BEGIN;
SET LOCAL lock_timeout='10s';
-- Both independent psql connections pause before attempting the same expected version.
SELECT pg_sleep(1);
SELECT public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111','$SESSION_ID'::uuid,0,'$command_uuid',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
   'prevHash',repeat('a',64),'stateHash',repeat('$next_hash',64),
   'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('$next_hash',64));
COMMIT;
SQL
}

attempt "99999999-9999-4999-8999-999999999999" b >"$WORK_DIR/client1.log" 2>&1 &
p1=$!
attempt "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" c >"$WORK_DIR/client2.log" 2>&1 &
p2=$!
set +e
wait "$p1"; status1=$?
wait "$p2"; status2=$?
set -e

if [[ $(( (status1 == 0) + (status2 == 0) )) -ne 1 ]]; then
  echo "CAS race expected one successful client, got statuses $status1 and $status2" >&2
  cat "$WORK_DIR/client1.log" "$WORK_DIR/client2.log" >&2
  exit 1
fi
if ! grep -q 'CONFLICT' "$WORK_DIR/client1.log" && ! grep -q 'CONFLICT' "$WORK_DIR/client2.log"; then
  echo "CAS race failed without an explicit version conflict." >&2
  cat "$WORK_DIR/client1.log" "$WORK_DIR/client2.log" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
BEGIN
 IF (SELECT state_version FROM public.battle_sim_sessions WHERE name='BATTLE_CI_CAS_RACE') <> 1
 OR (SELECT count(*) FROM public.battle_sim_events e JOIN public.battle_sim_sessions s ON e.session_id=s.id
     WHERE s.name='BATTLE_CI_CAS_RACE') <> 1
 THEN
   RAISE EXCEPTION 'CAS race corrupted event count or version';
 END IF;
END $check$;
SQL
echo "PASS: two simultaneous PostgreSQL clients, one commit and one 40001 conflict; version=1, one event."
