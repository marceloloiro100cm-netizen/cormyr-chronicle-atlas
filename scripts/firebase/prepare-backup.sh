#!/usr/bin/env bash
# Local extraction only. Never executes the SQL or contacts either database.
set -euo pipefail
umask 077
if [ "$#" -ne 2 ]; then
  echo 'Usage: bash scripts/firebase/prepare-backup.sh SOURCE.backup NEW_PRIVATE_DIRECTORY' >&2
  exit 2
fi
source_backup=$(realpath "$1")
output_directory=$2
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v pg_restore >/dev/null || { echo 'Install PostgreSQL client 17 or newer (pg_restore required).' >&2; exit 2; }
# mkdir without -p refuses an existing directory, so retries cannot overwrite evidence.
mkdir -m 700 -- "$output_directory"
output_directory=$(realpath "$output_directory")
pg_restore --list "$source_backup" > "$output_directory/toc.txt"
pg_restore --data-only --no-owner --no-privileges --file="$output_directory/data.sql" "$source_backup"
python3 "$script_directory/inspect_backup.py" "$output_directory/data.sql" \
  --private-export "$output_directory/normalized" > "$output_directory/audit.json"
python3 - "$source_backup" "$output_directory" <<'PY'
import hashlib,json,sys
from pathlib import Path
source=Path(sys.argv[1]);out=Path(sys.argv[2])
hash=hashlib.sha256()
with source.open('rb') as stream:
    for chunk in iter(lambda: stream.read(1024*1024),b''):hash.update(chunk)
(out/'source-integrity.json').write_text(json.dumps({'sha256':hash.hexdigest(),'bytes':source.stat().st_size,'databaseWritten':False},indent=2))
report=json.loads((out/'audit.json').read_text())
print(json.dumps({'tables':report['tableCount'],'rows':report['rowCount'],'readyForCutover':False}))
PY
