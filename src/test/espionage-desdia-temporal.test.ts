import {describe,it,expect} from 'vitest';
import {getHarptosOrdinal} from '@/lib/calendar/temporal-engine';
import {planSpyRegionalMission,type SpyRegionalAgent,type SpyRegionalConnection} from '@/lib/espionage/region-turns';
import {projectSpyHarptosSchedule,SPY_DAYS_PER_ROUND} from '@/lib/espionage/round-calendar';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const spy:SpyRegionalAgent={id:a,codename:'Batedor',status:'available',currentRegion:'helmlands'};
const land=(id:string,fromRegion:string,toRegion:string):SpyRegionalConnection=>({
 id,fromRegion,toRegion,passage:'land_neighbor',bidirectional:true,version:1});
const links:SpyRegionalConnection[]=[
 land(b,'helmlands','shieldmark'),land(c,'shieldmark','horselands'),
];
function schedule(opts:{destination?:string;officialDate?:string;sea?:boolean;includeReturn?:boolean;source?:SpyRegionalAgent;links?:SpyRegionalConnection[]}={}){
 const graph=opts.sea?[...links,{
  id:'44444444-4444-4444-8444-444444444444',fromRegion:'helmlands',
  toRegion:'horselands',passage:'sea_passage' as const,bidirectional:true,version:1,
 }]:opts.links??links;
 const plan=planSpyRegionalMission({agent:opts.source??spy,
  destinationRegion:opts.destination??'horselands',
  links:graph,seaAllowed:opts.sea??false,includeReturn:opts.includeReturn});
 if(plan.status!=='ready')throw new Error('Expected approved fixture route');
 return projectSpyHarptosSchedule({plan,
  officialDate:opts.officialDate??'1522-01-01',calendarVersion:7});
}
describe('Espionagem · 1 rodada = 1 désdia de 10 dias ordinários de Harptos',()=>{
 it('usa somente a data oficial e não confunde désdia com rodada de missivas',()=>{
  expect(SPY_DAYS_PER_ROUND).toBe(10);
  const s=schedule({destination:'helmlands',links:[]});
  expect(s.source).toBe('published_campaign_calendar');
  expect(s.calendarVersion).toBe(7);
  expect(s.travelRounds).toBe(0);
  expect(s.ordinaryDaysToConclusion).toBe(10);
  expect(s.arrivesAtTargetDateKey).toBe('1522-01-01');
  expect(s.investigationEndsDateKey).toBe('1522-01-11');
  expect(s.travelLegs).toHaveLength(0);
 });
 it('uma travessia dura 10 dias ordinários e missão mais 10 dias',()=>{
  const s=schedule({destination:'shieldmark'});
  expect(s.travelRounds).toBe(1);
  expect(s.travelLegs[0]?.departureDateKey).toBe('1522-01-01');
  expect(s.arrivesAtTargetDateKey).toBe('1522-01-11');
  expect(s.investigationEndsDateKey).toBe('1522-01-21');
  expect(s.totalRounds).toBe(2);
  expect(s.ordinaryDaysToConclusion).toBe(20);
 });
 it('duas fronteiras homologadas e missão concluem 3 désdias depois',()=>{
  const s=schedule();
  expect(s.travelLegs.map(l=>l.arrivalDateKey)).toEqual(['1522-01-11','1522-01-21']);
  expect(s.investigationEndsDateKey).toBe('1522-02-01');
  expect(s.ordinaryDaysToConclusion).toBe(30);
  expect(s.totalRounds).toBe(3);
 });
 it('mar em um só trecho e retorno projetam 10+10+10 dias ordinários',()=>{
  const s=schedule({officialDate:'1524-07-30',sea:true,includeReturn:true});
  expect(s.travelRounds).toBe(1);
  expect(s.travelLegs[0]?.passage).toBe('sea_passage');
  expect(s.arrivesAtTargetDateKey).toBe('1524-08-10');
  expect(s.investigationEndsDateKey).toBe('1524-08-20');
  expect(s.returnArrivalDateKey).toBe('1524-08-30');
  expect(s.ordinaryDaysWithReturn).toBe(30);
  expect(s.crossedFestivalsUntilConclusion.map(f=>f.festivalId))
   .toEqual(['midsummer','shieldmeet']);
  expect(getHarptosOrdinal(s.arrivesAtTargetDateKey)-getHarptosOrdinal(s.officialDateKey)).toBe(12);
 });
 it('não acrescenta mês 13 nem dias gregorianos ao virar o ano',()=>{
  const s=schedule({destination:'helmlands',links:[],officialDate:'1522-12-30'});
  expect(s.investigationEndsDateKey).toBe('1523-01-10');
 });
 it('datas intermediárias mantêm dez dias completos, não arredondam para o início da désdia',()=>{
  const s=schedule({destination:'helmlands',links:[],officialDate:'1522-01-05'});
  expect(s.investigationEndsDateKey).toBe('1522-01-15');
 });
 it('partida em festival intercalar usa como origem o último dia ordinário anterior',()=>{
  const s=schedule({destination:'helmlands',links:[],officialDate:'1524-F-shieldmeet'});
  expect(s.officialDateKey).toBe('1524-F-shieldmeet');
  expect(s.investigationEndsDateKey).toBe('1524-08-10');
 });
 it('a posição corrente do espião, não a sede, define a distância e o prazo',()=>{
  const s=schedule({source:{...spy,currentRegion:'shieldmark'}});
  expect(s.startRegion).toBe('shieldmark');
  expect(s.travelRounds).toBe(1);
  expect(s.arrivesAtTargetDateKey).toBe('1522-01-11');
 });
 it('retorno sem rota válida permanece desconhecido, nunca inventado',()=>{
  const oneWay:SpyRegionalConnection={...land(b,'helmlands','shieldmark'),bidirectional:false};
  const s=schedule({destination:'shieldmark',links:[oneWay],includeReturn:true});
  expect(s.returnLegs).toBeNull();
  expect(s.returnArrivalDateKey).toBeNull();
  expect(s.ordinaryDaysWithReturn).toBeNull();
 });
 it('a prévia não altera o plano nem o calendário fornecido',()=>{
  const original={year:1524,month:6,day:30,festival:null};
  const originalCopy={...original};
  const s=schedule({officialDate:'1524-07-30'});
  expect(s.calendarVersion).toBe(7);
  expect(original).toEqual(originalCopy);
  expect(s.investigationEndsDateKey).toBe('1524-08-30');
 });
 it('recusa data e versão não oficiais ou inválidas',()=>{
  const plan=planSpyRegionalMission({agent:spy,destinationRegion:'helmlands',links:[],seaAllowed:false});
  if(plan.status!=='ready')throw new Error('Missing fixture');
  expect(()=>projectSpyHarptosSchedule({plan,officialDate:'1523-F-shieldmeet',calendarVersion:1})).toThrow();
  expect(()=>projectSpyHarptosSchedule({plan,officialDate:'1524-01-01',calendarVersion:-1})).toThrow('Versão');
 });
});
