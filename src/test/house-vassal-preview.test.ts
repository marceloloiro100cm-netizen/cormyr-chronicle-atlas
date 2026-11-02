import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState} from '@/lib/house/types';
import {vassalState} from '@/lib/house/vassals';
import {vassalHouseOverview} from '@/lib/house/vassal-preview';

function sample(){
 const state=newHouseState('parent','Cormyr');
 state.base.power=40;
 state.base.lands=25;
 state.domains=[{id:'domain',name:'Vale do Rio',terrain:'plain',features:[],notes:''}];
 state.holdings=[
  {id:'fort',itemId:'fort',name:'Torre do Vale',category:'fortification',domainId:'domain',costs:[],effects:[],ruleVersion:'1',source:'test',status:'active'},
  {id:'farm',itemId:'farm',name:'Fazenda do Vale',category:'estate',domainId:'domain',costs:[],effects:[],ruleVersion:'1',source:'test',status:'active'},
 ];
 state.units=[{
  id:'unit',name:'Guarda do Rio',types:['infantry'],training:'trained',origin:'local',domainId:'domain',
  skills:{agility:2,athletics:2,awareness:2,endurance:2,fighting:2,marksmanship:2,stealth:2,cunning:2,healing:2,animalHandling:2,warfare:2,survival:2},
  xp:0,costs:[],armor:1,armorPenalty:0,health:6,casualties:0,strength:100,disciplineModifier:0,equipment:[],situation:'guardando',notes:'',
 }] as HouseState['units'];
 return state;
}
describe('ficha resumida de vassalos',()=>{
 it('separa recursos, tropas, terras, fortificações e economia de registros reais',()=>{
  const result=vassalHouseOverview(sample());
  expect(result.resources.find(r=>r.key==='power')?.total).toBe(40);
  expect(result.units.map(u=>u.name)).toEqual(['Guarda do Rio']);
  expect(result.domains.map(d=>d.name)).toEqual(['Vale do Rio']);
  expect(result.fortifications.map(h=>h.name)).toEqual(['Torre do Vale']);
  expect(result.economy.map(h=>h.name)).toEqual(['Fazenda do Vale']);
  expect(result.otherHoldings).toEqual([]);
 });
 it('não inclui unidades destruídas ou posses abandonadas no resumo ativo',()=>{
  const s=sample();
  s.units[0]!.destroyed=true;
  s.holdings[0]!.status='abandoned';
  const result=vassalHouseOverview(s);
  expect(result.units).toHaveLength(0);
  expect(result.fortifications).toHaveLength(0);
  expect(result.economy).toHaveLength(1);
 });
 it('vassala criada tem recursos independentes e mantém lorde/lema no estado exportável',()=>{
  const parent=sample();
  const sheet={
   region:'Cormyr',motto:'Até o fim',lordName:'Lady da Ponte',
   rolls:Object.fromEntries(['defense','influence','lands','law','population','power','wealth'].map(key=>[key,[2,2,2,2,2]])) as Record<keyof HouseState['base'],number[]>,
   base:{defense:12,influence:13,lands:14,law:15,population:16,power:17,wealth:18},
   permanent:{defense:0,influence:0,lands:0,law:0,population:0,power:0,wealth:0},
   holdings:[],domains:[],
  };
  const vassal={id:'id',houseId:'vassal-id',name:'Ponte',status:'approved' as const,
   cost:20,influencePenalty:0,notes:'',sheet};
  const derived=vassalState(parent,vassal);
  expect(derived.houseId).toBe('vassal-id');
  expect(derived.base.power).toBe(17);
  expect(derived.base.power).not.toBe(parent.base.power);
  expect(derived.units).toEqual([]);
  expect(derived.identity.motto).toBe('Até o fim');
  expect(derived.identity.notes).toContain('Lady da Ponte');
  expect(parent.base.power).toBe(40);
 });
});
