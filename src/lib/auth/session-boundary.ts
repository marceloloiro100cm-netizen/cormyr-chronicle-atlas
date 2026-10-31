/**
 * Hub Temporal · Lote 26: separação entre identidades na mesma aba.
 *
 * O cache React Query pode conter missivas, fichas, prévias do Narrador e
 * projeções da data canônica. Invalidate não remove dados antigos; ao trocar
 * de usuário é obrigatório cancelá-los e limpar TODO o cache, não só o relógio.
 *
 * Esta função só classifica eventos locais de autenticação. Não altera
 * permissões Supabase, tokens, roles, RLS ou a data da campanha.
 */
export type AuthIdentityEvent =
 'INITIAL_SESSION'|'SIGNED_IN'|'SIGNED_OUT'|'USER_UPDATED'|'TOKEN_REFRESHED';

export type SessionBoundaryDecision={
 userId:string|null;
 clearPrivateCache:boolean;
 remountPrivateScreens:boolean;
 clearSelectedHouse:boolean;
 recheckRoute:boolean;
 reason:'initial'|'same_user'|'identity_changed'|'signed_out'|'user_updated'|'ignored';
};

const normalizedUser=(value:string|null|undefined)=>
 typeof value==='string'&&value.length>0?value:null;

export function decideSessionBoundary(
 previousUserId:string|null|undefined,
 event:string,
 receivedUserId:string|null|undefined,
):SessionBoundaryDecision{
 const next=event==='SIGNED_OUT'?null:normalizedUser(receivedUserId);
 const previous=previousUserId===undefined?undefined:normalizedUser(previousUserId);
 const ignore=(reason:SessionBoundaryDecision['reason']):SessionBoundaryDecision=>({
  userId:previous??null,clearPrivateCache:false,remountPrivateScreens:false,
  clearSelectedHouse:false,recheckRoute:false,reason,
 });
 if(!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','USER_UPDATED','TOKEN_REFRESHED'].includes(event))
  return ignore('ignored');

 // Fresh boot has a new QueryClient and no previous rendered identity.
 if(event==='INITIAL_SESSION'&&previous===undefined){
  return {userId:next,clearPrivateCache:false,remountPrivateScreens:false,
   clearSelectedHouse:false,recheckRoute:true,reason:'initial'};
 }
 if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&!next)){
  return {userId:null,clearPrivateCache:true,remountPrivateScreens:true,
   clearSelectedHouse:true,recheckRoute:true,reason:'signed_out'};
 }
 if(previous!==undefined&&previous!==next){
  return {userId:next,clearPrivateCache:true,remountPrivateScreens:true,
   clearSelectedHouse:previous!==null,recheckRoute:true,reason:'identity_changed'};
 }
 // A role/user record may have been changed by an administrator.
 if(event==='USER_UPDATED'){
  return {userId:next,clearPrivateCache:true,remountPrivateScreens:true,
   clearSelectedHouse:false,recheckRoute:true,reason:'user_updated'};
 }
 if(previous===undefined){
  // Login before INITIAL_SESSION: don't trust potentially hydrated queries.
  return {userId:next,clearPrivateCache:true,remountPrivateScreens:true,
   clearSelectedHouse:false,recheckRoute:true,reason:'identity_changed'};
 }
 return ignore('same_user');
}

/**
 * Security-sensitive cache reset is synchronous. QueryClient.clear cancels
 * outstanding queries and removes *all* cached data, not just invalidation
 * markers; caller remounts the private route subtree immediately thereafter.
 */
export function clearSessionQueryCache(
 cache:Pick<import('@tanstack/react-query').QueryClient,'clear'>,
):void{
 cache.clear();
}
