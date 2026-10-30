import { CORE_CATALOG } from './catalog';
import { RESOURCE_KEYS, zeroResources, type Holding, type HouseState, type Resource, type Resources, type Effect } from './types';

/** The recorded allocation is authoritative; never re-price a historic holding. */
export function holdingAllocation(holding: Holding): Resources {
  const amounts=zeroResources();
  if(holding.allocatedCosts){
    for(const resource of RESOURCE_KEYS)amounts[resource]=holding.allocatedCosts[resource]??0;
  }else{
    for(const cost of holding.costs)
      if(cost.mode==='allocation')amounts[cost.resource]+=cost.amount;
  }
  return amounts;
}

/** Known, verbatim catalog benefits for snapshots that explicitly came from legacy import.
 * Never infer effects for custom holdings or alter a purchased historical rule version. */
export function legacyCatalogEffects(holding: Holding): Effect[] {
  if(holding.effects.length||!/^legacy(?:$|\b)/i.test(holding.source.trim()))return holding.effects;
  const item=CORE_CATALOG.find(i=>i.id===holding.itemId);
  return item?.effects??[];
}

export function legacyEffectCandidates(state:HouseState): Holding[] {
  return state.holdings.filter(h=>h.effects.length===0&&legacyCatalogEffects(h).length>0);
}

/** A known legacy destroyed holding with no loss marker has its loss applied virtually,
 * so old saved JSON is not silently modified and the invested points aren't refunded. */
export function legacyDestroyedLosses(state: HouseState):Resources {
  const lost=zeroResources();
  for(const holding of state.holdings){
    if(holding.status!=='destroyed'||holding.lostAllocation)continue;
    const costs=holdingAllocation(holding);
    for(const resource of RESOURCE_KEYS)lost[resource]+=costs[resource];
  }
  return lost;
}

export type Condition='destroyed'|'abandoned'|'sold'|'cancelled';
export function changeHoldingCondition(state:HouseState,id:string,status:Condition):HouseState {
  const current=state.holdings.find(h=>h.id===id);
  if(!current)throw new Error('Posse não encontrada.');
  if(current.status===status)throw new Error('A posse já tem esta condição; nenhuma perda será reaplicada.');
  if(!['active','building'].includes(current.status))
    throw new Error('A posse já foi baixada; recuperar ou alterar a baixa exige conciliação do Narrador.');
  const next=structuredClone(state),holding=next.holdings.find(h=>h.id===id)!;
  if(status==='destroyed'){
    if(!holding.lostAllocation){
      const amounts=holdingAllocation(holding);
      for(const resource of RESOURCE_KEYS)next.permanent[resource]-=amounts[resource];
    }
    holding.lostAllocation=true;
  }
  holding.status=status;
  // Never undo the permanent cost component of purchased items.
  return next;
}
