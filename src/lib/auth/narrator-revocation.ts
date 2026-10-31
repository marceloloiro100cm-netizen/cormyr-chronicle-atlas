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
