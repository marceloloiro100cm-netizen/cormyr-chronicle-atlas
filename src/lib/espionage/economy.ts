/** CCA-ESP-MVP-001 — Lote 2: somente leitura/cotação. Nunca escreve saldo. */
import {z} from 'zod';
import {balances,activeHoldings,quote} from '../house/engine';
import {CORE_CATALOG} from '../house/catalog';
import type {HouseState,CatalogItem} from '../house/types';
import {spyIdSchema} from './contracts';

export const SPY_HOLDING_IDS = [
 'pros-spy-network','pros-spy-network--expanded-network',
 'pros-spy-network--expert-spies','pros-spy-network--plausible-deniability',
 'pros-dog-kennels--guard-dogs','pros-bailiffs--investigative-training',
 'pros-secret-police','pros-secret-police--special-detachment',
 'pros-street-gangs--eyes-everywhere','pros-tournament-master--herald',
 'pros-minstrel-s-seat','pros-sewer--secret-tunnels',
] as const;
export type SpyHoldingId=typeof SPY_HOLDING_IDS[number];
const allowed=new Set<string>(SPY_HOLDING_IDS);
const networkId='pros-spy-network',expandedId='pros-spy-network--expanded-network';
export function spyCatalog(catalog:CatalogItem[]=CORE_CATALOG):CatalogItem[]{
 return catalog.filter(item=>allowed.has(item.id));
}
export function quoteSpyPurchase(state:HouseState,request:{
 itemId:SpyHoldingId;domainId:string;parentId?:string;supportId?:string;
},catalog:CatalogItem[]=CORE_CATALOG){
 if(!allowed.has(request.itemId))throw new Error('Posse não pertence ao módulo de espionagem.');
 const item=catalog.find(x=>x.id===request.itemId);
 if(!item)throw new Error('Posse não encontrada no catálogo da Casa.');
 const result=quote(item,state,request.domainId,request.parentId,request.supportId);
 return {itemId:item.id,ruleVersion:item.version,price:result.costs,
   originalPrice:result.original,discounts:result.discounts,
   wealthAvailableBefore:result.before.wealth,wealthAvailableAfter:result.after.wealth,
   errors:result.errors,canPurchase:result.errors.length===0,
   status:result.errors.length?'blocked':'quote_only' as const};
}
/** A Rede base tem células iniciais NÃO CONFIRMADAS; zero é só o piso comprovado das melhorias. */
export function deriveSpyCapacity(state:HouseState){
 const active=activeHoldings(state);
 const networks=active.filter(h=>h.itemId===networkId);
 const networkIds=new Set(networks.map(h=>h.id));
 const expanded=active.filter(h=>h.itemId===expandedId&&h.parentId&&networkIds.has(h.parentId));
 const cells=expanded.flatMap(h=>[0,1].map(slot=>({
  sourceHoldingId:h.id,sourcePurchaseId:h.id,slot,domainId:h.domainId,
  sourceNetworkId:h.parentId!,
 })));
 return {
  activeNetworks:networks.length,
  confirmedExpandedCells:cells.length,
  initialCellsUnresolved:true as const,
  slots:cells,
  availableContractorsUnresolved:true as const,
 };
}
export const spyContractorTariffSchema = z.object({
 id:spyIdSchema,rulesVersion:z.string().min(1),approvedByNarrator:z.string().min(1),
 approvedAt:z.string().min(1),hiringWealth:z.number().int().nonnegative().max(10000),
 hiringMode:z.enum(['allocation','permanent']),
 durationDays:z.number().int().positive().max(3650),
 maintenanceWealth:z.number().int().nonnegative().max(10000).nullable(),
 maintenancePeriodDays:z.number().int().positive().nullable(),
}).strict().superRefine((v,ctx)=>{
 if((v.maintenanceWealth===null)!==(v.maintenancePeriodDays===null))
  ctx.addIssue({code:'custom',message:'Manutenção exige custo e periodicidade completos'});
});
export type SpyContractorTariff=z.infer<typeof spyContractorTariffSchema>;

/** Prévia financeira, sem mutação nem reserva paralela. Backend transacional no Lote 10. */
export function quoteSpyContractor(state:HouseState,tariff:unknown){
 if(!tariff)return {status:'pending_narrator_tariff' as const,canHire:false as const};
 const parsed=spyContractorTariffSchema.safeParse(tariff);
 if(!parsed.success)return {status:'invalid_narrator_tariff' as const,canHire:false as const};
 const balance=balances(state);
 const t=parsed.data;
 if(balance.available.wealth<t.hiringWealth)
  return {status:'insufficient_wealth' as const,canHire:false as const,tariffId:t.id,
   wealthAvailable:balance.available.wealth,hiringWealth:t.hiringWealth,hiringMode:t.hiringMode};
 return {status:'preview_only' as const,canHire:true as const,tariffId:t.id,ruleVersion:t.rulesVersion,
  wealthAvailable:balance.available.wealth,hiringWealth:t.hiringWealth,hiringMode:t.hiringMode,
  projectedWealthAvailable:balance.available.wealth-t.hiringWealth,
  durationDays:t.durationDays,maintenanceWealth:t.maintenanceWealth,maintenancePeriodDays:t.maintenancePeriodDays};
}
