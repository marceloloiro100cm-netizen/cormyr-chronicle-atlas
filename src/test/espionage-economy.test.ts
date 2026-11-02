import {describe,it,expect} from 'vitest';
import {newHouseState,type Holding} from '@/lib/house/types';
import {deriveSpyCapacity,quoteSpyPurchase,quoteSpyContractor} from '@/lib/espionage/economy';
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
 it('contratação só contabiliza uma vez no catálogo, sem ledger paralelo',()=>{
  const s=state();
  const q=quoteSpyContractor(s);
  expect(q.canHire).toBe(true);
  expect(q.cost).toEqual({resource:'wealth',amount:5,mode:'allocation'});
  expect(q.wealthAvailableBefore).toBe(50);
  expect(q.wealthAvailableAfter).toBe(45);
  expect(()=>quoteSpyContractor(s,[{} as never])).toThrow('não podem reservar');
  s.holdings.push(holding(a,'pros-spy-contract-batch','active'));
  expect(quoteSpyContractor(s).wealthAvailableBefore).toBe(45);
  expect(quoteSpyContractor(s).confirmedContractAgents).toBe(2);
  s.holdings.push(holding(b,'pros-spy-contract-batch','active'));
  expect(quoteSpyContractor(s).confirmedContractAgents).toBe(4);
  expect(s.base.wealth).toBe(50);

 });
});