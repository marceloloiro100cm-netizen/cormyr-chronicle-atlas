import {CORE_CATALOG} from './catalog';
import type {CatalogItem} from './types';

export type HouseRuleRevision={definition:CatalogItem;version:number};
/** A regra operacional da Casa prevalece sobre a importada, que prevalece
 * sobre a regra básica. Não altera entradas históricas ou lançamentos. */
export function mergeHouseRuleCatalog(
 archived:CatalogItem[],operational:HouseRuleRevision[],
):CatalogItem[]{
 const historical=archived.filter(row=>row&&typeof row.id==='string');
 const revisions=new Map(operational.map(row=>[row.definition.id,row]));
 const base=CORE_CATALOG.filter(item=>!historical.some(r=>r.id===item.id)&&
  !revisions.has(item.id));
 const previous=historical.filter(item=>!revisions.has(item.id));
 const current=operational.map(row=>({
  ...row.definition,operationalRuleVersion:row.version,
 } as CatalogItem));
 return [...base,...previous,...current];
}
