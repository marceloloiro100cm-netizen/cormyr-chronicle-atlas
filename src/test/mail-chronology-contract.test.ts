import {describe,expect,it} from 'vitest';
import {
 formatRoundHarptosReference,roundPeriodMatchesCurrent,roundReferenceBelongsToMonth,
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

describe('Lote 25 · referência histórica não acompanha retificação da data atual',()=>{
 const source={
  year:1524,month:6,unassigned_round_count:1,
  events:[{id:'letter:festival',date:'1524-F-shieldmeet',
   title:'Correspondência entregue',kind:'mail'}],
  rounds:[{number:3,status:'closed',harptos_period:'1524-F-shieldmeet'}],
 };
 it('festivais e désdias pertencem apenas a seus próprios mês e ano',()=>{
  expect(roundReferenceBelongsToMonth('1524-F-shieldmeet',1524,6)).toBe(true);
  expect(roundReferenceBelongsToMonth('1524-F-shieldmeet',1524,0)).toBe(false);
  expect(roundReferenceBelongsToMonth('1523-F-shieldmeet',1523,6)).toBe(false);
  expect(roundReferenceBelongsToMonth('1524-07:désdia-2',1524,6)).toBe(true);
  expect(roundReferenceBelongsToMonth('1524-08:désdia-2',1524,6)).toBe(false);
  expect(roundReferenceBelongsToMonth('1523-07:désdia-2',1524,6)).toBe(false);
  expect(roundReferenceBelongsToMonth(null,1524,6)).toBe(false);
 });
 it('refusa rodada externa, sem data, duplicada ou inventada pela data atual',()=>{
  expect(validateCampaignChronology(source,1524,6).rounds[0]?.harptos_period)
   .toBe('1524-F-shieldmeet');
  const change=(period:string|null)=>({
   ...source,rounds:[{number:3,status:'closed',harptos_period:period}],
  });
  for(const period of [null,'1523-07:désdia-1','1524-08:désdia-2',
   '1524-F-midwinter','1523-F-shieldmeet','1524-07-12'])
   expect(()=>validateCampaignChronology(change(period),1524,6)).toThrow();
  expect(()=>validateCampaignChronology({
   ...source,rounds:[...source.rounds,{...source.rounds[0]}],
  },1524,6)).toThrow();
 });
});
