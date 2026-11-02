import {describe,it,expect} from 'vitest';
import {EVERET_WORKBOOK} from '@/server/everet-workbook';
import {QAZIR_WORKBOOK} from '@/server/qazir-workbook';
import {vassalWorkbookBalances,vassalWorkbookReport} from '@/lib/house/vassal-workbook';

describe('Ficha Everet — planilha e história do Atlas',()=>{
 it('importa os recursos exatos, 73 Poder nas oito tropas e 50 Riqueza sem cobrança duplicada',()=>{
  const balances=vassalWorkbookBalances(EVERET_WORKBOOK);
  expect(balances.total).toEqual({defense:10,influence:20,lands:15,law:15,population:15,power:75,wealth:50});
  expect(balances.allocated).toEqual({defense:10,influence:0,lands:0,law:0,population:0,power:73,wealth:50});
  expect(balances.available).toEqual({defense:0,influence:20,lands:15,law:15,population:15,power:2,wealth:0});
  expect(EVERET_WORKBOOK.units).toHaveLength(8);
  expect(EVERET_WORKBOOK.assets.filter(a=>a.group==='Exército'&&a.resource==='power')).toHaveLength(8);
  expect(EVERET_WORKBOOK.assets.filter(a=>a.resource==='wealth')).toHaveLength(4);
  expect(EVERET_WORKBOOK.assets.find(a=>a.name==='Maquinário de Cerco Pesado')?.cost).toBe(10);
  expect(EVERET_WORKBOOK.assets.some(a=>a.name.includes('Catapulta'))).toBe(false);
 });
 it('completa os dados históricos e a família, sem trocar a suserana definida pelo Narrador',()=>{
  expect(EVERET_WORKBOOK.houseId).toBe('everet');
  expect(EVERET_WORKBOOK.suzerainId).toBe('everlost');
  expect(EVERET_WORKBOOK.lord).toBe('Afonso Everet');
  expect(EVERET_WORKBOOK.heir).toBe('Ser Duarte Everet');
  expect(EVERET_WORKBOOK.castle).toContain('Lastward Keep');
  expect(EVERET_WORKBOOK.city).toContain('Zorastryl');
  expect(EVERET_WORKBOOK.foundation).toBe(426);
  expect(EVERET_WORKBOOK.territorialGrantYear).toBe(1513);
  expect(EVERET_WORKBOOK.motto).toContain('Riding to the End');
  expect(EVERET_WORKBOOK.title).toContain('Senhores de Zorastryl');
  expect(EVERET_WORKBOOK.people).toHaveLength(8);
  expect(EVERET_WORKBOOK.people.map(x=>x.name)).toEqual(expect.arrayContaining([
   'Afonso Everet','Lady Leonor Torith','Ser Duarte Everet','Lady Amália Everet',
   'Gaspar Everet','Beatriz Everet','Ser Martim Everet','Lady Alda Everet',
  ]));
  expect(EVERET_WORKBOOK.reviewNotes?.some(x=>x.includes('Mantlepard'))).toBe(true);
 });
 it('o PDF inclui identidade, bens, forças, papéis, história e pendências reais',()=>{
  const sections=vassalWorkbookReport(EVERET_WORKBOOK);
  const identity=sections.find(s=>s.title==='Identidade')!;
  expect(identity.rows).toEqual(expect.arrayContaining([
   ['Lorde','Afonso Everet'],['Herdeiro','Ser Duarte Everet'],
   ['Concessão territorial CV',1513],
   ['Fundação CV',426],
  ]));
  expect(sections.find(s=>s.title==='Tropas')?.rows).toHaveLength(8);
  expect(sections.find(s=>s.title==='Família e corte')?.rows).toHaveLength(8);
  expect(sections.find(s=>s.title==='História da casa')?.rows.length).toBeGreaterThan(0);
  expect(sections.find(s=>s.title==='Pendências de conciliação')?.rows.length).toBeGreaterThan(5);
  expect(EVERET_WORKBOOK.fortune).toBeUndefined();
 });
 it('não muda as bases nem o arquivo de consulta da Qazir',()=>{
  expect(QAZIR_WORKBOOK.houseId).toBe('qazir');
  expect(QAZIR_WORKBOOK.suzerainId).toBe('ashkar');
  expect(vassalWorkbookBalances(QAZIR_WORKBOOK).available).toMatchObject({
   defense:0,influence:20,lands:30,power:13,wealth:0,
  });
 });
});