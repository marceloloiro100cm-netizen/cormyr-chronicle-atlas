import { balances } from './engine';
import { RESOURCE_KEYS, type CatalogItem, type HouseState } from './types';

/** A read-only projection of an already-authorized house state.
 * It never merges the vassal's resources into the suzerain's account. */
export function vassalHouseOverview(state:HouseState,catalog:CatalogItem[]=[]){
 const b=balances(state);
 const categoryOf=(holding:HouseState['holdings'][number])=>
   catalog.find(item=>item.id===holding.itemId)?.category??holding.category??null;
 const active=state.holdings.filter(item=>item.status==='active');
 const fortifications=active.filter(item=>categoryOf(item)==='fortification');
 const economy=active.filter(item=>['estate','settlement','improvement','lifestyle','equipment','personage'].includes(categoryOf(item)??''));
 return {
  resources:RESOURCE_KEYS.map(key=>({key,total:b.total[key],available:b.available[key]})),
  units:state.units.filter(unit=>!unit.destroyed),
  domains:state.domains,
  fortifications,
  economy,
  otherHoldings:active.filter(item=>!fortifications.includes(item)&&!economy.includes(item)),
 };
}
