import {describe,it,expect} from 'vitest';
import {fortuneOutcome,fortuneModifier,rollPreview,confirmFortune,convertResources} from '@/lib/house/fortune';
import {newHouseState,zeroResources} from '@/lib/house/types';
describe('Sorte e conversões do livro',()=>{
 it('tabela6-18 não linear distingue5 desastre e6 crescimento',()=>{expect(fortuneOutcome(5)).toBe('Desastre');expect(fortuneOutcome(6)).toBe('Crescimento');expect(fortuneOutcome(12)).toBe('Dádiva');expect(fortuneOutcome(42)).toBe('Dádiva');});
 it('Lei30 Pop10 dão penalidade7 sem reduzir recursos',()=>{const s=newHouseState('isolated');s.base.law=30;s.base.population=10;expect(fortuneModifier(30,10)).toBe(-7);expect(s.base.law).toBe(30);expect(s.base.population).toBe(10);});
 it('dados bônus mantêm melhores3 de4',()=>{const s=newHouseState('isolated');s.base.law=50;s.base.population=20;expect(rollPreview(s,{status:3,testDice:[1,4,5],bonusDice:[6],modifier:0}).kept).toEqual([6,5,4]);});
 it('uma confirmação de Sorte por mês',()=>{const s=newHouseState('isolated');s.base.law=50;s.base.population=20;const args={status:1,testDice:[6],bonusDice:[],modifier:0,resource:'wealth' as const,changes:{...zeroResources(),wealth:1},justification:'Decisão isolada'};const n=confirmFortune(s,args);expect(n.permanent.wealth).toBe(1);expect(()=>confirmFortune(n,args)).toThrow('já');});
 it('Defesa não tem conversão universal',()=>{expect(()=>convertResources(newHouseState('isolated'),'defense','wealth',1,false)).toThrow('não permitida');});
 it('Riqueza2 para Defesa1 normal',()=>{const s=newHouseState('isolated');s.base.wealth=10;const n=convertResources(s,'wealth','defense',1,false);expect(n.permanent.wealth).toBe(-2);expect(n.permanent.defense).toBe(1);});
 it('segunda conversão apressada e máximo2',()=>{const s=newHouseState('isolated');s.base.wealth=10;const n=convertResources(s,'wealth','defense',1,false);expect(()=>convertResources(n,'wealth','defense',1,false)).toThrow('conversão normal');const m=convertResources(n,'wealth','defense',1,true);expect(m.permanent.wealth).toBe(-5);expect(()=>convertResources(m,'wealth','defense',1,true)).toThrow('máximo');});
});
describe('auditoria de sorte, conversões e torneio',()=>{
 const make=()=>{const s=newHouseState('isolated');s.phase='active';s.base.wealth=100;s.base.power=100;s.base.law=50;s.base.population=20;return s;};
 const holding=(s:ReturnType<typeof make>,id:string)=>{const next=structuredClone(s);next.holdings.push({id,itemId:id,name:id,domainId:'',effects:[],costs:[],status:'active',ruleVersion:'test',source:'test'});return next;};
 it('acumulação 2–3 usa arredondamento para cima e mantém limite 12',async()=>{
   const {stackingBonus}=await import('@/lib/house/stacking');
   expect(stackingBonus(2,[1])).toBe(1);expect(stackingBonus(2,[3])).toBe(2);expect(stackingBonus(3,[6])).toBe(3);
   expect(stackingBonus(12,[3,3,3])).toBe(9);
 });
 it('Sorte de Esgotos reduz em 2 apenas penalidade negativa de População',async()=>{
   const {rollPreview}=await import('@/lib/house/fortune');
   const s=make();s.base.population=80;
   const args={status:1,testDice:[4],bonusDice:[],modifier:0,fortuneStackDice:[]};
   const a=rollPreview(s,args);const b=rollPreview(holding(s,'pros-sewer'),args);
   expect(b.modifier-a.modifier).toBe(2);
 });
 it('conversões especiais não autorizam taxas arbitrárias e compartilham ação mensal',async()=>{
   const {availableConversions,convertResources}=await import('@/lib/house/fortune');
   let s=make();s.base.law=20;s.base.wealth=100;s.base.influence=25;
   s=holding(s,'pros-black-market');
   expect(availableConversions(s).law).toContain('wealth');
   expect(()=>convertResources(s,'law','wealth',1,false,100)).toThrow('divergente');
   const a=convertResources(s,'law','wealth',1,false);
   expect(a.actions).toHaveLength(1);
   const b=convertResources(a,'wealth','power',1,true);
   expect(b.actions).toHaveLength(2);
   expect(()=>convertResources(b,'wealth','law',1,true)).toThrow();
 });
 it('torneio registra custo, descontos e rolagem, impedindo outra ação',async()=>{
   const {runTournament,convertResources}=await import('@/lib/house/fortune');
   const s=holding(make(),'pros-tournament-master');
   const r=runTournament(s,'regional',2,2,'Torneio oficial da Corte');
   expect(r.permanent.wealth).toBe(-8);
   expect(r.permanent.influence).toBe(4);
   expect(()=>convertResources(r,'wealth','power',1,false)).toThrow('outra ação');
 });
});
