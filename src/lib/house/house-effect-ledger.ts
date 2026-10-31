import {CORE_CATALOG} from './catalog';
import {activeHoldings} from './engine';
import {stackingBonus} from './stacking';
import {RESOURCE_KEYS,zeroResources,type Effect,type HouseState,type Resource,type Resources} from './types';

/** A calculated view of persisted Holding.effects; no second, potentially stale balance is stored. */
export type HouseEffectSource={
 holdingId:string;itemId:string;holdingName:string;domainId:string;effectIndex:number;effect:Effect;
};
export type HouseEffectLedger={
 sources:HouseEffectSource[];
 /** Raw additive points. Prosperidade's stacking dice are applied only at the actual event. */
 raw:{fortune:number;gain:Resources;mitigation:Resources};
 /** A specific downside whose source is an action effect, not a numeric mitigation. */
 specialRules:{extraLawLossOnFortune:number};
 /** Active historical holdings that have no saved effect snapshot but whose catalog has numeric effects. */
 unreconciled:{holdingId:string;itemId:string;name:string}[];
};

/**
 * Source-of-truth: saved costs and effect snapshots in HouseState.holdings.
 * This pure selector recalculates for each consumer, respecting status, parent,
 * season and max-resource restrictions through activeHoldings().
 * Does not apply "action" rules as invented resource modifiers.
 */
export function houseEffectLedger(state:HouseState):HouseEffectLedger{
 const holdings=activeHoldings(state),sources:HouseEffectSource[]=[];
 const raw={fortune:0,gain:zeroResources(),mitigation:zeroResources()};
 for(const h of holdings){
  h.effects.forEach((effect,effectIndex)=>{
   sources.push({holdingId:h.id,itemId:h.itemId,holdingName:h.name,domainId:h.domainId,effectIndex,effect});
   const amount=effect.amount??0;
   if(effect.kind==='fortune')raw.fortune+=amount;
   if(effect.kind==='gain'&&effect.resource)raw.gain[effect.resource]+=amount;
   if(effect.kind==='mitigation'&&effect.resource)raw.mitigation[effect.resource]+=amount;
  });
 }
 const unreconciled=holdings.filter(h=>h.effects.length===0&&
  CORE_CATALOG.some(item=>item.id===h.itemId&&item.effects.some(e=>['fortune','gain','mitigation'].includes(e.kind))))
  .map(h=>({holdingId:h.id,itemId:h.itemId,name:h.name}));
 return {sources,raw,
  // The source says Law losses from House Fortune increase by 1; never
  // multiply this narrative penalty across several districts without a ruling.
  specialRules:{extraLawLossOnFortune:holdings.some(h=>h.itemId==='pros-street-gangs')?1:0},
  unreconciled
 };
}

/** Resolves Prosperidade stacking using recorded dice; does not silently grant raw summed points. */
export function resolveHouseNumericBonus(
 ledger:HouseEffectLedger,kind:'fortune'|'gain'|'mitigation',resource?:Resource,dice:number[]=[]
):number{
 if(kind!=='fortune'&&(!resource||!RESOURCE_KEYS.includes(resource)))throw new Error('Escolha o recurso do bônus da Casa.');
 const raw=kind==='fortune'?ledger.raw.fortune:kind==='gain'?ledger.raw.gain[resource!]:ledger.raw.mitigation[resource!];
 return stackingBonus(raw,dice);
}
