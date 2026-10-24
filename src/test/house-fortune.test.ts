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
 it('segunda conversão apressada e máximo2',()=>{const s=newHouseState('isolated');s.base.wealth=10;const n=convertResources(s,'wealth','defense',1,false);expect(()=>convertResources(n,'wealth','defense',1,false)).toThrow('segunda');const m=convertResources(n,'wealth','defense',1,true);expect(m.permanent.wealth).toBe(-5);expect(()=>convertResources(m,'wealth','defense',1,true)).toThrow('máximo');});
});