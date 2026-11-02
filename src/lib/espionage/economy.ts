/** CCA-ESP-MVP-001 — regras do Narrador de 02/11/2026. Prévia; nenhuma cobrança fora da RPC da Casa. */
import {z} from 'zod';
import {balances,activeHoldings,quote} from '../house/engine';
import {CORE_CATALOG} from '../house/catalog';
import type {HouseState,CatalogItem} from '../house/types';
import {spyIdSchema,SPY_RULES_VERSION} from './contracts';

export const SPY_HOLDING_IDS=[
 'pros-spy-network','pros-spy-network--expanded-network',
 'pros-spy-network--expert-spies','pros-spy-network--plausible-deniability',
 'pros-dog-kennels--guard-dogs','pros-bailiffs--investigative-training',
 'pros-secret-police','pros-secret-police--special-detachment',
 'pros-street-gangs--eyes-everywhere','pros-tournament-master--herald',
 'pros-minstrel-s-seat','pros-sewer--secret-tunnels',
] as const;
export type SpyHoldingId=(typeof SPY_HOLDING_IDS)[number];
const allowed=new Set<string>(SPY_HOLDING_IDS);
const networkId='pros-spy-network',expandedId='pros-spy-network--expanded-network';
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
 const baseSlots:SpyCapacitySlot[]=networks.map(h=>({
  sourceHoldingId:h.id,sourcePurchaseId:h.id,slot:0,domainId:h.domainId,
  sourceNetworkId:h.id,sourceKind:'base',
 }));
 const expandedSlots:SpyCapacitySlot[]=expanded.flatMap(h=>[0,1].map(slot=>({
  sourceHoldingId:h.id,sourcePurchaseId:h.id,slot,domainId:h.domainId,
  sourceNetworkId:h.parentId!,sourceKind:'expanded' as const,
 })));
 return {activeNetworks:networks.length,confirmedBaseCells:baseSlots.length,
  confirmedExpandedCells:expandedSlots.length,confirmedNetworkCells:baseSlots.length+expandedSlots.length,
  initialCellsUnresolved:false as const,slots:[...baseSlots,...expandedSlots]};
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

export function quoteSpyContractor(state:HouseState,batches:readonly SpyContractBatch[]=[]){
 const verified=batches.map(batch=>spyContractBatchSchema.parse(batch));
 if(verified.some(batch=>batch.ownerHouseId!==state.houseId))
  throw new Error('Contrato de outra Casa não pode afetar o saldo.');
 const ids=new Set(verified.map(b=>b.id)),keys=new Set(verified.map(b=>b.operationKey));
 if(ids.size!==verified.length||keys.size!==verified.length)throw new Error('Contrato duplicado detectado.');
 const active=verified.filter(batch=>batch.status==='active');
 // Reservas avulsas são separadas do catálogo para NÃO alterar o JSON da ficha antiga.
 // Em produção, esta soma deve vir do mesmo ledger transacional e nunca ser subtraída duas vezes.
 const allocated=active.length*SPY_CONTRACT_BATCH_WEALTH;
 const available=balances(state).available.wealth-allocated;
 return {status:available>=SPY_CONTRACT_BATCH_WEALTH?'preview_only' as const:'insufficient_wealth' as const,
  canHire:available>=SPY_CONTRACT_BATCH_WEALTH,wealthAvailableBefore:available,
  wealthAvailableAfter:available-SPY_CONTRACT_BATCH_WEALTH,
  batchesActive:active.length,confirmedContractAgents:active.length*SPY_AGENTS_PER_CONTRACT_BATCH,
  cost:{resource:'wealth' as const,amount:SPY_CONTRACT_BATCH_WEALTH,mode:SPY_CONTRACT_COST_MODE},
  agentsPerPurchase:SPY_AGENTS_PER_CONTRACT_BATCH,repeatable:true,
  contractDurationDays:null,maintenanceWealth:null,automaticExpiry:false,
  rulesVersion:SPY_RULES_VERSION,requiresTransactionalLedger:true as const};
}
