import {describe,it,expect} from 'vitest';
import {newHouseState} from '@/lib/house/types';
import {calendarMonthIndex,calendarDrift,requireCalendarAlignment,reconcileHouseCalendar} from '@/lib/house/calendar-consistency';
import {balances} from '@/lib/house/engine';

describe('Lote complementar: Harptos global e reconciliação da Casa',()=>{
 const make=()=>{
  const state=newHouseState('isolated');state.phase='active';state.base.defense=50;
  state.month=1522*12;
  state.holdings.push({id:'tower',itemId:'tower',name:'Torre',domainId:'d',
    costs:[{resource:'defense',amount:10,mode:'allocation'}],effects:[],
    ruleVersion:'test',source:'test',status:'building'});
  state.projects.push({id:'project',holdingId:'tower',name:'Construção da Torre',
    start:state.month,duration:2,dice:[],status:'building',modifier:0});
  return state;
 };
 it('adota a data global, com anos e meses validados',()=>{
  expect(calendarMonthIndex({year:1522,month:0})).toBe(1522*12);
  expect(calendarMonthIndex({year:1523,month:0})).toBe(1523*12);
  expect(()=>calendarMonthIndex({year:1522,month:12})).toThrow('inválido');
  expect(()=>calendarMonthIndex({year:1522,month:-1})).toThrow('inválido');
 });
 it('distingue fichas atrasadas, alinhadas e adiantadas',()=>{
  const s=make();
  expect(calendarDrift(s.month,{year:1522,month:2})).toMatchObject({status:'behind',delta:2});
  expect(calendarDrift(s.month,{year:1522,month:0})).toMatchObject({status:'synced',delta:0});
  expect(calendarDrift(s.month,{year:1521,month:11})).toMatchObject({status:'ahead',delta:-1});
 });
 it('impede Sorte e ações mensais se a Casa ativa está fora do período',()=>{
  const s=make();
  expect(()=>requireCalendarAlignment(s,{year:1522,month:1})).toThrow('atrasada');
  expect(()=>requireCalendarAlignment(s,{year:1521,month:11})).toThrow('adiantada');
  expect(()=>requireCalendarAlignment(s,{year:1522,month:0})).not.toThrow();
  const draft={...s,phase:'draft' as const};
  expect(()=>requireCalendarAlignment(draft,{year:1522,month:10})).not.toThrow();
 });
 it('concilia atraso com justificativa, conclui obra e preserva estado anterior',()=>{
  const s=make();const next=reconcileHouseCalendar(s,{year:1522,month:2},'Conciliação oficial aprovada pelo Narrador.');
  expect(s.month).toBe(1522*12);
  expect(s.projects[0]?.status).toBe('building');
  expect(next.month).toBe(1522*12+2);
  expect(next.projects[0]?.status).toBe('completed');
  expect(next.holdings[0]?.status).toBe('active');
  expect(balances(next).available.defense).toBe(40);
 });
 it('não retrocede tempo nem autoriza no-op ou salto maior que 120 meses',()=>{
  const s=make();
  expect(()=>reconcileHouseCalendar(s,{year:1522,month:0},'Conciliação solicitada oficialmente.')).toThrow('sincronizada');
  expect(()=>reconcileHouseCalendar(s,{year:1521,month:11},'Conciliação solicitada oficialmente.')).toThrow('retrocesso');
  expect(()=>reconcileHouseCalendar(s,{year:1533,month:0},'Conciliação solicitada oficialmente.')).toThrow('120');
  expect(()=>reconcileHouseCalendar(s,{year:1522,month:1},'curta')).toThrow('justificativa');
 });
});
