/** Browser-safe Supabase connection coordinates.
 * These values are PUBLIC by design (the publishable key is NOT a secret).
 * RLS protects campaign data; no service-role keys, accounts or passwords here.
 * Safe production fallback when a host does not inject VITE_* during build.
 */
export const PUBLIC_SUPABASE_URL="https://qkdznngbkwodsbpkpoax.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_jToB9fTbM4C9-cDEhZN8TQ_q3wq4XUm";

export function resolvePublicSupabase(
 url?:string|null,key?:string|null,
):Readonly<{url:string;key:string}>{
 return {url:url?.trim()||PUBLIC_SUPABASE_URL,
  key:key?.trim()||PUBLIC_SUPABASE_PUBLISHABLE_KEY};
}
