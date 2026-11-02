/** CCA-ESP-MVP-001 — regras do Narrador de 02/11/2026. Prévia; nenhuma cobrança fora da RPC da Casa. */
import {z} from 'zod';
import {balances,activeHoldings,quote} from '../house/engine';
import {CORE_CATALOG} from '../house/catalog';
import type {HouseState,CatalogItem} from '../house/types';
import {spyIdSchema,SPY_RULES_VERSION} from './contracts';

export const SPY_HOLDING_IDS=[
 'pros-spy-network','pros-spy-network--expanded-network','pros-spy-contract-batch',
 'pros-spy-network--expert-spies','pros-spy-network--plausible-deniability',
 'pros-dog-kennels--guard-dogs','pros-bailiffs--investigative-training',
 'pros-secret-police','pros-secret-police--special-detachment',
 'pros-street-gangs--eyes-everywhere','pros-tournament-master--herald',
 'pros-minstrel-s-seat','pros-sewer--secret-tunnels',
] as const;
export type SpyHoldingId=(typeof SPY_HOLDING_IDS)[number];
const allowed=new Set<string>(SPY_HOLDING_IDS);
const networkId='pros-spy-network',expandedId='pros-spy-network--expanded-network',contractId='pros-spy-contract-batch';
export const SPY_BASE_AGENTS_PER_NETWORK=1;
export const SPY_AGENTS_PER_EXPANDED_NETWORK=2;
export const SPY_AGENTS_PER_CONTRACT_BATCH=2;
export const SPY_CONTRACT_BATCH_WEALTH=5;
export const SPY_CONTRACT_COST_MODE='allocation' as const;

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
 return {itemId:item.id,ruleVersion:item.version,price:result.costs,originalPrice:result.original,
  discounts:result.discounts,wealthAvailableBefore:result.before.wealth,
  wealthAvailableAfter:result.after.wealth,errors:result.errors,
  canPurchase:result.errors.length===0,status:result.errors.length?'blocked':'quote_only' as const};
}
export type SpyCapacitySlot={sourceHoldingId:string;sourcePurchaseId:string;slot:number;domainId:string;
 sourceNetworkId:string;sourceKind:'base'|'expanded'};
/** Apenas posses ativas e ancestrais ativos geram vagas; cada Rede base = 1, melhoria ativa = 2. */
export function deriveSpyCapacity(state:HouseState){
 const active=activeHoldings(state);
 const networks=active.filter(h=>h.itemId===networkId);
 const networkIds=new Set(networks.map(h=>h.id));
 const expanded=active.filter(h=>h.itemId===expandedId&&h.parentId&&networkIds.has(h.parentId));
 const contracts=active.filter(h=>h.itemId===contractId);
 const baseSlots:SpyCapacitySlot[]=networks.map(h=>({
  sourceHoldingId:h.id,sourcePurchaseId:h.id,slot:0,domainId:h.domainId,
  sourceNetworkId:h.id,sourceKind:'base',
 }));
 const expandedSlots:SpyCapacitySlot[]=expanded.flatMap(h=>[0,1].map(slot=>({
  sourceHoldingId:h.id,sourcePurchaseId:h.id,slot,domainId:h.domainId,
  sourceNetworkId:h.parentId!,sourceKind:'expanded' as const,
 })));
 const contractorSlots=contracts.flatMap(h=>[0,1].map(slot=>({sourceHoldingId:h.id,sourcePurchaseId:h.id,slot,domainId:h.domainId,sourceKind:'contractor' as const})));
 return {activeNetworks:networks.length,confirmedBaseCells:baseSlots.length,
  confirmedExpandedCells:expandedSlots.length,confirmedNetworkCells:baseSlots.length+expandedSlots.length,
  initialCellsUnresolved:false as const,slots:[...baseSlots,...expandedSlots],
  confirmedContractAgents:contractorSlots.length,contractorSlots};
}

/** Lote 10 fará alocação de 5 Riqueza e inserção atômica com o ledger: nenhum valor aqui é débito.
 * Sem prazo ou manutenção automática: o Narrador não definiu esses parâmetros.
 */
export const spyContractBatchSchema=z.object({
 id:spyIdSchema,ownerHouseId:z.string().min(1).max(100),sourceDomainId:spyIdSchema,
 operationKey:spyIdSchema,version:z.number().int().min(1),rulesVersion:z.string().min(1),
 status:z.enum(['active','ended']),
 cost:z.object({resource:z.literal('wealth'),amount:z.literal(5),mode:z.literal('allocation')}).strict(),
}).strict();
export type SpyContractBatch=z.infer<typeof spyContractBatchSchema>;

/** Fonte única: HouseState.holdings e balances(). Não subtrair de novo
 * `spy_contract_batches` que tenha sido lançado como posse em houseOperation.
 */
export function quoteSpyContractor(state:HouseState,_batches:readonly SpyContractBatch[]=[]){
 if(_batches.length)throw new Error('Contratos externos não podem reservar Riqueza duas vezes. Use a posse canônica.');
 const domainId=state.domains[0]?.id;
 const capacity=deriveSpyCapacity(state);
 if(!domainId)return {status:'missing_domain' as const,canHire:false as const,
  wealthAvailableBefore:balances(state).available.wealth,confirmedContractAgents:capacity.confirmedContractAgents,
  cost:{resource:'wealth' as const,amount:5,mode:'allocation' as const},
  agentsPerPurchase:2,repeatable:true,requiresTransactionalLedger:true as const};
 const item=CORE_CATALOG.find(i=>i.id===contractId);
 if(!item)throw new Error('Lote avulso ausente do catálogo.');
 const q=quote(item,state,domainId);
 return {status:q.errors.length?'blocked' as const:'preview_only' as const,
  canHire:q.errors.length===0,errors:q.errors,wealthAvailableBefore:q.before.wealth,
  wealthAvailableAfter:q.after.wealth,confirmedContractAgents:capacity.confirmedContractAgents,
  cost:{resource:'wealth' as const,amount:5,mode:'allocation' as const},
  agentsPerPurchase:2,repeatable:true,contractDurationDays:null,
  maintenanceWealth:null,automaticExpiry:false,rulesVersion:SPY_RULES_VERSION,
  requiresTransactionalLedger:true as const};
}
