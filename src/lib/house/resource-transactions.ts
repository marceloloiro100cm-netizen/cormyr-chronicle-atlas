import { balances } from './engine';
import { RESOURCE_KEYS, type HouseState, type Resource } from './types';

export type InfluenceBenefit={id:string;month:number;kind:'fortune'|'intrigue';redeemed?:boolean|undefined};
export function purchasedFortuneDice(state:HouseState):number {
 return (state.influenceBenefits??[]).filter(x=>x.kind==='fortune'&&x.month===state.month).length;
}
export function pendingIntrigueBonuses(state:HouseState):number {
 return (state.influenceBenefits??[]).filter(x=>x.kind==='intrigue'&&!x.redeemed).length;
}
export function depositGold(state:HouseState,coins:number):HouseState {
 if(!Number.isSafeInteger(coins)||coins<=0||coins>1_000_000)throw new Error('Quantia inválida para lançamento de ouro.');
 const next=structuredClone(state);
 next.treasury=(state.treasury??0)+coins;
 if(!Number.isSafeInteger(next.treasury))throw new Error('Saldo de ouro inválido.');
 return next;
}
export function donateGold(state:HouseState,points:number):HouseState {
 if(!Number.isSafeInteger(points)||points<1||points>10000)throw new Error('Quantidade inválida para doar ouro.');
 const cost=points*200;
 if((state.treasury??0)<cost)throw new Error('Cofre sem moedas suficientes para doar 200 DO por ponto de Riqueza.');
 const next=structuredClone(state);
 next.treasury=(state.treasury??0)-cost;
 next.permanent.wealth+=points;
 return next;
}
/** Glory is held by characters, outside the House sheet.
 * This action MUST be approved by the Narrator against an identified source. */
export function donateGlory(state:HouseState,resource:Resource,points:number):HouseState {
 if(!RESOURCE_KEYS.includes(resource)||!Number.isSafeInteger(points)||points<1||points>100)
  throw new Error('Doação de Glória inválida.');
 const next=structuredClone(state);next.permanent[resource]+=points;return next;
}
export function spendInfluence(state:HouseState,kind:'fortune'|'intrigue',id:string):HouseState {
 if(state.phase!=='active')throw new Error('A Casa precisa estar em campanha.');
 const cost=kind==='fortune'?5:2;
 if(balances(state).available.influence<cost)throw new Error('Influência disponível insuficiente.');
 if(kind==='fortune'&&state.fortunes.some(f=>f.month===state.month))
  throw new Error('Sorte do mês já resolvida; não é possível comprar dados retroativamente.');
 if((state.influenceBenefits??[]).some(x=>x.id===id))throw new Error('Benefício já registrado.');
 const next=structuredClone(state);
 next.permanent.influence-=cost;
 next.influenceBenefits=[...(next.influenceBenefits??[]),{id,month:state.month,kind}];
 return next;
}
export function redeemIntrigueBonus(state:HouseState,id:string):HouseState {
 const next=structuredClone(state);
 const benefit=next.influenceBenefits?.find(x=>x.id===id&&x.kind==='intrigue'&&!x.redeemed);
 if(!benefit)throw new Error('Bônus de Intriga indisponível ou já utilizado.');
 benefit.redeemed=true;return next;
}
