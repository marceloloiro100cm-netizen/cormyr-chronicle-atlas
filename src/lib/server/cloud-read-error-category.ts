/**
 * Classify only known, non-identifying Firebase/Firestore status codes.
 * Provider messages, paths and user identifiers must never be logged.
 */
export type CloudReadFailureCategory=
  'permission_denied'|'provider_unavailable'|'provider_unauthenticated'|
  'unexpected_provider_failure';

export function cloudReadFailureCategory(error:unknown):CloudReadFailureCategory{
  if(!error||typeof error!=='object')return 'unexpected_provider_failure';
  const code=(error as {code?:unknown}).code;
  if(code==='permission-denied'||code===7)return 'permission_denied';
  if(code==='unavailable'||code===14)return 'provider_unavailable';
  if(code==='unauthenticated'||code===16)return 'provider_unauthenticated';
  return 'unexpected_provider_failure';
}
