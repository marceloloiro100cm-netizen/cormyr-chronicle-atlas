// Supabase publishable browser configuration is deliberately not a secret.
// The anon/publishable key is safe only with correctly enforced RLS.
// Never add service_role, passwords, e-mails or private campaign content here.
export const PUBLIC_SUPABASE_URL="https://qkdznngbkwodsbpkpoax.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_jToB9fTbM4C9-cDEhZN8TQ_q3wq4XUm";

/** Configuração publicável, não privilegiada. Variáveis explícitas prevalecem. */
export function resolvePublicSupabase(url?:string|null,key?:string|null):Readonly<{url:string;key:string}>{
 return {url:url?.trim()||PUBLIC_SUPABASE_URL,
  key:key?.trim()||PUBLIC_SUPABASE_PUBLISHABLE_KEY};
}
