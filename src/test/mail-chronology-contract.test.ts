import {describe,expect,it} from 'vitest';
import {
 formatRoundHarptosReference,roundPeriodMatchesCurrent,
 validateCampaignChronology,
} from '@/lib/calendar/chronology';

describe('Hub Temporal · Lote 8 · distinção entre rodada e désdia',()=>{
 it('mostra o período de abertura de uma semana sem inventar data da carta',()=>{
  expect(formatRoundHarptosReference('1522-01:désdia-3')).toBe('3ª désdia · Hammer · 1522 CV');
  expect(formatRoundHarptosReference('1522-F-midwinter')).toContain('Midwinter');
  expect(formatRoundHarptosReference(null)).toBe('Referência histórica não registrada');
  expect(formatRoundHarptosReference('1522-13:désdia-2')).toContain('inválida');
  expect(roundPeriodMatchesCurrent('1522-01:désdia-3','1522-01-25')).toBe(true);
  expect(roundPeriodMatchesCurrent('1522-01:désdia-3','1522-02-01')).toBe(false);
  expect(roundPeriodMatchesCurrent('1522-F-midwinter','1522-F-midwinter')).toBe(true);
  expect(roundPeriodMatchesCurrent(null,'1522-01-01')).toBe(false);
 });
 it('valida cronologia com festival e rodada congelada, sem converter semana em data',()=>{
  const value={
   year:1524,month:6,unassigned_round_count:1,
   events:[
    {id:'schedule:1',date:'1524-07-02',title:'Audiência publicada',kind:'kingdom'},
    {id:'letter:1',date:'1524-F-shieldmeet',title:'Missiva histórica',kind:'mail'},
   ],
   rounds:[{number:7,status:'closed',harptos_period:'1524-07:désdia-1'}],
  };
  const v=validateCampaignChronology(value,1524,6);
  expect(v.events).toHaveLength(2);
  expect(v.rounds[0]?.harptos_period).toBe('1524-07:désdia-1');
  expect(v.unassigned_round_count).toBe(1);
  expect(()=>validateCampaignChronology(value,1522,6)).toThrow();
  expect(()=>validateCampaignChronology({...value,events:[
   {id:'letter:1',date:'1524-F-shieldmeet',title:'Uma',kind:'mail'},
   {id:'letter:1',date:'1524-F-shieldmeet',title:'Duas',kind:'mail'},
  ]},1524,6)).toThrow();
  expect(()=>validateCampaignChronology({...value,events:[
   {id:'letter:1',date:'1522-F-shieldmeet',title:'Inexistente',kind:'mail'},
  ]},1524,6)).toThrow();
  expect(()=>validateCampaignChronology({...value,events:[
   {id:'letter:1',date:'1524-F-midwinter',title:'Mês errado',kind:'mail'},
  ]},1524,6)).toThrow();
 });
});
