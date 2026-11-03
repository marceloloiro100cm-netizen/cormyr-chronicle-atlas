/** Stable partition: acquired/building holdings first, preserving the existing
 * catalogue order inside both purchased and unpurchased groups.
 * Does not change ids, groups, prices, filters, or historical purchase data.
 */
export function acquiredFirst<T extends {id:string}>(
 items:readonly T[],acquiredItemIds:ReadonlySet<string>,
):T[]{
 return items.map((item,index)=>({item,index})).sort((a,b)=>
  Number(acquiredItemIds.has(b.item.id))-Number(acquiredItemIds.has(a.item.id))
  ||a.index-b.index).map(({item})=>item);
}
