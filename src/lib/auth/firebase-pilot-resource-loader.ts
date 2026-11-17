/** Independent optional Firebase Cloud reads after server-verified session.
 * Each service is allowed to fail closed without revoking the verified session
 * or pretending that an unavailable House catalog contains no Houses.
 * This function never falls back to the retired backend.
 */
export type PilotProfile='jogador'|'narrador'|'editor';
export type PilotResourceLoaders<H,C,I,P,M,Q>={
  listHouses:()=>Promise<H[]>;
  getCalendar:()=>Promise<C>;
  listMailbox:()=>Promise<I>;
  listNewspaper:()=>Promise<P>;
  mailStatus:()=>Promise<M>;
  publishingStatus:()=>Promise<Q>;
};

export async function loadFirebasePilotResources<H,C,I,P,M,Q>(
  profile:PilotProfile,
  loaders:PilotResourceLoaders<H,C,I,P,M,Q>,
){
  const optional=async <T,>(fn:()=>Promise<T>):Promise<T|null>=>{
    try{return await fn();}catch{return null;}
  };
  const [rawHouses,calendar,inbox,newspaper,mailStatus,publishing]=
    await Promise.all([
      optional(loaders.listHouses),
      profile==='editor'?Promise.resolve(null):optional(loaders.getCalendar),
      profile==='editor'?Promise.resolve(null):optional(loaders.listMailbox),
      optional(loaders.listNewspaper),
      profile==='editor'?Promise.resolve(null):optional(loaders.mailStatus),
      profile==='jogador'?Promise.resolve(null):optional(loaders.publishingStatus),
    ]);
  return {
    houses:Array.isArray(rawHouses)?rawHouses:[] as H[],
    houseCatalogAvailable:Array.isArray(rawHouses),
    calendar,inbox,newspaper,mailStatus,publishing,
  };
}
