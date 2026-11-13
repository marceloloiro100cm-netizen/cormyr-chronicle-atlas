#!/usr/bin/env bash
# One-time manual authorization: GitHub Actions -> GCP through short-lived OIDC.
# No service-account JSON key, no access to private campaign data, no deploy.
set -euo pipefail
umask 077

PROJECT_ID="cormyr"
REPO_ID="1436424408"
POOL_ID="cormyr-gh-migration"
PROVIDER_ID="github-main"
ACCOUNT_ID="cormyr-gh-reader"
ACCOUNT_EMAIL="${ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
CONDITION="assertion.repository_id=='${REPO_ID}' && assertion.ref=='refs/heads/main'"

command -v gcloud >/dev/null || {
  echo "ERROR: Run in a Google Cloud Shell that includes gcloud." >&2
  exit 2
}

echo "Target Google Cloud project: ${PROJECT_ID}"
echo "Trust limited to GitHub repository ID ${REPO_ID}, branch main."
echo "Will create a dedicated service account WITHOUT access to Storage, Auth, or Firestore."

gcloud projects describe "${PROJECT_ID}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
test -n "${PROJECT_NUMBER}" || { echo "Missing project number" >&2; exit 2; }

gcloud services enable \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --location=global --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --location=global --project="${PROJECT_ID}" \
    --display-name="Cormyr Github migration identity" >/dev/null
fi

if gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --workload-identity-pool="${POOL_ID}" --location=global \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  EXISTING_CONDITION="$(gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --workload-identity-pool="${POOL_ID}" --location=global \
    --project="${PROJECT_ID}" --format='value(attributeCondition)')"
  if [[ "${EXISTING_CONDITION}" != "${CONDITION}" ]]; then
    echo "ERROR: Existing provider has a different trust condition; review manually." >&2
    exit 1
  fi
else
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location=global \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Cormyr GitHub main only" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition="${CONDITION}" >/dev/null
fi

if ! gcloud iam service-accounts describe "${ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${ACCOUNT_ID}" \
    --project="${PROJECT_ID}" \
    --display-name="Cormyr GitHub identity check (no data roles)" >/dev/null
fi

POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
gcloud iam service-accounts add-iam-policy-binding "${ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPO_ID}" \
  --quiet >/dev/null

echo
echo "IDENTITY CONFIGURATION CREATED. No database, Auth or Storage permissions granted."
echo "Create these TWO GitHub repository ACTIONS VARIABLES (not Secrets):"
echo "CORMYR_GCP_WIF_PROVIDER=${POOL_NAME}/providers/${PROVIDER_ID}"
echo "CORMYR_GCP_READONLY_SA=${ACCOUNT_EMAIL}"
echo
echo "Then merge the reviewed PR and run the 'Cormyr Firebase - verify GCP identity (no data access)' workflow."
