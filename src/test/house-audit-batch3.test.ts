import { describe, it, expect } from 'vitest';
import {newHouseState,RESOURCE_KEYS,type Holding} from '@/lib/house/types';
import {balances, maxHouseStatus, heirHouseStatus, activeHoldings} from '@/lib/house/engine';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {holdingAllocation,legacyCatalogEffects,legacyEffectCandidates,changeHoldingCondition} from '@/lib/house/holding-accounting';
import {houseReport} from '@/lib/house/report';
import {rollPreview} from '@/lib/house/fortune';

const make=()=>{
 const s=newHouseState('isolated-house');s.base.defense=50;s.base.influence=55;
 return s;
};
const holding=(overrides:Partial<Holding>={}):Holding=>({
 id:'tower',itemId:'tower',name:'Torre original',domainId:'dom1',status:'active',
 costs:[{resource:'defense',amount:10,mode:'allocation'}],effects:[],
 source:'Legacy',ruleVersion:'1',category:'fortification',...overrides,
});

describe('Lote 3 — influência e sucessão (itens 11–13)',()=>{
 it('Tabela 6-5 calcula exatamente todos os limites e mudanças de faixa',()=>{
  const examples:[[number,number],...(number[])[]]=[[0,2],[10,2],[11,3],[20,3],[21,4],[40,4],[41,5],[50,5],[51,6],[60,6],[61,7],[70,7],[71,8],[100,8]];
  for(const [influence,status] of examples)expect(maxHouseStatus(influence)).toBe(status);
  expect(maxHouseStatus(NaN)).toThrow;
 });
 it('Status para três ordens de herdeiros segue máximo menos 1,2,3',()=>{
  expect([1,2,3,4].map(n=>heirHouseStatus(55,n))).toEqual([5,4,3,3]);
  expect(()=>heirHouseStatus(55,0)).toThrow('Ordem');
 });
 it('Status depende da Influência total, não da disponível após comprar herdeiros',()=>{
  const s=make();s.holdings.push(holding({id:'first',itemId:'heir-firstborn',category:'personage',
    costs:[{resource:'influence',amount:20,mode:'allocation'}]}));
  const b=balances(s);expect(b.total.influence).toBe(55);expect(b.available.influence).toBe(35);
  expect(maxHouseStatus(b.total.influence)).toBe(6);
 });
 it('todos os três herdeiros já existem no catálogo com seus custos e repetições',()=>{
  for(const [id,cost,repeatable] of [['heir-firstborn',20,false],['heir-second',10,false],['heir-third',5,true]] as const){
   const item=CORE_CATALOG.find(x=>x.id===id);
   expect(item?.category).toBe('personage');expect(item?.costs[0]).toMatchObject({resource:'influence',amount:cost,mode:'allocation'});
   expect(item?.repeatable).toBe(repeatable);
  }
 });
});

describe('Lote 3 — baixas e investimentos (item 14)',()=>{
 it('abandonar, vender ou cancelar libera a alocação, inclusive custos legados',()=>{
  for(const status of ['abandoned','sold','cancelled'] as const){
   const s=make();s.holdings=[holding()];
   const next=changeHoldingCondition(s,'tower',status);
   expect(balances(next).total.defense).toBe(50);
   expect(balances(next).allocated.defense).toBe(0);
   expect(balances(next).available.defense).toBe(50);
   expect(balances(s).available.defense).toBe(40);
  }
 });
 it('destruição transfere alocação para perda permanente sem dar pontos novos',()=>{
  const s=make();s.holdings=[holding()];
  const next=changeHoldingCondition(s,'tower','destroyed');
  expect(next.permanent.defense).toBe(-10);
  expect(next.holdings[0]?.lostAllocation).toBe(true);
  const b=balances(next);expect(b.total.defense).toBe(40);expect(b.allocated.defense).toBe(0);expect(b.available.defense).toBe(40);
  expect(s.permanent.defense).toBe(0);
  expect(()=>changeHoldingCondition(next,'tower','destroyed')).toThrow('já tem esta condição');
  expect(()=>changeHoldingCondition(next,'tower','sold')).toThrow('já foi baixada');
 });
 it('baixa de posse com custo permanente não restitui esse custo',()=>{
  const s=make();s.permanent.wealth=-8;
  s.holdings=[holding({costs:[{resource:'wealth',amount:8,mode:'permanent'},{resource:'defense',amount:10,mode:'allocation'}]})];
  const next=changeHoldingCondition(s,'tower','sold');
  expect(next.permanent.wealth).toBe(-8);expect(balances(next).total.wealth).toBe(-8);
 });
 it('snapshot destruído sem marcador representa perda virtual, sem alterar JSON existente',()=>{
  const s=make();s.holdings=[holding({status:'destroyed'})];
  expect(balances(s).total.defense).toBe(40);
  expect(balances(s).allocated.defense).toBe(0);
  expect(balances(s).available.defense).toBe(40);
  expect(s.permanent.defense).toBe(0);
  expect(s.holdings[0]?.lostAllocation).toBeUndefined();
 });
 it('building mantém committed e respetivo total',()=>{
  const s=make();s.holdings=[holding({status:'building'})];
  expect(balances(s).committed.defense).toBe(10);
  expect(balances(s).allocated.defense).toBe(0);
 });
 it('allocatedCosts históricos prevalecem sobre custos de catálogo',()=>{
  const s=make();s.holdings=[holding({allocatedCosts:{defense:7}})];
  expect(holdingAllocation(s.holdings[0]!).defense).toBe(7);
  expect(changeHoldingCondition(s,'tower','destroyed').permanent.defense).toBe(-7);
 });
});

describe('Lote 3 — benefícios importados (item 15)',()=>{
 it('resolve efeito de defesa legado identificável sem reprecificar',()=>{
  const h=holding();const effects=legacyCatalogEffects(h);
  expect(effects).toEqual(expect.arrayContaining([expect.objectContaining({kind:'defensive',amount:3})]));
  expect(h.effects).toEqual([]);expect(h.costs[0]?.amount).toBe(10);
 });
 it('não inventa benefícios para itens sem fonte ou catalogação segura',()=>{
  expect(legacyCatalogEffects(holding({source:'Personalização'}))).toEqual([]);
  expect(legacyCatalogEffects(holding({itemId:'unmapped-legacy'}))).toEqual([]);
  const custom=holding({effects:[{kind:'action',description:'Efeito específico do Narrador'}]});
  expect(legacyCatalogEffects(custom)).toEqual(custom.effects);
 });
 it('ativa benefícios somente de posse ativa e impede duplicação após persistência',()=>{
  const s=make();s.holdings=[holding()];
  expect(legacyEffectCandidates(s)).toHaveLength(1);
  expect(activeHoldings(s)[0]?.effects[0]).toMatchObject({kind:'defensive'});
  s.holdings[0]!.effects=legacyCatalogEffects(s.holdings[0]!);
  expect(legacyEffectCandidates(s)).toHaveLength(0);
  expect(activeHoldings(s)[0]?.effects).toHaveLength(1);
  s.holdings[0]!.status='destroyed';
  expect(activeHoldings(s)).toHaveLength(0);
 });
 it('PDF/Excel recebe benefícios de origem legada sem alterar o snapshot',()=>{
  const s=make();s.holdings=[holding()];
  const benefits=houseReport(s,'Casa Teste',CORE_CATALOG).find(x=>x.title==='Benefícios');
  expect(benefits?.rows.some(row=>row[0]==='Torre original'&&String(row[2]).includes('Defesa'))).toBe(true);
  expect(s.holdings[0]!.effects).toEqual([]);
 });
});
