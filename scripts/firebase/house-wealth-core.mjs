/**
 * Shared arithmetic of a noble house's permanent Wealth (SQL 0092, 0100, 0117):
 * conservative available Wealth and the jsonb_set(create_missing=false) write.
 * No I/O.
 */
const REGION_WEALTH={crownlands:10,veilstone:15,shieldmark:10,helmlands:5,horselands:15,dragoncoast:20,
  swordmarch:15,swordmark:15,ferlin:10,stonelands:15,elfhold:15,volkumburgh:10};
export class WealthError extends Error {
  constructor(message){super(message);this.name='WealthError';this.code='invalid';}
}
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>v==null?null:typeof v==='object'?JSON.stringify(v):String(v);
export const wealthInt=v=>{
  if(v==null)return null;
  const t=String(v).trim();
  if(!/^[+-]?\d+$/.test(t))throw new WealthError('Valor de Riqueza inválido na ficha');
  return Number(t);
};
const arr=v=>Array.isArray(v)?v:[];
const allocated=h=>{
  const ac=h&&h.allocatedCosts;
  if(isObj(ac)&&'wealth' in ac)return wealthInt(ac.wealth)??0;
  return arr(h&&h.costs).reduce((s,c)=>s+(c&&c.resource==='wealth'&&c.mode==='allocation'?(wealthInt(c.amount)??0):0),0);
};
/** Conservative available Wealth (same arithmetic as the SQL of 0092/0117). */
export function wealthAvailable(state){
  const region=state.regionalApplied===true||text(state.regionalApplied)==='true'
    ?(text(state.method)!==null&&text(state.method)!=='import'
      ?REGION_WEALTH[String(state.identity&&state.identity.region||'').replace(/ /g,'').toLowerCase()]||0:0):0;
  const consequences=arr(state.mailConsequences).filter(m=>m&&text(m.active)==='true')
    .reduce((s,m)=>s+(wealthInt(m.changes&&m.changes.wealth)??0),0);
  const holdings=arr(state.holdings);
  const alloc=holdings.filter(h=>h&&['active','building'].includes(h.status)).reduce((s,h)=>s+allocated(h),0);
  const units=arr(state.units).filter(u=>u&&(text(u.destroyed)??'false')!=='true').reduce((s,u)=>s+allocated(u),0);
  const destroyed=holdings.filter(h=>h&&h.status==='destroyed'&&(text(h.lostAllocation)??'false')!=='true')
    .reduce((s,h)=>s+allocated(h),0);
  const oldPerm=wealthInt(state.permanent&&state.permanent.wealth)??0;
  const total=(wealthInt(state.base&&state.base.wealth)??0)+oldPerm+region+consequences;
  return {available:total-alloc-units-destroyed,oldPerm};
}
/** jsonb_set(...,create_missing=false): only an existing key is replaced. */
export const setPermanentWealth=(state,value)=>
  isObj(state.permanent)&&'wealth' in state.permanent
    ?{...state,permanent:{...state.permanent,wealth:value}}:state;

