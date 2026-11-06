# Production incident — status after deploy bb4f859b

## Evidence (read-only check, 15:31 UTC)
- Home `/` and `/auth` on https://cormyr-chronicle-atlas.lovable.app: HTTP 200, no failed network requests.
- Both pages still show "This page didn't load / Something went wrong on our end". The sign-in page does not render.
- Console on both pages: `Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY`.
- The live code bundle (`context-CMDOaBpU.js`) is byte-for-byte the same file name as before the deploy. Inside it, the baked settings contain only `VITE_SUPABASE_PROJECT_ID`. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are absent, and the code falls back to `{}.SUPABASE_URL` (empty).
- The page is served with `cache-control: no-cache`, so this is not a caching delay.

## Conclusion
This is not propagation delay. The build that is live was produced without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The unchanged file name suggests that deploy bb4f859b either reused the old build or rebuilt from a source that still lacks those two values.

## Proposed fix (needs build mode and your approval)
1. Confirm the sandbox environment file still carries the URL and key. It is kept out of Git and was regenerated at 15:28.
2. Republish from Lovable, not from an external GitHub pipeline, so the build picks up those values.
3. Re-run the same browser check on `/` and `/auth`. Confirm the error is gone, the sign-in screen renders, and the new bundle contains the URL.
4. If the file name is still unchanged after republishing, the hosting build is not reading the environment. Fallback: hardcode the backend URL and public key in the build configuration. Both values are publishable and safe in the browser. No secrets, passwords or e-mails go into Git, and no change to #290, data, accounts or the CRZ pilot.
