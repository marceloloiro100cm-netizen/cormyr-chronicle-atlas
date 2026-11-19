import {CORE_CATALOG} from './catalog';
import type {CatalogItem} from './types';

export type HouseRuleRevision={definition:CatalogItem;version:number};
/** A regra operacional da Casa prevalece sobre a importada, que prevalece
 * sobre a regra básica. Não altera entradas históricas ou lançamentos. */
export function mergeHouseRuleCatalog(
 archived:CatalogItem[],operational:HouseRuleRevision[],
):CatalogItem[]{
 const merged=new Map<string,CatalogItem>();
 for(const rule of CORE_CATALOG)merged.set(rule.id,rule);
 for(const rule of archived)merged.set(rule.id,rule);
 for(const row of operational)merged.set(row.definition.id,{
  ...row.definition,operationalRuleVersion:row.version,
 } as CatalogItem);
 return [...merged.values()];
}
