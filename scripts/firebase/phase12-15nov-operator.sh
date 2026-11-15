#!/usr/bin/env bash
# Cormyr 15/11: private, non-destructive backup -> Firebase emulators -> GCS archive.
# Optional --cloud-project imports ONLY to an empty isolated Firebase project.
set -euo pipefail
umask 077

TARGET=""
if [ "$#" -ne 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != "--cloud-project" ]; then
    echo 'Usage: bash scripts/firebase/phase12-15nov-operator.sh [--cloud-project cormyr-homolog-UNIQUE]' >&2
    exit 2
  fi
  TARGET="$2"
fi

ROOT="$(cd -- "$(dirname "$0")/../.." && pwd)"
PRIVATE="$HOME/cormyr-chronicle-atlas/.firebase-migration"
BUCKET="gs://cormyr-migration-homolog-477785088395"
PREFIX="$BUCKET/backups/corte-lovable-2026-11-15"
ZIP_NAME="bucket-database_export_15_11_26-files.zip"
SOURCE_SHA="6c2919673a41b39043605e8460513ea0d15ca6c456e7a3d5b818a25417726a10"

command -v gcloud >/dev/null || { echo 'Cloud SDK required' >&2; exit 2; }
command -v pg_restore >/dev/null || { echo 'PostgreSQL pg_restore 17+ required' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'Python 3 required' >&2; exit 2; }
command -v node >/dev/null || { echo 'Node.js required' >&2; exit 2; }
command -v npm >/dev/null || { echo 'npm required' >&2; exit 2; }
command -v java >/dev/null || { echo 'Java required for local Firestore emulator' >&2; exit 2; }

PG_MAJOR="$(pg_restore --version | grep -oE '[0-9]+' | head -1)"
if [ "${PG_MAJOR:-0}" -lt 17 ]; then
  echo 'PostgreSQL client 17 or newer required (PGDMP 1.16)' >&2
  exit 2
fi
if [ -n "${FIRESTORE_EMULATOR_HOST:-}" ] || [ -n "${FIREBASE_AUTH_EMULATOR_HOST:-}" ]; then
  echo 'Unset existing emulator variables before starting a fresh private run' >&2
  exit 2
fi
if [ ! -d "$PRIVATE" ]; then mkdir -p -m 700 "$PRIVATE"; fi
chmod 700 "$PRIVATE"
RUN="$(mktemp -d "$PRIVATE/phase12-15nov-XXXXXXXX")"
chmod 700 "$RUN"
echo "Private run created (no public GitHub artifacts)."

gcloud storage cp --quiet "$PREFIX/originais/$ZIP_NAME" "$RUN/source.zip"
echo "$SOURCE_SHA  $RUN/source.zip" | sha256sum -c --status || {
  echo 'Source backup SHA-256 mismatch; import cancelled' >&2; exit 1;
}
python3 "$ROOT/scripts/firebase/extract_private_pg_backup.py" \
  --zip "$RUN/source.zip" --output "$RUN/original.backup" > "$RUN/extraction-report.json"

bash "$ROOT/scripts/firebase/prepare-backup.sh" \
  "$RUN/original.backup" "$RUN/inspection" > "$RUN/prepare-summary.json"
NORMALIZED="$RUN/inspection/normalized"

cd "$ROOT"
node scripts/firebase/stage-all-emulators.mjs \
  --normalized "$NORMALIZED" > "$RUN/preflight.json"

if ! jq -e '.readyForEmulatorStage == true and .stages.auth.valid == true
  and .stages.rawArchive.valid == true and .stages.typedDomain.valid == true' \
  "$RUN/preflight.json" >/dev/null; then
  echo 'Preflight contains blockers. No Firebase import performed.' >&2
  jq '{scope,readyForEmulatorStage,stages,missingAuthTables}' "$RUN/preflight.json"
  exit 1
fi

echo 'Preflight passed; launching ISOLATED Auth + Firestore emulators.'
npm install --no-save --package-lock=false \
  firebase-tools@15.35.0 firebase-admin@14.5.1 >/dev/null

export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
OUT="$RUN/exported-emulators"
npx firebase emulators:exec --only firestore,auth \
  --project demo-cormyr-migration \
  --config firebase/firebase-all.json \
  --export-on-exit "$OUT" \
  "node scripts/firebase/stage-all-emulators.mjs --normalized '$NORMALIZED' --execute-emulator" \
  > "$RUN/emulator-stage.log"

# Independent round-trip of every Firestore raw row and large-value fragment.
npx firebase emulators:exec --only firestore,auth \
  --project demo-cormyr-migration \
  --config firebase/firebase-all.json \
  --import "$OUT" \
  "node scripts/firebase/verify-firestore-emulator.mjs --normalized '$NORMALIZED'" \
  > "$RUN/roundtrip.log"

unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST
test -d "$OUT" || { echo 'Emulator export missing' >&2; exit 1; }

tar -czf "$RUN/private-firebase-emulator-export.tar.gz" -C "$RUN" exported-emulators
sha256sum "$RUN/private-firebase-emulator-export.tar.gz" \
  | sed "s|$RUN/||" > "$RUN/private-export.sha256"

DEST="$BUCKET/backups/phase12-15nov/$(basename "$RUN")"
gcloud storage cp --no-clobber "$RUN/private-firebase-emulator-export.tar.gz" "$DEST/"
gcloud storage cp --no-clobber "$RUN/private-export.sha256" "$DEST/"
gcloud storage cp --no-clobber "$RUN/preflight.json" "$DEST/"
gcloud storage ls "$DEST/private-firebase-emulator-export.tar.gz" >/dev/null

echo 'Phase 1+2 local Firebase emulators passed; private export stored in GCS.'
jq '{scope,readyForEmulatorStage,stages}' "$RUN/preflight.json"

if [ -z "$TARGET" ]; then
  echo 'No Cloud project was provided: NO Firestore/Auth Cloud import was attempted.'
  echo 'Only use --cloud-project with a separate empty homologation Firebase project.'
  exit 0
fi

# Safety policy: never import to production project "cormyr".
node scripts/firebase/phase12-private-cloud-homolog.mjs \
  --normalized "$NORMALIZED" --project "$TARGET" > "$RUN/cloud-preflight.json"
jq -e '.preflightValid == true and .productionWrites == 0' \
  "$RUN/cloud-preflight.json" >/dev/null

# Require the exact target to exist and isolate rules. No automatic project creation.
gcloud projects describe "$TARGET" --format='value(projectId)' \
  | grep -Fx "$TARGET" >/dev/null
echo 'Deploying deny-all Firestore rules ONLY to isolated homologation.'
npx firebase deploy --non-interactive --only firestore:rules \
  --project "$TARGET" --config firebase/firebase.json >/dev/null

# ADC must be available to firebase-admin. No credentials printed.
gcloud auth application-default print-access-token >/dev/null 2>&1 || {
  echo 'Application Default Credentials unavailable; no Cloud import performed' >&2
  exit 1
}
export CORMYR_HOMOLOG_RULES_ACK='DENY_ALL_DEPLOYED_TO_THIS_HOMOLOGATION_PROJECT'
export CORMYR_PHASE12_IMPORT_ACK='APPROVE_PRIVATE_AUTH_AND_FIRESTORE_IMPORT'
node scripts/firebase/phase12-private-cloud-homolog.mjs \
  --normalized "$NORMALIZED" --project "$TARGET" --execute-cloud \
  > "$RUN/cloud-import-result.json"
unset CORMYR_HOMOLOG_RULES_ACK CORMYR_PHASE12_IMPORT_ACK

jq '{scope,projectId,importComplete,rawTables,rawRows,typedCollections,
  authAccounts,accountsWithoutProfile,deferredCustomProviders,
  productionWrites,readyForPlayers,readyForCutover}' \
  "$RUN/cloud-import-result.json"

echo 'IMPORTANT: Homologation ONLY. Production App Hosting/Auth/Firestore untouched.'
