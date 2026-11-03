import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState} from '@/lib/house/types';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {quote,purchase,balances} from '@/lib/house/engine';
const item=(id:string)=>{const v=CORE_CATALOG.find(x=>x.id===id);if(!v)throw Error(id);return v;};
const state=()=>{const s=newHouseState('h');s.base={defense:100,influence:50,lands:100,law:50,population:30,power:100,wealth:100};
s.domains=[{id:'d',name:'Localidade',terrain:'plains',community:'hamlet',features:[],notes:''}];return s;};
const own=(s:HouseState,id:string,resource:'lands'|'defense',amount:number)=>{
s.holdings.push({id:'old',itemId:id,name:id,category:resource==='lands'?'community':'fortification',domainId:'d',status:'active',source:'Livro',ruleVersion:'1',
costs:[{resource,amount,mode:'allocation'}],effects:[]});return s;};
describe('lote 6 · upgrades, descontos e custos variáveis',()=>{
 it('upgrading Hamlet10 para Town20 paga diferença 10, troca suporte e mantém total',()=>{
  const s=own(state(),'hamlet','lands',10);expect(quote(item('small-town'),s,'d').errors.length).toBeGreaterThan(0);
  expect(quote(item('small-town'),s,'d',undefined,undefined,'old').errors).toEqual([]);
  const next=purchase(s,item('small-town'),{id:'new',domainId:'d',name:'Vila',dice:[],replaceId:'old'});
  expect(balances(next).available.lands).toBe(balances(s).available.lands-10);
  expect(next.domains[0]?.community).toBe('small-town');expect(next.holdings.find(h=>h.id==='old')).toBeUndefined();
 });
 it('Hall e torre secundária coexistem, mas não permite segundo Hall',()=>{
  const s=own(state(),'hall','defense',20);
  expect(quote(item('tower'),s,'d').errors).toEqual([]);
  expect(quote(item('hall'),s,'d').errors.length).toBeGreaterThan(0);
  expect(quote(item('small-castle'),s,'d',undefined,undefined,'old').errors).toEqual([]);
 });
 it('entourage usa custo dinâmico conforme padrão de vida pai',()=>{
  for(const [living,cost] of [['pros-comfortable',5],['pros-rich',10],['pros-lavish',20]] as const){
   const s=state();s.holdings=[{id:'life',itemId:living,name:living,domainId:'d',category:'lifestyle',status:'active',costs:[],effects:[],source:'Prosperidade',ruleVersion:'1'}];
   expect(quote(item('pros-standard-of-living--entourage'),s,'d','life').costs[0]?.amount).toBe(cost);
  }
 });
 it('Townhouse custa 5 em vila, 10 em cidade pequena, 15 em cidade grande',()=>{
  const s=state();
  for(const [community,cost] of [['small-town',5],['small-city',10],['large-city',15]] as const){
   s.domains[0]!.community=community;
   expect(quote(item('pros-townhouse'),s,'d').costs[0]?.amount).toBe(cost);
  }
 });
 it('speakers-listeners custa 3 Riqueza; pobre não compra sem adaptação auditada',()=>{
  expect(item('pros-minstrel-s-seat--speakers-listeners').costs[0]?.amount).toBe(3);
  expect(quote(item('pros-poor'),state(),'d').errors.join(' ')).toContain('não confirmado');
 });
 it('Godswood e prazos especiais do suplemento estão no catálogo',()=>{
  expect(item('godswood').costs[0]).toMatchObject({resource:'wealth',amount:5});
  expect(item('godswood').duration).toMatchObject({months:24,dice:2,sides:6});
  for(const [id,months,dice] of [['pros-animal-husbandry',6,1],['pros-master-of-arms',0,2],['pros-secret-police',12,2],['pros-spy-network',6,2]] as const)
   expect(item(id).duration).toMatchObject({months,dice});
  expect(item('pros-secret-police').effects.some(e=>e.kind==='action'&&e.description.includes('+6'))).toBe(true);
  expect(item('pros-secret-police').effects.some(e=>e.resource==='law'&&
   (e.kind==='gain'||e.kind==='mitigation'))).toBe(false);
 });
});
