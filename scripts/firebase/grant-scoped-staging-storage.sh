#!/usr/bin/env bash
# Isolated Cormyr Firebase Storage homologation.
# The existing production bucket uses fine-grained object ACLs: NEVER change it.
# Operator's Cloud Shell copies only previously staged images to a new private
# bucket. GitHub identities get roles ONLY on that new bucket.
set -euo pipefail
umask 077

PROJECT="cormyr"
EXPECTED_PROJECT_NUMBER="477785088395"
GITHUB_REPO_ID="1436424408"
POOL="cormyr-gh-migration"
SOURCE_BUCKET="cormyr.firebasestorage.app"
SOURCE_PREFIX="migration-staging/campaign-images"
DEST_BUCKET="cormyr-migration-homolog-${EXPECTED_PROJECT_NUMBER}"
READ_SA="cormyr-gh-reader@${PROJECT}.iam.gserviceaccount.com"
WRITE_ID="cormyr-gh-stager"
WRITE_SA="${WRITE_ID}@${PROJECT}.iam.gserviceaccount.com"

fail() { echo "BLOQUEADO: $*" >&2; exit 1; }
command -v gcloud >/dev/null || fail "gcloud ausente"
command -v python3 >/dev/null || fail "python3 ausente"

project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
  fail "Sem acesso ao projeto Google Cloud."
[[ "$project_number" == "$EXPECTED_PROJECT_NUMBER" ]] || fail "Numero de projeto inesperado"
gcloud iam service-accounts describe "$READ_SA" --project="$PROJECT" >/dev/null ||
  fail "Conta reader nao encontrada"

source_meta="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --raw --format=json)" ||
  fail "Bucket original nao acessivel"
source_location="$(SOURCE_META="$source_meta" python3 - <<'PY'
import json,os
data=json.loads(os.environ['SOURCE_META'])
loc=str(data.get('location','')).upper()
assert loc and 2<=len(loc)<=32 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for c in loc)
print(loc)
PY
)" || fail "Nao foi possivel validar a localizacao da origem"

echo "Projeto: $PROJECT. Origem permanece INALTERADA; sem ACLs nem novos papeis."
echo "Bucket privado: gs://${DEST_BUCKET}"

# The source is read only via the owner's already existing Cloud Shell
# permissions; no project-wide/object-level IAM grants are added to source.
if ! gcloud storage buckets describe "gs://${DEST_BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${DEST_BUCKET}" \
    --project="$PROJECT" --location="$source_location" \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access --public-access-prevention \
    --quiet >/dev/null ||
    fail "Nao foi possivel criar o bucket de homologacao"
fi

dest_meta="$(gcloud storage buckets describe "gs://${DEST_BUCKET}" --raw --format=json)" ||
  fail "Bucket destino inacessivel"
DEST_META="$dest_meta" PROJECT_NUMBER="$EXPECTED_PROJECT_NUMBER" SOURCE_LOCATION="$source_location" \
python3 - <<'PY' || fail "Destino existe mas nao atende as restricoes de privacidade"
import json,os
data=json.loads(os.environ['DEST_META'])
cfg=data.get('iamConfiguration',{})
assert str(data.get('projectNumber'))==os.environ['PROJECT_NUMBER'], 'Unexpected or missing project owner in raw bucket metadata'
assert cfg.get('uniformBucketLevelAccess',{}).get('enabled') is True, 'Uniform access missing in raw metadata'
assert cfg.get('publicAccessPrevention')=='enforced', 'Public-access prevention missing in raw metadata'
assert str(data.get('location','')).upper()==os.environ['SOURCE_LOCATION'], 'Bucket location mismatch'
PY

# Separate non-destructive GitHub writer for the sandbox; never give access to
# original Firebase Storage bucket or project-wide database/Auth roles.
if ! gcloud iam service-accounts describe "$WRITE_SA" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$WRITE_ID" --project="$PROJECT" \
    --display-name="Cormyr isolated GitHub staging uploader" >/dev/null
fi
pool="projects/${EXPECTED_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
gcloud iam service-accounts add-iam-policy-binding "$WRITE_SA" \
  --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${pool}/attribute.repository_id/${GITHUB_REPO_ID}" \
  --quiet >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${WRITE_SA}" --role=roles/storage.objectCreator \
  --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${WRITE_SA}" --role=roles/storage.objectViewer \
  --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${READ_SA}" --role=roles/storage.objectViewer \
  --quiet >/dev/null

# Read back the exact grants, without printing bucket metadata or object names.
gcloud storage buckets get-iam-policy "gs://${DEST_BUCKET}" --format=json |
  READER="$READ_SA" STAGER="$WRITE_SA" python3 -c '
import json,os,sys
p=json.load(sys.stdin); want={
  "serviceAccount:"+os.environ["READER"]:{"roles/storage.objectViewer"},
  "serviceAccount:"+os.environ["STAGER"]:{"roles/storage.objectViewer","roles/storage.objectCreator"}}
for identity,required in want.items():
  actual={b.get("role") for b in p.get("bindings",[]) if identity in b.get("members",[])}
  if not required.issubset(actual): raise SystemExit("Missing intended staging IAM grants")
'

# Copy is executed as the OWNER in Cloud Shell (not a GitHub service account).
# No ACLs from the existing bucket are preserved in the new uniform bucket.
# --no-clobber refuses overwriting objects from an earlier attempt.
# Keep object names in a private temporary transcript; never publish to CI.
tmp="$(mktemp -d)"
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
echo "Conferindo se as imagens antigas estao acessiveis na origem..."
if ! gcloud storage ls --recursive \
  "gs://${SOURCE_BUCKET}/${SOURCE_PREFIX}/" >"$tmp/src.txt" 2>"$tmp/error.txt"; then
  fail "Sem permissao de leitura na origem com o usuario atual; bucket original nao foi modificado"
fi
source_count="$(grep -c '^gs://' "$tmp/src.txt" || true)"
[[ "$source_count" -gt 0 ]] || fail "Nenhuma imagem localizada na origem"
echo "Imagens encontradas para copia na origem: $source_count"

echo "Copiando imagens para o bucket privado, sem sobrescrever e sem preservar ACLs..."
if ! gcloud storage cp --recursive --no-clobber --no-preserve-acl \
  "gs://${SOURCE_BUCKET}/${SOURCE_PREFIX}" \
  "gs://${DEST_BUCKET}/" \
  >"$tmp/copy.log" 2>"$tmp/copy.err"; then
  fail "Copia interrompida ou parcial. O destino pode ter objetos novos; repetir usa --no-clobber."
fi

if ! gcloud storage ls --recursive "gs://${DEST_BUCKET}/campaign-images/" \
  >"$tmp/destination.txt" 2>"$tmp/dest.err"; then
  fail "Nao foi possivel listar os objetos copiados no destino."
fi
destination_count="$(grep -c '^gs://' "$tmp/destination.txt" || true)"
echo "Origem: $source_count objetos; homologacao: $destination_count objetos"
[[ "$destination_count" -eq "$source_count" ]] ||
  fail "Contagens divergentes; nao prosseguir para importacoes de banco. Nao houve mudanca na origem."

echo "SUCESSO: imagens copiadas e papeis privados de staging aplicados."
echo "Nenhuma ACL do bucket original alterada; nenhum usuario Auth/Firestore importado."
