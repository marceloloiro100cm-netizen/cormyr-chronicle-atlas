import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {emptySpyAssetRegistry,reconcileNetworkCells,reconcileContractedAgents,registerSpyLocalContact,validateSpyAssignment,assignSpyAsset,previewLegacySpyNotes,previewSpyContractorEnrollment} from '@/lib/espionage/assets';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const gm={isNarrator:true as const,actorId:'gm',reason:'Conciliação de posse e domínio aprovada'};
function house(){
 const s=newHouseState('evenhand','helmlands');
 s.domains=[{id:ids[3]!,name:'Arabel',terrain:'plains',features:[],notes:''}];
 const holding=(id:string,itemId:string,parentId?:string):Holding=>({id,itemId,name:itemId,domainId:ids[3]!,parentId,costs:[],effects:[],ruleVersion:'1',source:'Prosperidade',status:'active'});
 s.holdings=[holding(ids[0]!,'pros-spy-network'),holding(ids[1]!,'pros-spy-network--expanded-network',ids[0]!)];
 return s;
}
const location={id:ids[4]!,kind:'domain' as const,refId:ids[3]!,name:'Arabel',regionId:'helmlands',visibility:'narrator' as const,approved:true,version:1,source:'Domínio confirmado pelo Narrador'};
describe('Espionagem · Lote 5 ativos',()=>{
 it('rede base e contratação avulsa geram capacidade só com compra comprovada',()=>{
  const s=house();const registry=emptySpyAssetRegistry(s.houseId);
  const base=reconcileNetworkCells({state:s,registry,locations:[location],proposedIds:{
   ['base:'+ids[0]+':0']:ids[2]!,
  },review:gm,expectedVersion:1});
  expect(base.created).toHaveLength(1);
  expect(base.created[0]?.sourceRef).toBe('base:'+ids[0]+':0');
  const batch={id:ids[1]!,ownerHouseId:s.houseId,sourceDomainId:ids[3]!,
   operationKey:ids[5]!,version:1,rulesVersion:'CCA-ESP-MVP-001:v1',
   status:'active' as const,cost:{resource:'wealth' as const,amount:5 as const,mode:'allocation' as const}};
  expect(()=>reconcileContractedAgents({state:s,registry:base.next,batches:[batch],
   verifiedOperationKeys:[],locations:[location],proposedIds:{},review:gm,expectedVersion:base.next.version})).toThrow('sem registro financeiro');
  const args={state:s,registry:base.next,batches:[batch],verifiedOperationKeys:[ids[5]!],
   locations:[location],proposedIds:{['contractor:'+ids[1]+':0']:ids[4]!,['contractor:'+ids[1]+':1']:ids[5]!},
   review:gm,expectedVersion:base.next.version};
  const enrolled=reconcileContractedAgents(args);
  expect(enrolled.created).toHaveLength(2);
  expect(reconcileContractedAgents({...args,registry:enrolled.next,expectedVersion:enrolled.next.version}).created).toHaveLength(0);
 });
 it('reconcilia dois slots uma vez; retry não duplica; posse desativada não produz',()=>{
  const s=house();const original=emptySpyAssetRegistry(s.houseId);
  const proposedIds={['expanded:'+ids[1]+':0']:ids[2]!,['expanded:'+ids[1]+':1']:ids[5]!};
  const first=reconcileNetworkCells({state:s,registry:original,locations:[location],proposedIds,review:gm,expectedVersion:1});
  expect(first.created).toHaveLength(2);expect(first.pendingSlots).toContain('base:'+ids[0]+':0');expect(first.next.assets).toHaveLength(2);
  const retry=reconcileNetworkCells({state:s,registry:first.next,locations:[location],proposedIds,review:gm,expectedVersion:first.next.version});
  expect(retry.created).toHaveLength(0);expect(retry.next.assets).toHaveLength(2);
  s.holdings[0]!.status='building';
  const inactive=reconcileNetworkCells({state:s,registry:first.next,locations:[location],proposedIds,review:gm,expectedVersion:first.next.version});
  expect(inactive.created).toHaveLength(0);expect(inactive.unverifiedAssets).toHaveLength(2);
 });
 it('não gera células por caderno narratorial ou tarifa ausente',()=>{
  const s=house();const registry=emptySpyAssetRegistry(s.houseId);
  const preview=previewLegacySpyNotes(['Célula Antiga',' Célula Incerta '],registry);
  expect(preview.unresolved).toHaveLength(2);expect(preview.operationalAssetsCreated).toBe(0);
  expect(previewSpyContractorEnrollment(s).assetCreated).toBe(false);
 });
 it('recusa alocação simultânea e contatos sem origem comprovada',()=>{
  const s=house(),registry=emptySpyAssetRegistry(s.houseId);
  expect(()=>registerSpyLocalContact({state:s,registry,location,holdingId:ids[0]!,assetId:ids[2]!,codeName:'Contato',review:gm,expectedVersion:1})).toThrow();
  const cell=reconcileNetworkCells({state:s,registry,locations:[location],proposedIds:{['expanded:'+ids[1]+':0']:ids[2]!},review:gm,expectedVersion:1}).next;
  const assigned=assignSpyAsset(cell,ids[2]!,[],cell.version);
  expect(validateSpyAssignment(assigned.assets[0]!,[],s.houseId).allowed).toBe(false);
  expect(()=>assignSpyAsset(assigned,ids[2]!,[],assigned.version)).toThrow();
 });
});