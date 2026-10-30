import { it, expect } from 'vitest';
import { houseResourceChart, HOUSE_CHART_MAX } from '@/lib/house/resource-chart';
import { newHouseState } from '@/lib/house/types';
it('segmentos mostram total50, 40 alocado, 10 livre sem alterar fonte',()=>{
 const s=newHouseState('isolated');s.base.defense=50;
 s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'});
 const before=JSON.stringify(s);
 expect(HOUSE_CHART_MAX).toBe(100);
 expect(houseResourceChart(s)[0]).toEqual({resource:'defense',total:50,allocated:40,committed:0,available:10,deficit:0,scale:100,plotted:50});
 expect(JSON.stringify(s)).toBe(before);
});
it('escala cresce acima de 100 sem cortar valores totais ou proporções',()=>{
 const s=newHouseState('isolated');s.base.defense=120;
 expect(houseResourceChart(s)[0]).toEqual({resource:'defense',total:120,allocated:0,committed:0,available:120,deficit:0,scale:120,plotted:120});
 expect(s.base.defense).toBe(120);
});
it('valores negativos de saldo preservam o déficit e expandem a escala para as alocações',()=>{
 const s=newHouseState('isolated');s.base.defense=60;
 s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',
 costs:[{resource:'defense',amount:125,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'});
 expect(houseResourceChart(s)[0]).toMatchObject({scale:125,total:60,allocated:125,committed:0,available:0,deficit:65});
});
it('distingue recursos já comprometidos em obras dos recursos alocados',()=>{
 const s=newHouseState('isolated');s.base.defense=90;
 s.holdings.push({id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',
 costs:[{resource:'defense',amount:30,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'building'});
 expect(houseResourceChart(s)[0]).toMatchObject({total:90,allocated:0,committed:30,available:60});
});
