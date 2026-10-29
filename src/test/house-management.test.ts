import {it,expect} from 'vitest';
import {newHouseState,RESOURCE_KEYS,type Resource,type CatalogItem} from '@/lib/house/types';
import {attachVassal,createVassal,vassalState} from '@/lib/house/vassals';
import {balances,purchase,settlementCapacity} from '@/lib/house/engine';
import {REGIONS} from '@/lib/house/regions';
import {isNarrativeNpc} from '@/lib/house/narrative-npc';
it('allocates 20/10/5 only once and rejects duplicates',()=>{
 let s=newHouseState('parent');s.base.power=40;
 for(let i=0;i<3;i++)s=attachVassal(s,{id:String(i),houseId:'v'+i,name:'V'+i,notes:''});
 expect(s.vassals?.map(v=>v.cost)).toEqual([20,10,5]);expect(balances(s).available.power).toBe(5);
 expect(()=>attachVassal(s,{id:'new',houseId:'v1',name:'V1',notes:''})).toThrow('registrado');
});
it('records 5d6 and purchases only against the vassal resources',()=>{
 const s=newHouseState('parent');s.base.power=30;
 const rolls=Object.fromEntries(RESOURCE_KEYS.map(r=>[r,[1,2,3,4,5]])) as Record<Resource,number[]>;
 const next=createVassal(s,{id:'child',name:'Child',region:'crownlands',motto:'',lordName:''},rolls);
 const v=next.vassals![0]!,mini=vassalState(next,v);expect(mini.base.wealth).toBe(15);expect(balances(mini).total.wealth).toBe(15);
 const item:CatalogItem={id:'test',name:'Test',original:'Test',category:'personage',description:'Test',costs:[{resource:'wealth',amount:4,mode:'allocation'}],requirements:[],effects:[],duration:{months:0},source:'Test',section:'Test',version:'1',repeatable:true};
 expect(balances(purchase(mini,item,{id:'buy',domainId:'',name:'',dice:[]})).available.wealth).toBe(11);
 expect(next.base).toEqual(s.base);expect(balances(next).available.power).toBe(10);expect(s.vassals??[]).toHaveLength(0);
 expect(()=>createVassal(s,{id:'bad',name:'Bad',region:'',motto:'',lordName:''},{...rolls,power:[7,1,1,1,1]})).toThrow('cinco');
});
it('Swordmarch totals 70 and technical sheets are not NPCs',()=>{
 const region=REGIONS['swordmark'];if(!region)throw new Error('Missing Swordmarch region');
 expect(region.values.reduce((a,b)=>a+b,0)).toBe(70);
 expect(isNarrativeNpc({kind:'character',title:'Ficha do Lorde',content:''})).toBe(false);
 expect(isNarrativeNpc({kind:'character',title:'Sir Arlen',content:'Capitão'})).toBe(true);
});
it('small and superior castles provide 3 and 5 settlement slots',()=>{
 const s=newHouseState('house');s.domains=[{id:'d',name:'D',terrain:'',features:[],notes:''}];
 for(const [itemId,expected] of [['small-castle',3],['superior-castle',5]] as const){
 s.holdings=[{id:'h',domainId:'d',itemId,name:itemId,category:'fortification',status:'active',costs:[],effects:[],source:'test',ruleVersion:'1'}];
 expect(settlementCapacity(s,'d','h').capacity).toBe(expected);
 }
});
