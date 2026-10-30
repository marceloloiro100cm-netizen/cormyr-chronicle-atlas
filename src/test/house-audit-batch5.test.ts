import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState,type CatalogItem} from '@/lib/house/types';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {activeHoldings,balances,houseSeason,quote,purchase,settlementCapacity,requirements} from '@/lib/house/engine';
import {rollPreview,confirmFortune} from '@/lib/house/fortune';
const item=(id:string):CatalogItem=>{const x=CORE_CATALOG.find(i=>i.id===id);if(!x)throw new Error(id);return x;};
const house=(terrain='plains',community='hamlet')=>{
 const s=newHouseState('batch5');s.base={defense:100,influence:100,lands:100,law:30,population:20,power:100,wealth:100};
 s.domains=[{id:'one',name:'Domínio',terrain,features:[],community,notes:''}];return s;
};
const own=(s:HouseState,itemId:string,category:CatalogItem['category']='estate',id=itemId)=>{
 s.holdings.push({id,itemId,name:itemId,category,domainId:'one',status:'active',costs:[],effects:[],source:'Teste isolado',ruleVersion:'1'});return s;
};

describe('lote 5 item 21 — avisos pending não são barreira genérica',()=>{
 it('nota de fonte não gera erro adicional no motor',()=>{
  const s=house(),i=item('pros-crypts');
  expect(i.pending).toBeTruthy();
  expect(requirements(i,s,s.domains[0])).toEqual([]);
 });
 it('pré-requisito concreto continua bloqueando mesmo com nota pending',()=>{
  const s=house();s.base.influence=20;
  expect(requirements(item('pros-crypts'),s,s.domains[0])).toContain('Recurso mínimo não atingido.');
 });
});
describe('lote 5 itens 22–23 — requisitos estruturados, sem suposição de pré-requisitos',()=>{
 it('produção rural limita tamanho da comunidade e proíbe floresta',()=>{
  const s=house('plains','hamlet');
  expect(quote(item('pros-food-agriculture'),s,'one').errors).toEqual([]);
  s.domains[0]!.features=['woods-light'];
  expect(quote(item('pros-food-agriculture'),s,'one').errors.join(' ')).toContain('proibida');
  s.domains[0]!.features=[];s.domains[0]!.community='small-town';
  expect(quote(item('pros-food-agriculture'),s,'one').errors.join(' ')).toContain('Comunidade maior');
 });
 it('apiário aceita floresta OU pasto, mas não terreno sem ambos',()=>{
  const s=house('plains','hamlet');
  expect(quote(item('pros-apiary'),s,'one').errors.join(' ')).toContain('alternativas');
  s.domains[0]!.features=['woods-dense'];
  expect(quote(item('pros-apiary'),s,'one').errors).toEqual([]);
  s.domains[0]!.features=['grassland'];
  expect(quote(item('pros-apiary'),s,'one').errors).toEqual([]);
 });
 it('comércio de peles exige domínio sem qualquer comunidade',()=>{
  const s=house();expect(quote(item('pros-fur-trade'),s,'one').errors.join(' ')).toContain('Comunidade maior');
  delete s.domains[0]!.community;
  expect(quote(item('pros-fur-trade'),s,'one').errors).toEqual([]);
 });
 it('restringe Lei máxima inclusiva e estrita',()=>{
  const s=house();s.base.law=30;
  expect(quote(item('pros-black-market'),s,'one').errors).toEqual([]);
  expect(quote(item('pros-criminal-syndicate'),s,'one').errors.join(' ')).toContain('Recurso acima');
  s.base.law=29;own(s,'pros-brothels','settlement');
  expect(quote(item('pros-criminal-syndicate'),s,'one').errors).toEqual([]);
  s.base.law=31;
  expect(quote(item('pros-black-market'),s,'one').errors.join(' ')).toContain('Recurso acima');
 });
 it('construtor naval exige porto ativo na mesma localidade',()=>{
  const s=house();
  expect(quote(item('pros-shipwright'),s,'one').errors.join(' ')).toContain('posse ativa');
  own(s,'pros-port','settlement');
  expect(quote(item('pros-shipwright'),s,'one').errors).toEqual([]);
  s.holdings[0]!.domainId='other';
  expect(quote(item('pros-shipwright'),s,'one').errors.join(' ')).toContain('posse ativa');
 });
 it('bibliotecas especiais só aceitam o castelo mínimo correspondente',()=>{
  const s=house();own(s,'hall','fortification');
  expect(quote(item('pros-kingly-library'),s,'one').errors.join(' ')).toContain('Fortificação');
  expect(quote(item('pros-lordly-library'),s,'one').errors.join(' ')).toContain('Fortificação');
  s.holdings[0]!.itemId='castle';
  expect(quote(item('pros-lordly-library'),s,'one').errors).toEqual([]);
  expect(quote(item('pros-kingly-library'),s,'one').errors.join(' ')).toContain('Fortificação');
  s.holdings[0]!.itemId='superior-castle';
  expect(quote(item('pros-kingly-library'),s,'one').errors).toEqual([]);
 });
 it('exigências do tipo OU permitem comunidade OU fortificação',()=>{
  const s=house('plains','small-town');
  expect(quote(item('pros-stonemason'),s,'one').errors).toEqual([]);
  delete s.domains[0]!.community;
  expect(quote(item('pros-stonemason'),s,'one').errors.join(' ')).toContain('alternativas');
  own(s,'hall','fortification');
  expect(quote(item('pros-stonemason'),s,'one').errors).toEqual([]);
 });
 it('não se inicia agricultura no outono/inverno quando ativa, mas casas em criação são retroativas',()=>{
  const s=house();s.phase='active';
  s.month=1522*12+8;
  expect(houseSeason(s.month)).toBe('autumn');
  expect(quote(item('pros-food-agriculture'),s,'one').errors.join(' ')).toContain('estação');
  s.month=1522*12+11;
  expect(houseSeason(s.month)).toBe('winter');
  expect(quote(item('pros-food-agriculture'),s,'one').errors.join(' ')).toContain('estação');
  s.phase='draft';
  expect(quote(item('pros-food-agriculture'),s,'one').errors).toEqual([]);
 });
});
describe('lote 5 item 24 — efeitos numéricos do suplemento',()=>{
 it('benefícios diretos G/M/SF são estruturados por atributo, sem tipo action',()=>{
  const effects=item('pros-kingly-library').effects;
  for(const r of ['influence','law','wealth'])
   expect(effects).toEqual(expect.arrayContaining([expect.objectContaining({kind:'mitigation',resource:r,amount:1})]));
  expect(item('pros-food-agriculture').effects).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'gain',resource:'population',amount:1}),
   expect.objectContaining({kind:'gain',resource:'power',amount:1}),
  ]));
  expect(item('pros-gardens--herb-gardens').effects).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'fortune',amount:1,seasons:['spring','summer','autumn']}),
  ]));
 });
 it('efeitos de agricultura produzem no verão mas ficam inativos no inverno',()=>{
  const s=house();s.phase='active';s.month=1522*12+6;
  const h=item('pros-food-agriculture');
  s.holdings=[{id:'agri',itemId:h.id,name:h.name,domainId:'one',category:h.category,status:'active',
   costs:[],effects:h.effects,source:h.source,ruleVersion:h.version}];
  expect(activeHoldings(s)[0]?.effects.filter(e=>e.kind==='gain')).toHaveLength(2);
  s.month=1522*12+11;
  expect(activeHoldings(s)[0]?.effects.some(e=>e.kind==='gain'||e.kind==='fortune')).toBe(false);
 });
 it('bônus de desmanche G2 e moinho G1 entram na confirmação sem bloqueio regex',()=>{
  const s=house();s.phase='active';s.base.law=50;
  const m=item('pros-food-agriculture--mill');s.holdings.push({id:'mill',itemId:m.id,name:m.name,domainId:'one',status:'active',
   effects:m.effects,costs:[],source:m.source,ruleVersion:m.version});
  const result=confirmFortune(s,{status:3,testDice:[6,6,6],bonusDice:[],modifier:0,
   resource:'wealth',changes:{wealth:1},justification:'Prosperidade e ganho da Casa'});
  expect(result.permanent.wealth).toBe(2);
 });
 it('efeito condicionado por Lei alta desaparece ao ultrapassar 31',()=>{
  const s=house();const e=item('pros-salvage-operation--wreckers');
  s.holdings=[{id:'w',itemId:e.id,name:e.name,domainId:'one',status:'active',
   effects:e.effects,costs:[],source:e.source,ruleVersion:e.version}];
  expect(activeHoldings(s)[0]?.effects.some(v=>v.kind==='gain')).toBe(true);
  s.base.law=32;expect(activeHoldings(s)[0]?.effects.some(v=>v.kind==='gain')).toBe(false);
 });
});
describe('lote 5 item 25 — espaços de castelo',()=>{
 it('Castelo Pequeno comporta 3; Castelo Superior, 5 assentamentos',()=>{
  for(const [id,capacity] of [['small-castle',3],['superior-castle',5]] as const){
   const s=house();own(s,id,'fortification');
   expect(settlementCapacity(s,'one',id)).toMatchObject({capacity,used:0});
   for(let k=0;k<capacity;k++)s.holdings.push({id:'set'+k,itemId:'pros-marketplace',name:'Mercado',category:'settlement',
     supportId:id,domainId:'one',status:'active',costs:[],effects:[],source:'Teste',ruleVersion:'1'});
   expect(settlementCapacity(s,'one',id).used).toBe(capacity);
  }
 });
});
