/** Explicitly isolated domain preview: the production application stays in Supabase. */
import {firebaseHomologationAuth} from '@/integrations/auth/firebase-homologation';

export const MIGRATED_DOMAINS=[
  'access','houses','records','characters','schedule','time','mailbox',
  'mailCommands','newspaper','spyAgents','spyMissions','spyIntel',
  'battle','privateGm','drive',
] as const;
export type MigratedDomain=typeof MIGRATED_DOMAINS[number];
export type DomainRequest={domain:MigratedDomain;action:string;args:unknown[]};

export function firebaseDomainPreviewEnabled(flag:string|undefined,dev:boolean):boolean {
  return flag==='true'&&dev;
}
export function domainPreviewConfigured():boolean {
  return firebaseDomainPreviewEnabled(
    import.meta.env['VITE_FIREBASE_DOMAIN_HOMOLOGATION'],
    import.meta.env.DEV,
  );
}
export async function callFirebaseDomain<T=unknown>(
  request:DomainRequest,
  deps:{getToken?:()=>Promise<string|null>;fetcher?:typeof fetch}={},
):Promise<T>{
  const token=await (deps.getToken??(async()=>firebaseHomologationAuth()?.getToken()??null))();
  if(!token)throw new Error('Sessão Firebase de homologação indisponível.');
  const res=await (deps.fetcher??fetch)('/api/firebase-domain',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(request),
  });
  const value:unknown=await res.json();
  if(!res.ok||!value||typeof value!=='object'||!('result' in value))
    throw new Error(res.status===403?'Acesso não autorizado neste módulo.':
      'Serviço Firebase indisponível ou configuração incompleta.');
  return (value as {result:T}).result;
}
