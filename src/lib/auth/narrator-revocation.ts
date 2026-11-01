import {CAMPAIGN_ACCESS_SCOPE_KEY,clearRevokedAccessCache} from './campaign-access-scope';

export const NARRATOR_ACCESS_REVOKED_KEY=['narrator-access-revoked'] as const;
export type NarratorRevocationMarker={revokedAt:number};

/** An existing scope snapshot cannot unlock a panel after revocation. */
export function canReleaseNarratorLock(
 marker:NarratorRevocationMarker,
 scope:{dataUpdatedAt:number;hasData:boolean;isError:boolean;isFetching:boolean},
):boolean{
 return scope.hasData&&!scope.isError&&!scope.isFetching&&scope.dataUpdatedAt>marker.revokedAt;
}


/**
 * A revoked Narrator may still have private temporal data visible from an
 * earlier successful query. A failed mutation must close that view and
 * discard private caches, not only display a toast beside the old data.
 */
export function isNarratorAccessRevoked(error:unknown):boolean{
 if(!error||typeof error!=='object')return false;
 const value=error as {message?:unknown;code?:unknown};
 if(value.code==='42501')return true;
 const message=typeof value.message==='string'?value.message:'';
 return /Permissão de Narrador revogada|Somente o Narrador|Apenas o Narrador|não tem permissão de Narrador|permission denied/i.test(message);
}

/** Never remove the watcher for current access; it is required to recover. */
export function purgeRevokedNarratorCache(
 client:Pick<import('@tanstack/react-query').QueryClient,'removeQueries'|'setQueryData'|'cancelQueries'|'invalidateQueries'>,
):void{
 clearRevokedAccessCache(client);
 // The route-wide lock must be written AFTER clearing private queries.
 client.setQueryData<NarratorRevocationMarker>(NARRATOR_ACCESS_REVOKED_KEY,{revokedAt:Date.now()});
 // Cancel older in-flight scope reads before asking the server for new rights.
 // This never grants a role; an unsuccessful recheck leaves the UI locked.
 void client.cancelQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,exact:true})
  .then(()=>client.invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,exact:true}))
  .catch(()=>{});
}


/** Only explicitly privileged temporal reads may close the Narrator workspace.
 * Public calendar failures and ordinary player queries never trigger this guard.
 */
export const NARRATOR_PRIVATE_QUERY_ROOTS=Object.freeze([
 'campaign-schedule-drafts','campaign-time-preview','house-time-impact',
 'character-age-impact','campaign-time-history','temporal-consumer-dashboard',
 'temporal-release-preflight','noble-character-registry',
 'character-age-dashboard','character-year-transitions','campaign-chronology',
]);
export function isNarratorPrivateQueryKey(key:readonly unknown[]):boolean{
 return typeof key[0]==='string'&&NARRATOR_PRIVATE_QUERY_ROOTS.includes(key[0]);
}

/** Subscribe once per authenticated Narrator workspace. Read errors such as
 * 42501 must purge previously fetched private data as promptly as write errors.
 * The route-wide marker is observed by Players before it mounts any tabs.
 */
export function watchNarratorPrivateReadRevocations(
 client:import('@tanstack/react-query').QueryClient,
):()=>void{
 let stopped=false;
 const check=(query:import('@tanstack/react-query').Query)=>{
  if(stopped||!isNarratorPrivateQueryKey(query.queryKey))return;
  if(query.state.status==='error'&&isNarratorAccessRevoked(query.state.error)){
   if(client.getQueryData(NARRATOR_ACCESS_REVOKED_KEY))return;
   purgeRevokedNarratorCache(client);
  }
 };
 const unsubscribe=client.getQueryCache().subscribe(event=>{
  if(event.type==='updated'&&event.action.type==='error')check(event.query);
 });
 // Covers errors that reached QueryCache before the React effect subscribed.
 for(const query of client.getQueryCache().getAll()){
  check(query);
  if(client.getQueryData(NARRATOR_ACCESS_REVOKED_KEY))break;
 }
 return ()=>{stopped=true;unsubscribe();};
}
