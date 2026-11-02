import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {deriveSpyCapacity,quoteSpyPurchase,quoteSpyContractor,spyContractBatchSchema} from '@/lib/espionage/economy';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',d='33333333-3333-4333-8333-333333333333';
const state=()=>{
 const s=newHouseState('evenhand','helmlands');
 s.base.wealth=50;
 s.domains.push({id:d,name:'Arabel',terrain:'plains',features:[],notes:''});
 return s;
};
function holding(id:string,itemId:string,status:Holding['status'],parentId?:string):Holding{
 return {id,itemId,name:itemId,domainId:d,parentId,costs:[],effects:[],ruleVersion:'1',source:'Prosperidade',status};
}
describe('Espionagem · Lote 2 economia e capacidades',()=>{
 it('Rede base ativa concede um agente, melhorias em construção não concedem dois',()=>{
  const s=state();s.holdings=[holding(a,'pros-spy-network','active'),holding(b,'pros-spy-network--expanded-network','building',a)];
  expect(deriveSpyCapacity(s).confirmedBaseCells).toBe(1);
  expect(deriveSpyCapacity(s).confirmedExpandedCells).toBe(0);
  expect(deriveSpyCapacity(s).initialCellsUnresolved).toBe(false);
  s.holdings[1]!.status='active';
  expect(deriveSpyCapacity(s).slots).toHaveLength(3);
  s.holdings[0]!.status='destroyed';
  expect(deriveSpyCapacity(s).slots).toHaveLength(0);
 });
 it('compras reutilizam o motor de cotação e recusam posse fora da lista',()=>{
  const s=state();
  const q=quoteSpyPurchase(s,{itemId:'pros-spy-network',domainId:d});
  expect(q.canPurchase).toBe(true);expect(q.price).toEqual([{resource:'wealth',amount:10,mode:'allocation'}]);
  expect(s.base.wealth).toBe(50);
  expect(()=>quoteSpyPurchase(s,{itemId:'pros-unknown' as never,domainId:d})).toThrow();
 });
 it('contratação avulsa custa 5 Riqueza por dois agentes e é repetível sem débito na prévia',()=>{
  const s=state();
  expect(quoteSpyContractor(s).agentsPerPurchase).toBe(2);
  expect(quoteSpyContractor(s).cost).toEqual({resource:'wealth',amount:5,mode:'allocation'});
  const batch=(id:string,operationKey:string)=>({
   id,ownerHouseId:s.houseId,sourceDomainId:d,operationKey,version:1,
   rulesVersion:'CCA-ESP-MVP-001:v1',status:'active' as const,
   cost:{resource:'wealth' as const,amount:5 as const,mode:'allocation' as const},
  });
  expect(spyContractBatchSchema.safeParse(batch(a,b)).success).toBe(true);
  const batches=Array.from({length:10},(_,i)=>batch(
    (i+1).toString(16).repeat(8)+'-1111-4111-8111-111111111111',
    (i+1).toString(16).repeat(8)+'-2222-4222-8222-222222222222'));
  expect(quoteSpyContractor(s,batches).canHire).toBe(false);
  expect(quoteSpyContractor(s,batches).confirmedContractAgents).toBe(20);
  expect(quoteSpyContractor(s).contractDurationDays).toBe(null);
  expect(s.base.wealth).toBe(50);
 });
});