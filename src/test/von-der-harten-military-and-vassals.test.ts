import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState,type Holding,type Unit} from '@/lib/house/types';
import {balances,unitStats} from '@/lib/house/engine';
import {calculateSpyDefense} from '@/lib/espionage/spy-defense';
import {rollPreview} from '@/lib/house/fortune';
import {houseEffectLedger} from '@/lib/house/house-effect-ledger';
import {vassalCrestUrl} from '@/lib/house/vassal-links';

const domain='dom-von-der-harten-lex-castle';
const cost=(resource:'power'|'defense'|'wealth',amount:number)=>[{resource,amount,mode:'allocation' as const}];
const holding=(id:string,itemId:string,name:string,costs:Holding['costs'],effects:Holding['effects']):Holding=>({
 id,itemId,name,costs,effects,domainId:domain,status:'active',source:'Ficha autoral',
 ruleVersion:'importacao-autor-2026-11-04'
});
function sampleHouse():HouseState {
 const house=newHouseState('von-der-harten','crownlands',18273);
 house.method='import';house.phase='active';
 house.base={defense:38,influence:30,lands:20,law:62,population:29,power:36,wealth:58};
 house.domains=[{id:domain,name:'Lex Castle',terrain:'mountains',features:['road','river'],notes:''}];
 house.holdings=[
  holding('castle','small-castle','Lex Castle',cost('defense',30),[
   {kind:'defensive',amount:6,description:'Defesa da fortificação +6'}
  ]),
  holding('banner-1','vassal-1','Wyvernspur',cost('power',20),[]),
  holding('banner-2','vassal-2','Immerdusk',cost('power',10),[]),
  holding('police','pros-secret-police','Polícia Secreta',[
   ...cost('power',3),...cost('wealth',10)
  ],[{kind:'action',description:'Agentes hostis: dificuldade de Astúcia +6'}]),
  holding('school','pros-scholar--school','Escola',cost('wealth',5),[
   {kind:'fortune',amount:1,description:'Sorte da Casa +1'}
  ])
 ];
 house.units=[{
  id:'c45e6a2f-9ddf-4e31-a715-ea48b1a3d070',
  name:'Guarnição Verde de Lex Castle',types:['garrison'],training:'green',
  origin:'Lex Castle',domainId:domain,skills:{
   agility:2,athletics:2,awareness:2,endurance:2,fighting:2,
   marksmanship:2,stealth:2,cunning:2,healing:2,animalHandling:2,
   warfare:2,survival:2,
  },xp:20,costs:cost('power',3),
  armor:3,armorPenalty:2,health:6,casualties:0,strength:100,
  disciplineModifier:-3,equipment:[],situation:'Pronta',
  notes:'Importação da planilha',atHome:true,mounted:false,
 } as Unit];
 return house;
}

describe('Von der Harten — vassalagem, guarnição e contraespionagem',()=>{
 it('não debita novamente os brasões vassalos e reserva os 3 pontos da guarnição',()=>{
  const h=sampleHouse(),b=balances(h);
  expect(b.total.power).toBe(36);
  expect(b.allocated.power).toBe(36);
  expect(b.available.power).toBe(0);
 });
 it('os dois vínculos aprovados concedem dois dados de Sorte sem gastar Poder outra vez',()=>{
  const h=sampleHouse();
  h.vassals=[
   {id:'banner-1',houseId:'wyvernspur',name:'Wyvernspur',
    status:'approved',cost:20,influencePenalty:0,notes:''},
   {id:'banner-2',houseId:'immerdusk',name:'Immerdusk',
    status:'approved',cost:10,influencePenalty:0,notes:''},
  ];
  const args={status:2,testDice:[4,4,4,4],bonusDice:[],modifier:0};
  expect(rollPreview(h,args).kept).toHaveLength(4);
  expect(balances(h).available.power).toBe(0);
 });
 it('distingue defesa do castelo, disciplina e saúde da Guarnição Verde',()=>{
  const h=sampleHouse(),stats=unitStats(h.units[0]!,h);
  expect(stats.defense).toBe(10); // 2+2+2−2+6 pelo castelo
  expect(stats.discipline).toBe(6); // 9 do treino verde−3 guarnição em casa
  expect(stats.maxHealth).toBe(6);
  expect(h.units[0]?.strength).toBe(100);
 });
 it('Lei 62 produz dificuldade 24, Polícia Secreta adiciona +6 = 30',()=>{
  const h=sampleHouse(),p=calculateSpyDefense(h);
  expect(p.law).toBe(62);
  expect(p.baseDifficulty).toBe(24);
  expect(p.globalBonuses).toBe(6);
  expect(p.domains[0]?.difficulty).toBe(30);
 });
 it('Polícia Secreta reduz a penalidade NEGATIVA de População sem criar bônus positivo',()=>{
  const h=sampleHouse();
  h.holdings=h.holdings.filter(x=>x.itemId!=='pros-scholar--school');
  h.base.population=75; // índice com penalidade negativa
  const param={status:1,testDice:[4],bonusDice:[],modifier:0};
  const withPolice=rollPreview(h,param);
  h.holdings=h.holdings.filter(x=>x.itemId!=='pros-secret-police');
  const withoutPolice=rollPreview(h,param);
  expect(withPolice.modifier-withoutPolice.modifier).toBe(1);
  h.base.population=29; // sem penalidade: não deve receber +1
  const withoutAt29=rollPreview(h,param);
  h.holdings.push(holding('police','pros-secret-police','Polícia Secreta',cost('power',3),[]));
  expect(rollPreview(h,param).modifier).toBe(withoutAt29.modifier);
 });
 it('aplica o +1 de Sorte da Escola como efeito numérico',()=>{
  const h=sampleHouse();
  expect(houseEffectLedger(h).raw.fortune).toBe(1);
 });
 it('brasões arquivados das duas Casas seguem o caminho publicado correto',()=>{
  expect(vassalCrestUrl('assets/crownlands-wyvernspur.webp'))
   .toBe('/cormyr/assets/crownlands-wyvernspur.webp');
  expect(vassalCrestUrl('assets/crownlands-immerdusk.webp'))
   .toBe('/cormyr/assets/crownlands-immerdusk.webp');
 });
});