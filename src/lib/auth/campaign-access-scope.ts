import {supabase} from '@/integrations/supabase/client';

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
 return JSON.stringify([scope.userId,scope.admin,scope.playerId,
  scope.active,scope.passwordChangeRequired,members]);
}

/** Contract: no public roster, other people's IDs, names or correspondence. */
export async function loadCampaignAccessScope():Promise<CampaignAccessScope>{
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user)throw new Error('Sessão não autorizada.');
 const {data:admin,error:roleError}=await supabase.rpc('is_campaign_admin');
 if(roleError||typeof admin!=='boolean')throw new Error('Permissões do Narrador indisponíveis.');
 const {data:player,error:playerError}=await supabase.from('campaign_players')
  .select('id,active,require_password_change')
  .eq('user_id',user.id).maybeSingle();
 if(playerError)throw new Error('Permissões de jogador indisponíveis.');
 const {data:members,error:memberError}=player
  ?await supabase.from('house_memberships')
   .select('house_id,can_edit,can_edit_attributes')
   .eq('player_id',player.id)
  :{data:[],error:null};
 if(memberError)throw new Error('Vínculos com Casas indisponíveis.');
 const scope={
  userId:user.id,
  admin,
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
