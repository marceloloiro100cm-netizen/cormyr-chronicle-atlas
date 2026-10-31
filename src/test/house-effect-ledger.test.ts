import {describe,it,expect} from 'vitest';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {houseEffectLedger,resolveHouseNumericBonus} from '@/lib/house/house-effect-ledger';
import {confirmFortune} from '@/lib/house/fortune';
import {unitMilitaryBonuses} from '@/lib/house/military-bonuses';
import {newHouseState,SKILLS,type Holding,type Unit} from '@/lib/house/types';

function makeState(){
 const s=newHouseState('shared-effects-test');
 s.domains=[{id:'d',name:'Vale',terrain:'hills',features:['river'],notes:''}];
 s.base.law=50;s.base.population=20;s.base.wealth=50;s.base.power=50;
 return s;
}
function holding(itemId:string,extra:Partial<Holding>={}):Holding{
 const catalog=CORE_CATALOG.find(x=>x.id===itemId);
 return {id:'h-'+itemId,itemId,name:catalog?.name??itemId,domainId:'d',
  status:'active',costs:[],effects:structuredClone(catalog?.effects??[]),
  source:'Prosperidade · snapshot de compra',ruleVersion:'2026-10-31',...extra};
}
function unit():Unit{
 return {id:'u',name:'Infantaria',types:['infantry'],training:'trained',domainId:'d',origin:'',
  skills:Object.fromEntries(SKILLS.map(key=>[key,2])) as Unit['skills'],xp:60,
  costs:[],armor:3,armorPenalty:2,health:6,casualties:0,strength:100,
  disciplineModifier:0,equipment:[],situation:'',notes:'',atHome:true};
}

describe('livro de efeitos derivados da Casa',()=>{
 it('mantém as fontes gravadas e calcula Sorte, ganho e mitigação sem misturá-los a atributos de unidade',()=>{
  const s=makeState();
  s.holdings=[
   holding('pros-bowyer-fletcher-or-weaponsmith'),
   holding('pros-stonemason'),
   holding('pros-street-gangs'),
   holding('pros-charcoal'),
   holding('pros-charcoal--tar-works',{parentId:'h-pros-charcoal'})
  ];
  const report=houseEffectLedger(s);
  expect(report.raw.fortune).toBe(3);
  expect(report.raw.gain.wealth).toBe(1);
  expect(report.raw.mitigation.wealth).toBe(1);
  expect(report.specialRules.extraLawLossOnFortune).toBe(1);
  expect(resolveHouseNumericBonus(report,'fortune',undefined,[4])).toBe(2);
  expect(resolveHouseNumericBonus(report,'gain','wealth')).toBe(1);
  expect(report.sources.find(e=>e.itemId==='pros-charcoal--tar-works'&&e.effect.kind==='gain')?.holdingId)
   .toBe('h-pros-charcoal--tar-works');
  expect(s.permanent.wealth).toBe(0);
 });
 it('nunca contabiliza posse em construção, destruída, órfã de pai ou fora da estação',()=>{
  const s=makeState();
  const parent=holding('pros-charcoal'),child=holding('pros-charcoal--tar-works',{parentId:parent.id});
  s.holdings=[parent,child,holding('pros-stonemason',{status:'building'})];
  expect(houseEffectLedger(s).raw.gain.wealth).toBe(1);
  parent.status='destroyed';
  expect(houseEffectLedger(s).raw.gain.wealth).toBe(0);
  s.holdings=[holding('pros-charcoal--tar-works',{effects:[{
   kind:'gain',resource:'wealth',amount:2,seasons:['summer'],description:'Bônus sazonal salvo'
  }]})];
  expect(houseEffectLedger(s).raw.gain.wealth).toBe(0);
  s.month+=6;
  expect(houseEffectLedger(s).raw.gain.wealth).toBe(2);
 });
 it('identifica um investimento antigo sem efeitos numéricos conciliados; não inventa bônus',()=>{
  const s=makeState();s.holdings=[holding('pros-shipwright',{effects:[]})];
  const report=houseEffectLedger(s);
  expect(report.raw.fortune).toBe(0);
  expect(report.unreconciled).toEqual([{holdingId:'h-pros-shipwright',itemId:'pros-shipwright',name:'Construtor Naval'}]);
 });
 it('aplica a penalidade de Gangues de Rua às perdas de Lei na Sorte e registra a mudança',()=>{
  const s=makeState();s.phase='active';s.holdings=[holding('pros-street-gangs')];
  const after=confirmFortune(s,{
   status:1,testDice:[2],bonusDice:[],modifier:0,resource:'law',
   changes:{law:-1},justification:'Consequência adversa da Sorte'
  });
  expect(after.permanent.law).toBe(-2);
  expect(after.fortunes[0]?.changes.law).toBe(-2);
  expect(s.permanent.law).toBe(0);
 });
 it('não aplica +2 de Defesa da Irmandade quando sua Abadia está inativa',()=>{
  const s=makeState();
  const abbey=holding('pros-abbey',{status:'destroyed'});
  const brotherhood=holding('pros-abbey--warrior-brotherhood',{
   parentId:abbey.id,militaryUnitId:'u'
  });
  s.holdings=[abbey,brotherhood];
  expect(unitMilitaryBonuses(s,unit()).defense).toBe(0);
  abbey.status='active';
  expect(unitMilitaryBonuses(s,unit()).defense).toBe(2);
 });
});
