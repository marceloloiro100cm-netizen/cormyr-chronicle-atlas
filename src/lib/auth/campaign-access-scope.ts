import {supabase} from '@/integrations/supabase/client';
import type {SupabaseClient} from '@supabase/supabase-js';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

export type CampaignProfile='jogador'|'editor'|'narrador';

/** Lote 27: verification is read-only and always run under the CURRENT JWT.
 * A membership revocation is not an auth event: old tabs must periodically
 * re-check this scope and immediately discard all cached restricted views.
 */
export const CAMPAIGN_ACCESS_SCOPE_KEY=['campaign-access-scope'] as const;
export const CAMPAIGN_ACCESS_SCOPE_POLL_MS=15_000;

export type ScopeMember={
 house_id:string;
 can_edit:boolean;
 can_edit_attributes:boolean;
};
export type CampaignAccessScope={
 userId:string;
 admin:boolean;
 profile:CampaignProfile|null;
 playerId:string|null;
 active:boolean;
 passwordChangeRequired:boolean;
 memberships:ScopeMember[];
 fingerprint:string;
};

export function accessScopeFingerprint(scope:Omit<CampaignAccessScope,'fingerprint'>):string{
 const members=[...scope.memberships]
  .map(x=>[x.house_id,x.can_edit,x.can_edit_attributes] as const)
  .sort((a,b)=>a[0].localeCompare(b[0]));
 return JSON.stringify([scope.userId,scope.admin,scope.profile,scope.playerId,
  scope.active,scope.passwordChangeRequired,members]);
}

/** Código técnico seguro (lista fixa do servidor) para o diagnóstico na tela. */
function serverCode(error:unknown):string{
 const code=(error as {serverCode?:unknown}|null)?.serverCode;
 return typeof code==='string'&&/^[a-z_]{3,60}$/.test(code)?' Código: '+code+'.':'';
}
/** Contract: no public roster, other people's IDs, names or correspondence. */
/**
 * Firebase: as cinco leituras do escopo saem juntas num único pedido ao
 * servidor, que confere o token e o escopo no início e no fim do lote.
 * Assim a abertura do Conselho não espera seis idas e voltas em sequência.
 */
async function loadFirebaseAccessScope():Promise<CampaignAccessScope>{
 const uid=firebasePilotAuth()?.current()?.uid;
 if(!uid)throw new Error('Sessão não autorizada.');
 const db=supabase as unknown as SupabaseClient;
 const [userResult,adminResult,profileResultRaw,playerResult,memberResult]=await Promise.all([
  supabase.auth.getUser(),
  supabase.rpc('is_campaign_admin'),
  db.rpc('current_campaign_profile'),
  db.from('campaign_players').select('id,active,require_password_change').eq('user_id',uid).maybeSingle(),
  db.from('house_memberships').select('house_id,can_edit,can_edit_attributes,player_id'),
 ]);
 const user=userResult.data.user;
 if(userResult.error||!user||user.id!==uid)throw new Error('Sessão não autorizada.'+serverCode(userResult.error));
 const admin=adminResult.data;
 if(adminResult.error||typeof admin!=='boolean')throw new Error('Permissões do Narrador indisponíveis.'+serverCode(adminResult.error));
 if(profileResultRaw.error)throw new Error('Perfil de acesso da campanha indisponível.'+serverCode(profileResultRaw.error));
 const raw=profileResultRaw.data;
 const profile:CampaignProfile|null=raw==='jogador'||raw==='editor'||raw==='narrador'?raw:null;
 if((admin&&profile!=='narrador')||(!admin&&profile==='narrador'))
  throw new Error('Perfil e autorização administrativa divergentes.');
 if(playerResult.error)throw new Error('Permissões de jogador indisponíveis.'+serverCode(playerResult.error));
 if(memberResult.error)throw new Error('Vínculos com Casas indisponíveis.'+serverCode(memberResult.error));
 const player=playerResult.data as {id:string;active:boolean;require_password_change:boolean}|null;
 const members=profile==='jogador'&&player?((memberResult.data??[]) as {house_id:string;can_edit:boolean;
  can_edit_attributes:boolean;player_id:string}[]).filter(m=>m.player_id===player.id):[];
 if(firebasePilotAuth()?.current()?.uid!==uid)throw new Error('Identidade alterada durante a verificação dos vínculos.');
 const scope={
  userId:user.id,admin,profile,
  playerId:player?.id??null,
  active:player?.active??false,
  passwordChangeRequired:player?.require_password_change??false,
  memberships:members.map(m=>({house_id:m.house_id,can_edit:m.can_edit,can_edit_attributes:m.can_edit_attributes})),
 };
 return {...scope,fingerprint:accessScopeFingerprint(scope)};
}

export async function loadCampaignAccessScope():Promise<CampaignAccessScope>{
 if(firebaseWorkspaceClient())return loadFirebaseAccessScope();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user)throw new Error('Sessão não autorizada.'+serverCode(userError));
 const {data:admin,error:roleError}=await supabase.rpc('is_campaign_admin');
 if(roleError||typeof admin!=='boolean')throw new Error('Permissões do Narrador indisponíveis.'+serverCode(roleError));
 const {data:profileResult,error:profileError}=await (supabase as unknown as SupabaseClient)
  .rpc('current_campaign_profile');
 if(profileError)throw new Error('Perfil de acesso da campanha indisponível.'+serverCode(profileError));
 const profile:CampaignProfile|null=profileResult==='jogador'||profileResult==='editor'||profileResult==='narrador'?profileResult:null;
 if((admin&&profile!=='narrador')||(!admin&&profile==='narrador'))
  throw new Error('Perfil e autorização administrativa divergentes.');
 const {data:player,error:playerError}=await supabase.from('campaign_players')
  .select('id,active,require_password_change')
  .eq('user_id',user.id).maybeSingle();
 if(playerError)throw new Error('Permissões de jogador indisponíveis.'+serverCode(playerError));
 const {data:members,error:memberError}=profile==='jogador'&&player
  ?await supabase.from('house_memberships')
   .select('house_id,can_edit,can_edit_attributes')
   .eq('player_id',player.id)
  :{data:[],error:null};
 if(memberError)throw new Error('Vínculos com Casas indisponíveis.'+serverCode(memberError));
 // Auth may switch while the three authorized RLS reads are in flight.
 // A second getUser verifies the same identity before exporting any snapshot
 // to React Query; a failed check never reuses old permissions.
 const {data:{user:confirmedUser},error:confirmationError}=await supabase.auth.getUser();
 if(confirmationError||!confirmedUser||confirmedUser.id!==user.id)
  throw new Error('Identidade alterada durante a verificação dos vínculos.');
 const scope={
  userId:user.id,
  admin,
  profile,
  playerId:player?.id??null,
  active:player?.active??false,
  passwordChangeRequired:player?.require_password_change??false,
  memberships:(members??[]).map(m=>({
   house_id:m.house_id,
   can_edit:m.can_edit,
   can_edit_attributes:m.can_edit_attributes,
  })),
 };
 return {...scope,fingerprint:accessScopeFingerprint(scope)};
}

/** Scoped cleanup during membership/permission changes; do not remove our
 * own observed scope query, or polling would restart from a stale fixture.
 * This only controls the browser; server operations are still checked by RLS.
 */
export function clearRevokedAccessCache(
 client:Pick<import('@tanstack/react-query').QueryClient,'removeQueries'>,
):void{
 client.removeQueries({predicate:query=>
  query.queryKey[0]!==CAMPAIGN_ACCESS_SCOPE_KEY[0]});
}


/** Reject a response assembled across two different permission snapshots.
 * Caller must perform a FRESH server read after all async page requests.
 */
export function assertUnchangedAccessScope(
 before:Pick<CampaignAccessScope,'userId'|'fingerprint'>,
 after:Pick<CampaignAccessScope,'userId'|'fingerprint'>,
):void{
 if(before.userId!==after.userId||before.fingerprint!==after.fingerprint)
  throw new Error('Vínculos alterados durante a consulta. Recarregue o acervo.');
}


/** UI preflight for a privileged action. The PostgreSQL RPC MUST independently
 * check is_campaign_admin inside its own transaction; this check does not
 * authorize the mutation and cannot grant access to private rows.
 */
export async function requireFreshNarratorAccess():Promise<void>{
 const {data,error}=await supabase.rpc('is_campaign_admin');
 if(error){
  // A timeout or outage is NOT evidence of demotion. Fail the command
  // closed without claiming the user's role was revoked.
  if(error.code==='42501'||/Somente o Narrador|Apenas o Narrador|Permissão de Narrador revogada/i.test(error.message))
   throw new Error('Permissão de Narrador revogada. Recarregue as autorizações.');
  throw new Error('Permissões do Narrador indisponíveis. A operação foi bloqueada; tente novamente.');
 }
 if(data!==true)
  throw new Error('Permissão de Narrador revogada. Recarregue as autorizações.');
}
