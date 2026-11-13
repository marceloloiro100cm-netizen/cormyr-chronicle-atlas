#!/usr/bin/env bash
# One-time, deliberately narrow Google Cloud IAM authorization for Cormyr migration.
# Run with the owner's Cloud Shell. Do NOT run under a GitHub Actions service account.
# No deletion, no overwrite of campaign media, no production database/Auth changes.
set -euo pipefail
umask 077

PROJECT="cormyr"
EXPECTED_PROJECT_NUMBER="477785088395"
GITHUB_REPO_ID="1436424408"
POOL="cormyr-gh-migration"
SOURCE_BUCKET="cormyr.firebasestorage.app"
SOURCE_FOLDER="gs://${SOURCE_BUCKET}/migration-staging/"
DEST_BUCKET="cormyr-migration-homolog-${EXPECTED_PROJECT_NUMBER}"
READ_SA="cormyr-gh-reader@${PROJECT}.iam.gserviceaccount.com"
WRITE_ID="cormyr-gh-stager"
WRITE_SA="${WRITE_ID}@${PROJECT}.iam.gserviceaccount.com"

fail() { echo "BLOQUEADO: $*" >&2; exit 1; }
for command in gcloud python3; do command -v "$command" >/dev/null || fail "Ferramenta ausente: $command"; done

actual_project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
  fail "Sem acesso ao projeto."
[[ "$actual_project_number" == "$EXPECTED_PROJECT_NUMBER" ]] || fail "ID do projeto diferente do esperado."
gcloud iam service-accounts describe "$READ_SA" --project="$PROJECT" >/dev/null ||
  fail "Conta de leitura da etapa anterior nao encontrada."

# Detect unsupported ACL configuration rather than silently changing permissions in the live bucket.
source_meta="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --format=json)" ||
  fail "Nao foi possivel consultar o bucket de origem."
source_values="$(SOURCE_META="$source_meta" python3 - <<'PY'
import json,os
data=json.loads(os.environ['SOURCE_META'])
cfg=data.get('iamConfiguration',{})
enabled=cfg.get('uniformBucketLevelAccess',{}).get('enabled',False)
print('true' if enabled else 'false')
print(str(data.get('location','')).upper())
PY
)"
source_uniform="$(printf '%s\n' "$source_values" | sed -n '1p')"
source_location="$(printf '%s\n' "$source_values" | sed -n '2p')"
[[ "$source_uniform" == "true" ]] ||
  fail "O bucket de origem nao usa acesso uniforme: recusando alterar ACLs de producao."
[[ "$source_location" =~ ^[A-Z0-9-]{2,32}$ ]] || fail "Localizacao do bucket invalida."

echo "Projeto e bucket de origem conferidos."
echo "Escopo de leitura: apenas ${SOURCE_FOLDER}"
echo "Destino de homologacao: gs://${DEST_BUCKET}/ (privado)."

if ! gcloud storage managed-folders describe "$SOURCE_FOLDER" >/dev/null 2>&1; then
  gcloud storage managed-folders create "$SOURCE_FOLDER" --quiet >/dev/null ||
    fail "Nao foi possivel criar a pasta gerenciada com acesso limitado."
fi
gcloud storage managed-folders describe "$SOURCE_FOLDER" >/dev/null ||
  fail "Pasta gerenciada de staging nao encontrada."

# Do not attach IAM to a destination bucket owned by another project or one
# whose privacy controls differ from the intended sandbox.
if gcloud storage buckets describe "gs://${DEST_BUCKET}" >/dev/null 2>&1; then
  echo "Bucket de homologacao preexistente: validando propriedade e privacidade."
else
  gcloud storage buckets create "gs://${DEST_BUCKET}" \
    --project="$PROJECT" \
    --location="$source_location" \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --quiet >/dev/null || fail "Nao foi possivel criar o bucket de homologacao."
fi

DEST_META="$(gcloud storage buckets describe "gs://${DEST_BUCKET}" --format=json)" ||
  fail "Nao foi possivel verificar bucket de homologacao."
DEST_META="$DEST_META" PROJECT_NUMBER="$EXPECTED_PROJECT_NUMBER" SOURCE_LOCATION="$source_location" \
python3 - <<'PY' || fail "Bucket de homologacao existente nao passou na verificacao."
import json,os,sys
data=json.loads(os.environ['DEST_META'])
cfg=data.get('iamConfiguration',{})
got=str(data.get('projectNumber',''))
expected=os.environ['PROJECT_NUMBER']
assert got==expected, 'Unexpected bucket owner; do not modify.'
assert cfg.get('uniformBucketLevelAccess',{}).get('enabled') is True, 'Uniform IAM disabled'
assert cfg.get('publicAccessPrevention')=='enforced', 'Public access prevention disabled'
assert str(data.get('location','')).upper()==os.environ['SOURCE_LOCATION'], 'Location mismatch'
PY

# Create a separate identity for writing into an isolated bucket. The reader
# remains read-only and neither principal gets project-wide data roles.
if ! gcloud iam service-accounts describe "$WRITE_SA" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$WRITE_ID" --project="$PROJECT" \
    --display-name="Cormyr GitHub isolated staging uploader" >/dev/null
fi
POOL_RESOURCE="projects/${EXPECTED_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
gcloud iam service-accounts add-iam-policy-binding "$WRITE_SA" \
  --project="$PROJECT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${GITHUB_REPO_ID}" \
  --quiet >/dev/null

for principal in "$READ_SA" "$WRITE_SA"; do
  gcloud storage managed-folders add-iam-policy-binding "$SOURCE_FOLDER" \
    --member="serviceAccount:${principal}" --role="roles/storage.objectViewer" \
    --quiet >/dev/null
done

# Grant only the private migration bucket roles needed for idempotent upload
# (create with generation preconditions) and metadata/read-back verification.
gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${WRITE_SA}" --role="roles/storage.objectCreator" \
  --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${WRITE_SA}" --role="roles/storage.objectViewer" \
  --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${DEST_BUCKET}" \
  --member="serviceAccount:${READ_SA}" --role="roles/storage.objectViewer" \
  --quiet >/dev/null

# Verify the *grants* at their narrowest scope without enumerating private names.
gcloud storage managed-folders get-iam-policy "$SOURCE_FOLDER" --format=json |
  SOURCE_READ="$READ_SA" SOURCE_WRITE="$WRITE_SA" python3 -c '
import json,os,sys
p=json.load(sys.stdin)
members=set()
for binding in p.get("bindings",[]):
  if binding.get("role")=="roles/storage.objectViewer":
    members.update(binding.get("members",[]))
required={"serviceAccount:"+os.environ["SOURCE_READ"],"serviceAccount:"+os.environ["SOURCE_WRITE"]}
if not required.issubset(members): raise SystemExit("Missing scoped source readers")
'
gcloud storage buckets get-iam-policy "gs://${DEST_BUCKET}" --format=json |
  STAGER="$WRITE_SA" python3 -c '
import json,os,sys
p=json.load(sys.stdin)
who="serviceAccount:"+os.environ["STAGER"]
roles={b.get("role") for b in p.get("bindings",[]) if who in b.get("members",[])}
if not {"roles/storage.objectCreator","roles/storage.objectViewer"}.issubset(roles):
  raise SystemExit("Missing isolated destination roles")
'

echo
echo "PERMISSOES RESTRITAS CONFIGURADAS:"
echo "- Fonte: leitura de migration-staging/ via IAM de pasta gerenciada; sem escrita."
echo "- Destino: gs://${DEST_BUCKET}/ com criacao e leitura; sem exclusao de objetos."
echo "- Identidades: ${READ_SA} (leitura) e ${WRITE_SA} (homologacao)."
echo "- Nenhuma permissao nova em Auth ou Firestore; nenhuma mudanca na producao."
echo "Agora podemos validar a conexao e o inventario pelo GitHub Actions."
