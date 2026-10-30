import {describe,it,expect} from 'vitest';
import {annualEvents,eventsForHarptosPeriod,dateKey,parseDate,formatDate,FESTIVALS} from '@/lib/calendar/harptos';
describe('Harptos campaign dates',()=>{
 it('accepts all 360 ordinary days without Gregorian rules',()=>{
  for(let month=0;month<12;month++)for(let day=1;day<=30;day++){
   const d={year:1522,month,day,festival:null};expect(parseDate(dateKey(d))).toEqual(d);
  }
  expect(parseDate('1522-02-30')).not.toBeNull();
 });
 it('rejects invalid or partial dates',()=>{for(const v of ['',null,'1522-00-01','1522-13-01','1522-01-31','1522-01-00','0000-01-01','1522-1-1','1522-F-unknown'])expect(parseDate(v)).toBeNull();});
 it('places Midsummer after Flamerule and Shieldmeet only in leap years',()=>{
  expect(FESTIVALS.find(f=>f.id==='midsummer')?.month).toBe(6);
  expect(parseDate('1522-F-shieldmeet')).toBeNull();expect(parseDate('1524-F-shieldmeet')?.month).toBe(6);
  expect(annualEvents(1524).length-annualEvents(1522).length).toBe(1);
 });
 it('keeps festival, mail and season categories distinct',()=>{
  const e=annualEvents(1522);expect(e.filter(e=>e.kind==='season')).toHaveLength(4);
  expect(e.filter(e=>e.id.startsWith('tyr-'))).toHaveLength(36);
  expect(e.filter(e=>e.id.startsWith('waukeen-1-'))).toHaveLength(1);
  expect(e.filter(e=>e.id.startsWith('waukeen-6-'))).toHaveLength(3);
  expect(e.every(e=>parseDate(e.date))).toBe(true);
  expect(new Set(e.map(e=>e.id)).size).toBe(e.length);
 });
 it('uses the canonical Waukeen feast names and dates, not the superseded prompt',()=>{
  const events=annualEvents(1522);
  const expected=[
    ['1522-01-15','Conforto da Contagem Fria'],['1522-02-20','Grande Tecelagem'],
    ['1522-03-30','Moeda Alta'],['1522-04-10','Esferas'],['1522-05-12','Sammardach'],
    ['1522-06-21','Brightbuckle'],['1522-07-03','Sornyn'],['1522-07-04','Sornyn'],
    ['1522-07-05','Sornyn'],['1522-08-17','Huldark'],['1522-09-07','Spryndalstar'],
    ['1522-10-01','Marthoon'],['1522-11-10','Tehennteahan'],['1522-12-25','Orbar'],
  ];
  for(const [date,title] of expected){
   expect(events.some(e=>e.date===date&&e.title.includes('Waukeen · '+title))).toBe(true);
  }
 });
 it('uses Ver a Justiça, Mutilamento and O Vínculo across every month',()=>{
  const e=annualEvents(1522);
  for(let m=1;m<=12;m++){
    const prefix='1522-'+String(m).padStart(2,'0')+'-';
    expect(e.find(x=>x.date===prefix+'01')?.title).toContain('Ver a Justiça');
    expect(e.find(x=>x.date===prefix+'13')?.title).toContain('Mutilamento');
    expect(e.find(x=>x.date===prefix+'22')?.title).toContain('O Vínculo');
  }
 });
 it('does not interpret an ordinary désdia as a fixed campaign week',()=>{
  const e=eventsForHarptosPeriod('1522-07-04');
  expect(e.filter(x=>x.title.includes('Sornyn'))).toHaveLength(3);
  expect(e.some(x=>x.date==='1522-F-midsummer')).toBe(false);
  expect(eventsForHarptosPeriod('1522-F-midsummer')).toHaveLength(1);
 });
 it('does not invent dates for historical mail',()=>{expect(formatDate(null)).toBe('Sem data de campanha');});
});
