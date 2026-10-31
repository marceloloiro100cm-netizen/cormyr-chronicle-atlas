import {clearRevokedAccessCache} from './campaign-access-scope';

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
 client:Pick<import('@tanstack/react-query').QueryClient,'removeQueries'>,
):void{
 clearRevokedAccessCache(client);
}
