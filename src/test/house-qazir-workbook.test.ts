import {describe,it,expect} from 'vitest';
import {QAZIR_WORKBOOK} from '@/server/qazir-workbook';
import {vassalWorkbookBalances,vassalWorkbookReport} from '@/lib/house/vassal-workbook';
import {RESOURCE_KEYS} from '@/lib/house/types';

describe('Casa Qazir — fidelidade da planilha importada',()=>{
 it('mantém os sete atributos e os saldos exatos sem deduzir tropas sem custo',()=>{
  const b=vassalWorkbookBalances(QAZIR_WORKBOOK);
  expect(RESOURCE_KEYS).toHaveLength(7);
  expect(b.total).toEqual({defense:30,influence:20,lands:80,law:20,population:20,power:20,wealth:10});
  expect(b.allocated).toEqual({defense:30,influence:0,lands:50,law:0,population:0,power:7,wealth:10});
  expect(b.available).toEqual({defense:0,influence:20,lands:30,law:20,population:20,power:13,wealth:0});
  expect(QAZIR_WORKBOOK.fortune.law+QAZIR_WORKBOOK.fortune.population+QAZIR_WORKBOOK.fortune.maester).toBe(-2);
 });
 it('preserva todas as linhas de bens sem fundir 3 povoados ou somar alocações na Ashkar',()=>{
  expect(QAZIR_WORKBOOK.assets).toHaveLength(12);
  expect(QAZIR_WORKBOOK.assets.filter(x=>x.group==='Terras')).toHaveLength(9);
  expect(QAZIR_WORKBOOK.assets.filter(x=>x.name.startsWith('Povoado —'))).toHaveLength(3);
  expect(QAZIR_WORKBOOK.assets.find(x=>x.name==='Apoio')).toMatchObject({cost:7,resource:'power'});
  expect(QAZIR_WORKBOOK.suzerainId).toBe('ashkar');
 });
 it('inclui 3 companhias com os dados escritos e 6 personagens, sem inventar domínio ou custo militar',()=>{
  expect(QAZIR_WORKBOOK.units).toHaveLength(3);
  expect(QAZIR_WORKBOOK.units.map(u=>u.name)).toEqual([
   'Guardas da Lamparina','Cavaleiros da Estrada da Lamparina','Batedores do Sal',
  ]);
  expect(QAZIR_WORKBOOK.units[0]).toMatchObject({type:'Guarnição',training:'Treinada',
   commander:'Nadir al-Safa',health:9,defense:6,fighting:3,marksmanship:2});
  expect(QAZIR_WORKBOOK.units[2]).toMatchObject({agility:4,stealth:4,health:6,defense:9});
  expect(QAZIR_WORKBOOK.people).toHaveLength(6);
  expect(QAZIR_WORKBOOK.people.some(p=>p.name==='Samira Qasir')).toBe(true);
  expect(QAZIR_WORKBOOK.history).toHaveLength(4);
  const report=vassalWorkbookReport(QAZIR_WORKBOOK);
  expect(report.map(x=>x.title)).toEqual(expect.arrayContaining([
   'Identidade','Recursos','Terras','Fortificações','Economia','Exército',
   'Sorte da Casa','Tropas','Habilidades militares','Família e corte','História da casa',
   'Pendências de conciliação',
  ]));
  expect(report.find(x=>x.title==='Recursos')?.rows).toHaveLength(7);
  expect(report.find(x=>x.title==='Tropas')?.rows).toHaveLength(3);
  expect(report.find(x=>x.title==='Família e corte')?.rows).toHaveLength(6);
 });
});
