import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState,type CatalogItem} from '@/lib/house/types';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {balances,quote,purchase,advance} from '@/lib/house/engine';
import {editDomain,deleteEmptyDomain} from '@/lib/house/domain-management';
import {rollPreview} from '@/lib/house/fortune';
const item=(id:string)=>{const i=CORE_CATALOG.find(x=>x.id===id);if(!i)throw Error(id);return i};
const base=()=>{const s=newHouseState('lot6');s.base={defense:100,influence:100,lands:100,law:50,population:20,power:100,wealth:100};s.domains=[{id:'dom',name:'Fortaleza',terrain:'hills',features:[],notes:''}];return s;};
const buy=(s:HouseState,id:string,extra:Partial<{replaceId:string;parentId:string;extraAreas:number}>={})=>purchase(s,item(id),{id:'new-'+id+Math.random(),domainId:'dom',name:id,dice:s.phase==='active'?Array.from({length:item(id).duration.dice??0},()=>1):[],...extra});

describe('lote 6 item 26 — edição e exclusão segura de domínios',()=>{
 it('renomeia sem alterar investimentos; exclusão apenas de domínio vazio no rascunho',()=>{
  const s=base(),n=editDomain(s,'dom','Nova sede','Conselho local');
  expect(n.domains[0]?.name).toBe('Nova sede');
  expect(n.domains[0]?.notes).toBe('Conselho local');
  expect(s.domains[0]?.name).toBe('Fortaleza');
  expect(()=>deleteEmptyDomain(s,'dom')).toThrow('investimentos');
  const blank=newHouseState('blank');blank.domains=[{id:'d',name:'Vazio',terrain:'',features:[],notes:''}];
  expect(deleteEmptyDomain(blank,'d').domains).toHaveLength(0);
 });
 it('não apaga domínios vinculados a tropas e rejeita exclusão fora de rascunho',()=>{
  const s=base();s.domains[0]!.terrain='';
  s.phase='active';expect(()=>deleteEmptyDomain(s,'dom')).toThrow('rascunho');
  s.phase='draft';
  s.holdings.push({id:'a',itemId:'tower',name:'Torre',domainId:'dom',status:'destroyed',costs:[],effects:[],source:'Livro',ruleVersion:'1'});
  expect(()=>deleteEmptyDomain(s,'dom')).toThrow('investimentos');
 });
});
describe('lote 6 item 27 — torres e evolução sem liberar pontos duplos',()=>{
 it('salão e torres secundárias coexistem no mesmo domínio',()=>{
  const s=buy(base(),'hall');
  const a=buy(s,'tower');
  expect(a.holdings).toHaveLength(2);
  expect(buy(a,'tower').holdings).toHaveLength(3);
 });
 it('evolução do Salão para Castelo Pequeno custa apenas +10 Defesa em obras',()=>{
  const old=buy(base(),'hall');old.phase='active';
  const before=balances(old);expect(before.available.defense).toBe(80);
  const next=buy(old,'small-castle',{replaceId:old.holdings[0]!.id});
  expect(next.holdings).toHaveLength(2);
  expect(next.holdings[0]?.status).toBe('active');
  expect(next.holdings[1]?.status).toBe('building');
  expect(balances(next).allocated.defense).toBe(20);
  expect(balances(next).committed.defense).toBe(10);
  expect(balances(next).available.defense).toBe(70);
  const after=advance(next,next.month+120);
  expect(after.holdings).toHaveLength(1);
  expect(after.holdings[0]?.itemId).toBe('small-castle');
  expect(after.holdings[0]?.status).toBe('active');
  expect(balances(after).allocated.defense).toBe(30);
  expect(balances(after).available.defense).toBe(70);
  expect(old.holdings).toHaveLength(1);
 });
 it('crescimento de Povoado para Vila Pequena exige +10 Terras e substitui comunidade',()=>{
  let s=buy(base(),'hamlet');s.phase='active';
  const previous=s.holdings[0]!.id;
  s=buy(s,'small-town',{replaceId:previous});
  expect(s.domains[0]?.community).toBe('hamlet');
  expect(balances(s).committed.lands).toBe(10);
  s=advance(s,s.month+120);
  expect(s.domains[0]?.community).toBe('small-town');
  expect(s.holdings.filter(h=>h.category==='community')).toHaveLength(1);
  expect(balances(s).allocated.lands).toBe(20);
 });
 it('não permite downgrade, edição de posse em obra nem upgrades duplicados',()=>{
  const s=buy(base(),'small-castle');
  expect(quote(item('hall'),s,'dom',undefined,undefined,s.holdings[0]?.id).errors.join(' ')).toContain('maior');
  s.phase='active';const n=buy(s,'castle',{replaceId:s.holdings[0]!.id});
  expect(quote(item('superior-castle'),n,'dom',undefined,undefined,s.holdings[0]!.id).errors.join(' ')).toContain('evolução em obra');
 });
});
describe('lote 6 itens 28 e 29 — descontos e preços variáveis',()=>{
 it('acumula dois descontos sem bloquear, respeitando o custo mínimo',()=>{
  const s=base();
  for(let k=0;k<2;k++)s.holdings.push({id:'desc'+k,itemId:'b'+k,name:'Acordo '+k,domainId:'dom',status:'active',source:'Teste',ruleVersion:'1',costs:[],effects:[{kind:'discount',resource:'defense',target:'castle',amount:3,description:'Desconto 3'}]});
  const q=quote(item('castle'),s,'dom');
  expect(q.errors).toEqual([]);
  expect(q.costs[0]?.amount).toBe(34);
  expect(q.discounts).toHaveLength(2);
 });
 it('séquito escala com padrão de vida pai; pobre não pode ser pai',()=>{
  for(const [living,cost] of [['pros-comfortable',5],['pros-rich',10],['pros-lavish',20]] as const){
   const s=base();s.holdings.push({id:'parent',itemId:living,name:'Padrão',domainId:'dom',status:'active',source:'Teste',ruleVersion:'1',category:'lifestyle',costs:[],effects:[]});
   const q=quote(item('pros-standard-of-living--entourage'),s,'dom','parent');expect(q.costs[0]?.amount).toBe(cost);
  }
  const s=base();expect(quote(item('pros-standard-of-living--entourage'),s,'dom').errors.join(' ')).toContain('Séquito');
 });
 it('residência urbana custa 5, 10 ou 15 conforme cidade',()=>{
  for(const [community,cost] of [['small-town',5],['small-city',10],['large-city',15]] as const){
   const s=base();s.domains[0]!.community=community;
   expect(quote(item('pros-townhouse'),s,'dom').costs[0]?.amount).toBe(cost);
  }
 });
 it('Oradores e Ouvintes: 3 base +2 por área',()=>{
  const s=base();s.holdings.push({id:'parent',itemId:'pros-minstrel-s-seat',name:'Sede',domainId:'dom',status:'active',source:'Teste',ruleVersion:'1',costs:[],effects:[]});
  expect(quote(item('pros-minstrel-s-seat--speakers-listeners'),s,'dom','parent',undefined,undefined,2).costs[0]?.amount).toBe(7);
  expect(quote(item('pros-minstrel-s-seat--speakers-listeners'),s,'dom','parent',undefined,undefined,-1).errors.join(' ')).toContain('inválido');
 });
});
describe('lote 6 item 30 — prazos e bosque sagrado',()=>{
 it('catálogo preserva custos e prazos conciliados do suplemento',()=>{
  for(const [id,months,dice] of [['pros-animal-husbandry',6,1],['pros-master-of-arms',0,2],['pros-secret-police',12,2],['pros-spy-network',12,2]] as const){
   const p=item(id);expect(p.duration).toMatchObject({months,dice,sides:6});
  }
  expect(item('pros-secret-police').effects).toEqual(expect.arrayContaining([
    expect.objectContaining({kind:'gain',resource:'law',amount:1}),
    expect.objectContaining({kind:'mitigation',resource:'law',amount:2}),
  ]));
 });
 it('bosque sagrado: 5 Riqueza, 24+2d6, +2d6−6 exigindo registro dos dados',()=>{
  const p=item('godswood');
  expect(p.costs).toEqual([{resource:'wealth',amount:5,mode:'allocation'}]);
  expect(p.duration).toEqual({months:24,dice:2,sides:6});
  const s=base(),b=buy(s,'godswood');b.phase='active';
  expect(()=>rollPreview(b,{status:3,testDice:[5,4,3],bonusDice:[],modifier:0})).toThrow('dados especiais');
  const r=rollPreview(b,{status:3,testDice:[5,4,3],bonusDice:[],modifier:0,specialFortuneDice:[6,1]});
  expect(r.modifier).toBeGreaterThan(-100);
  expect(()=>rollPreview(b,{status:3,testDice:[5,4,3],bonusDice:[],modifier:0,specialFortuneDice:[0,7]})).toThrow('fora da faixa');
 });
});
