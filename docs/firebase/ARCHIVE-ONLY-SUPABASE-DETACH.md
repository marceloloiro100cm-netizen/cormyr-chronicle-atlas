# Detach legacy Supabase auth from archive-only app (17 November 2026)

The Cormyr application was still registering `attachSupabaseAuth` globally
in `src/start.ts`. That browser middleware calls the legacy Supabase
`getSession()` whenever a server function is invoked, despite archive-only
mode returning HTTP 503 for old server functions.

## Change

- Remove the global Supabase session-attacher registration in `src/start.ts`.
- Leave `functionMiddleware: []` while the legacy server functions are closed.
- Keep `archiveOnlyMiddleware` first in request middleware; all serverFn calls
  still receive 503 without processing old handlers or accessing legacy data.
- Firebase-only `/firebase-access` continues using its own Firebase ID token
  and explicitly protected `/api/firebase-cloud-* ` endpoints, not the
  detached middleware. No Firebase Cloud endpoint or runtime flag was enabled.
- Extend the Lote 5 security contract and Lote 9 / 18-items fixtures to reject
  reintroduced Supabase attachment or omission of the archive serverFn gate.

## Non-goals and release evidence

This removes one *active request-path dependency* on Supabase. It does not
delete historical source clients or imply the full app has moved to Firebase.
Production remains archive-only; Firebase Auth account activation, runtime
reconciliation, Cloud role E2E, Storage and final source-delta approval remain
pending. No Firestore, Storage, IAM, DNS, secrets or user accounts changed.

A passing build and emulator test suite is necessary but never sufficient for
`readyForPlayers` or `readyForCutover`.

## Read-only Firebase routes enabled at archive boundary

The archive-only boundary now passes only **four additional read-only
Firebase-specific API paths** through to their independent server guards:
`/api/firebase-cloud-house-quote`,
`/api/firebase-operational-economy`,
`/api/firebase-house-reconciliation-audit` and
`/api/firebase-treasury-audit`.

Each endpoint is still controlled by Firebase flags, snapshot checks,
Firebase Auth token verification, House/Narrator scope and reconciled
runtime checks. The migration does **not** enable any of those flags or
populate any runtime. Their current 503 responses remain expected.

The treasury adjustment, construction purchase, local emulator,
legacy backend, and every serverFn route remain blocked by
`shouldBlockLegacyRequest`. This is API wiring, not production
readiness or authorization to write.
