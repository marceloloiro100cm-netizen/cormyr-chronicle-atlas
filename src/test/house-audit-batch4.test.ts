import {describe,it,expect} from 'vitest';
import {LEGACY_HOUSE_SEEDS} from '@/lib/house/legacy-seeds';
import {balances} from '@/lib/house/engine';
import {legacyCostIssues,reconcileLegacyCosts,previewLegacyCostReconciliation} from '@/lib/house/legacy-cost-reconciliation';
import {newHouseState} from '@/lib/house/types';
import {depositGold,donateGold,donateGlory,spendInfluence,redeemIntrigueBonus,pendingIntrigueBonuses,purchasedFortuneDice} from '@/lib/house/resource-transactions';
import {rollPreview,fortuneLawModifier,fortunePopulationModifier,fortuneModifier} from '@/lib/house/fortune';

describe('item 16 — conciliação seletiva, versionada e sem preços inventados',()=>{
 it('Silversky: mina troca 10 Terras por 10 Riqueza, não altera base ou outras posses',()=>{
  const original=LEGACY_HOUSE_SEEDS.silversky!,before=JSON.stringify(original);
  const preview=previewLegacyCostReconciliation(original,'Casa Silversky');
  expect(preview.issues.map(i=>i.id)).toEqual(['hold-silversky-mine']);
  const result=reconcileLegacyCosts(original,'Casa Silversky',preview.issues.map(i=>i.id));
  expect(result.holdings.find(h=>h.id==='hold-silversky-mine')?.costs).toEqual([{resource:'wealth',amount:10,mode:'allocation'}]);
  expect(balances(result).available.lands).toBe(balances(original).available.lands+10);
  expect(balances(result).available.wealth).toBe(balances(original).available.wealth-10);
  expect(JSON.stringify(original)).toBe(before);
  expect(legacyCostIssues(result,'Silversky')).toHaveLength(0);
 });
 it('Everlost: salão 20 Defesa; equipamento 6 Riqueza como gasto permanente sem herdar bônus de armeiro',()=>{
  const s=LEGACY_HOUSE_SEEDS.everlost!,before=JSON.stringify(s);
  const issues=legacyCostIssues(s,'Everlost');expect(issues.map(i=>i.id)).toEqual(['hold-everlost-hall','hold-everlost-weapons']);
  const next=reconcileLegacyCosts(s,'Everlost',issues.map(i=>i.id));
  expect(next.holdings.find(h=>h.id==='hold-everlost-hall')?.costs[0]).toMatchObject({resource:'defense',amount:20});
  const weapons=next.holdings.find(h=>h.id==='hold-everlost-weapons')!;
  expect(weapons.itemId).toBe('legacy-military-equipment-upgrade');
  expect(weapons.costs).toEqual([{resource:'wealth',amount:6,mode:'permanent'}]);
  expect(weapons.effects).toEqual([]);
  expect(next.permanent.wealth).toBe(s.permanent.wealth-6);
  expect(balances(next).available.defense).toBe(balances(s).available.defense-10);
  expect(balances(next).available.wealth).toBe(balances(s).available.wealth);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('Fewmerry: custos 7 e 5 de Poder; Ashkar Apoio 5, sem mexer nos pontos iniciais',()=>{
  const f=LEGACY_HOUSE_SEEDS.fewmerry!,a=LEGACY_HOUSE_SEEDS.ashkar!;
  const fixed=reconcileLegacyCosts(f,'Fewmerry',legacyCostIssues(f,'Fewmerry').map(i=>i.id));
  expect(fixed.units.find(u=>u.id==='unit-fewmerry-2')?.costs[0]?.amount).toBe(7);
  expect(fixed.units.find(u=>u.id==='unit-fewmerry-3')?.costs[0]?.amount).toBe(5);
  expect(balances(fixed).available.power).toBe(balances(f).available.power);
  expect(fixed.base).toEqual(f.base);
  const ashkar=reconcileLegacyCosts(a,'Ashkar',['unit-ashkar-1']);
  expect(ashkar.units.find(u=>u.id==='unit-ashkar-1')?.costs[0]?.amount).toBe(5);
  expect(balances(ashkar).available.power).toBe(balances(a).available.power+2);
 });
 it('identificadores não pertencentes à Casa e tentativas de corrigir duas vezes são recusados',()=>{
  const s=LEGACY_HOUSE_SEEDS.ashkar!;
  expect(()=>reconcileLegacyCosts(s,'Ashkar',['hold-silversky-mine'])).toThrow('não corresponde');
  expect(()=>reconcileLegacyCosts(s,'Silversky',['unit-ashkar-1'])).toThrow('não corresponde');
  const fixed=reconcileLegacyCosts(s,'Ashkar',['unit-ashkar-1']);
  expect(()=>reconcileLegacyCosts(fixed,'Ashkar',['unit-ashkar-1'])).toThrow('não corresponde');
  expect(()=>reconcileLegacyCosts(s,'Ashkar',['unit-ashkar-1','unit-ashkar-1'])).toThrow('não corresponde');
 });
});

describe('item 17 — moeda, Glória e benefícios por Influência',()=>{
 it('ouro só entra por depósito conferido e doação só consome moedas disponíveis',()=>{
  const s=newHouseState('h');
  expect(()=>donateGold(s,1)).toThrow('Cofre');
  const credited=depositGold(s,450);
  const next=donateGold(credited,2);
  expect(next.treasury).toBe(50);
  expect(next.permanent.wealth).toBe(2);
  expect(s.treasury).toBe(0);
  expect(()=>donateGold(next,1)).toThrow('Cofre');
  expect(()=>depositGold(s,-5)).toThrow('inválida');
  expect(()=>donateGold(credited,0)).toThrow('inválida');
 });
 it('Glória transforma pontos em ganhos permanentes por atributo escolhido',()=>{
  const s=newHouseState('h'),next=donateGlory(s,'power',3);
  expect(next.permanent.power).toBe(3);
  expect(s.permanent.power).toBe(0);
  expect(()=>donateGlory(s,'power',0)).toThrow('inválida');
 });
 it('Sorte exige casa ativa, 5 Influência disponíveis e não permite compra após resolver o mês',()=>{
  const s=newHouseState('h');s.phase='active';s.base.influence=20;
  expect(()=>spendInfluence(newHouseState('h'),'fortune','unique')).toThrow('ativa');
  const next=spendInfluence(s,'fortune','f1');
  expect(next.permanent.influence).toBe(-5);
  expect(balances(next).available.influence).toBe(15);
  expect(purchasedFortuneDice(next)).toBe(1);
  const p=rollPreview(next,{status:3,testDice:[6,5,4,3],bonusDice:[],modifier:0});
  expect(p.kept).toHaveLength(4);
  expect(()=>rollPreview(next,{status:3,testDice:[6,5,4],bonusDice:[],modifier:0})).toThrow('4 dados');
  next.fortunes.push({month:next.month,mode:'alternative',dice:[],bonusDice:[],modifier:0,result:1,outcome:'Crescimento',resource:'wealth',changes:{wealth:1},source:'test'});
  expect(()=>spendInfluence(next,'fortune','f2')).toThrow('já resolvida');
 });
 it('Intriga cria +1B rastreado; resgate único não devolve Influência',()=>{
  const s=newHouseState('h');s.phase='active';s.base.influence=10;
  const paid=spendInfluence(s,'intrigue','benefit-1');
  expect(paid.permanent.influence).toBe(-2);expect(pendingIntrigueBonuses(paid)).toBe(1);
  const used=redeemIntrigueBonus(paid,'benefit-1');
  expect(pendingIntrigueBonuses(used)).toBe(0);
  expect(used.permanent.influence).toBe(-2);
  expect(()=>redeemIntrigueBonus(used,'benefit-1')).toThrow('indisponível');
 });
});
describe('item 18 — modificadores mecânicos de Lei e População',()=>{
 it('exibe componentes da tabela sem contar o modificador duas vezes',()=>{
  expect(fortuneLawModifier(30)).toBe(-2);
  expect(fortunePopulationModifier(35)).toBe(3);
  expect(fortuneModifier(30,35)).toBe(1);
 });
});
