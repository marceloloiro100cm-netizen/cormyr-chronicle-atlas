import { it, expect } from 'vitest';
import { houseResourceChart, HOUSE_CHART_MAX } from '@/lib/house/resource-chart';
import { newHouseState } from '@/lib/house/types';
it('escala até100 usa total50 sem descontar a alocação40',()=>{
 const s=newHouseState('isolated');s.base.defense=50;s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'});
 const before=JSON.stringify(s);expect(HOUSE_CHART_MAX).toBe(100);expect(houseResourceChart(s)[0]).toEqual({resource:'defense',total:50,plotted:50});expect(JSON.stringify(s)).toBe(before);
});
it('mantém pontuação real acima100 sem alterar o saldo',()=>{
 const s=newHouseState('isolated');s.base.defense=120;expect(houseResourceChart(s)[0]).toEqual({resource:'defense',total:120,plotted:100});expect(s.base.defense).toBe(120);
});