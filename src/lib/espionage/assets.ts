/** CCA-ESP-MVP-001 — Lote 5: cadastro e conciliação PUROS, sem gravação/autorização remota. */
import {spyAssetSchema,spyIdSchema,type SpyAsset,type SpyOperation,type SpyLocation} from './contracts';
import {deriveSpyCapacity,quoteSpyContractor,type SpyContractorTariff} from './economy';
import {activeHoldings} from '../house/engine';
import type {HouseState} from '../house/types';

export type SpyAssetRegistry={ownerHouseId:string;assets:SpyAsset[];version:number};
export type SpyAssetReview={isNarrator:true;actorId:string;reason:string};
const activeOperations=new Set(['planned','traveling','operating','pending_narrator_review','returning']);
function guardReview(review:SpyAssetReview){
 if(review.isNarrator!==true||!review.actorId?.trim()||(review.reason?.trim().length??0)<10)
  throw new Error('Conciliação exige Narrador e justificativa.');
}
function slotKey(holdingId:string,slot:number){return 'expanded:'+holdingId+':'+slot;}
export function emptySpyAssetRegistry(ownerHouseId:string):SpyAssetRegistry{
 if(!ownerHouseId.trim())throw new Error('Casa proprietária obrigatória.');
 return {ownerHouseId,assets:[],version:1};
}
export type SpyAssetsReconciliation={
 created:SpyAsset[];pendingSlots:string[];unverifiedAssets:string[];next:SpyAssetRegistry;
};
/** Os IDs são fornecidos pelo chamador transacional. Não criar ativos a partir da Rede básica ou notas livres. */
export function reconcileNetworkCells(input:{
 state:HouseState;registry:SpyAssetRegistry;locations:readonly SpyLocation[];
 proposedIds:Record<string,string>;review:SpyAssetReview;expectedVersion:number;
}):SpyAssetsReconciliation{
 const {state,registry,locations,proposedIds,review,expectedVersion}=input;
 guardReview(review);
 if(state.houseId!==registry.ownerHouseId)throw new Error('Casa de origem divergente.');
 if(expectedVersion!==registry.version)throw new Error('Versão de agentes desatualizada.');
 const slots=deriveSpyCapacity(state).slots;
 const allowedKeys=new Set(slots.map(s=>slotKey(s.sourceHoldingId,s.slot)));
 const duplicates=new Set(registry.assets.map(a=>a.sourceRef));
 if(duplicates.size!==registry.assets.length)throw new Error('Ativos duplicados por origem; revisão manual obrigatória.');
 const activeIds=new Set(registry.assets.map(a=>a.id));
 const freshIds=new Set<string>();
 const domains=new Map(locations.filter(l=>l.approved&&l.kind==='domain').map(l=>[l.refId,l.id]));
 const created:SpyAsset[]=[],pendingSlots:string[]=[];
 for(const slot of slots){
  const key=slotKey(slot.sourceHoldingId,slot.slot);
  if(duplicates.has(key))continue;
  const id=proposedIds[key];
  const locationId=domains.get(slot.domainId);
  if(!id||!locationId){pendingSlots.push(key);continue;}
  spyIdSchema.parse(id);
  if(activeIds.has(id)||freshIds.has(id))throw new Error('Identificador de espião repetido.');
  freshIds.add(id);
  created.push(spyAssetSchema.parse({
   id,ownerHouseId:state.houseId,kind:'network_cell',
   label:'Célula '+(slot.slot+1)+' · '+slot.sourceHoldingId.slice(0,8),
   sourceHoldingId:slot.sourceHoldingId,sourcePurchaseId:slot.sourcePurchaseId,sourceRef:key,
   currentLocationId:locationId,status:'available',rulesVersion:'CCA-ESP-MVP-001:v1',version:1,
  }));
 }
 const unverifiedAssets=registry.assets.filter(a=>a.kind==='network_cell'&&!allowedKeys.has(a.sourceRef)).map(a=>a.id);
 return {created,pendingSlots,unverifiedAssets,
  next:{...registry,version:registry.version+(created.length?1:0),assets:[...registry.assets,...created]}};
}
/** Contatos locais exigem posse ativa, localidade aprovada e criação intencional do Narrador. */
export function registerSpyLocalContact(input:{
 state:HouseState;registry:SpyAssetRegistry;location:SpyLocation;holdingId:string;
 assetId:string;codeName:string;review:SpyAssetReview;expectedVersion:number;
}):SpyAssetRegistry{
 guardReview(input.review);
 const {state,registry,location}=input;
 if(state.houseId!==registry.ownerHouseId||input.expectedVersion!==registry.version)throw new Error('Origem ou versão de agente inválida.');
 const holding=activeHoldings(state).find(h=>h.id===input.holdingId);
 if(!holding||!['pros-street-gangs--eyes-everywhere','pros-minstrel-s-seat--speakers-listeners','pros-bailiffs'].includes(holding.itemId))
  throw new Error('Contato requer posse informativa ativa comprovada.');
 if(!location.approved||location.kind==='unknown')throw new Error('Localidade não homologada.');
 if(registry.assets.some(a=>a.id===input.assetId))throw new Error('Identificador de agente duplicado.');
 const asset=spyAssetSchema.parse({id:input.assetId,ownerHouseId:state.houseId,kind:'local_contact',
  label:input.codeName,sourceHoldingId:holding.id,sourceRef:'contact:'+holding.id+':'+input.assetId,
  currentLocationId:location.id,status:'available',rulesVersion:'CCA-ESP-MVP-001:v1',version:1});
 return {...registry,version:registry.version+1,assets:[...registry.assets,asset]};
}
/** Só produz uma INTENÇÃO para transação financeira futura, nunca cria contratado por cotação. */
export function previewSpyContractorEnrollment(state:HouseState,tariff:SpyContractorTariff|null){
 const quote=quoteSpyContractor(state,tariff);
 return {quote,assetCreated:false as const,requiresLedgerTransaction:true as const};
}
export function validateSpyAssignment(asset:SpyAsset,operations:readonly SpyOperation[],ownerHouseId:string){
 const reasons:string[]=[];
 if(asset.ownerHouseId!==ownerHouseId)reasons.push('Agente pertence a outra Casa.');
 if(asset.status!=='available')reasons.push('Agente não disponível.');
 if(!asset.currentLocationId)reasons.push('Localização atual não confirmada.');
 if(operations.some(o=>o.assetId===asset.id&&activeOperations.has(o.status)))reasons.push('Agente já tem operação em andamento.');
 return {allowed:reasons.length===0,reasons};
}
export function assignSpyAsset(registry:SpyAssetRegistry,assetId:string,operations:readonly SpyOperation[],expectedVersion:number):SpyAssetRegistry{
 if(registry.version!==expectedVersion)throw new Error('Versão de agentes desatualizada.');
 const asset=registry.assets.find(a=>a.id===assetId);
 if(!asset)throw new Error('Agente não encontrado.');
 const result=validateSpyAssignment(asset,operations,registry.ownerHouseId);
 if(!result.allowed)throw new Error(result.reasons.join(' '));
 return {...registry,version:registry.version+1,assets:registry.assets.map(a=>a.id===assetId?{...a,status:'assigned',version:a.version+1}:a)};
}
/** Nunca apaga ou publica o caderno `noble_house_gm_notes.secret_state.spyCells`. */
export function previewLegacySpyNotes(legacyNotes:readonly string[],registry:SpyAssetRegistry){
 const entries=legacyNotes.map((text,index)=>({index,text:text.trim()})).filter(x=>x.text);
 return {requiresNarratorReview:true as const,notesPreserved:entries.length,
  unresolved:entries.map(x=>({index:x.index,label:x.text,status:'pending_review' as const})),
  operationalAssetsCreated:0 as const,registeredAssets:registry.assets.length};
}
