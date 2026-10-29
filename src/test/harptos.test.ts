import {describe,it,expect} from 'vitest';
import {annualEvents,dateKey,parseDate,formatDate,FESTIVALS} from '@/lib/calendar/harptos';
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
  expect(e.filter(e=>e.id.startsWith('waukeen-1-'))).toHaveLength(6);
  expect(e.every(e=>parseDate(e.date))).toBe(true);
  expect(new Set(e.map(e=>e.id)).size).toBe(e.length);
 });
 it('does not invent dates for historical mail',()=>{expect(formatDate(null)).toBe('Sem data de campanha');});
});
