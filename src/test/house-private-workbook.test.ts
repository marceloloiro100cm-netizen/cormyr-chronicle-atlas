import {describe,it,expect} from 'vitest';
import type {VassalWorkbook} from '@/lib/house/vassal-workbook';
import {vassalWorkbookBalances,vassalWorkbookReport} from '@/lib/house/vassal-workbook';

const isolated:VassalWorkbook={
 houseId:'fixture',name:'Casa de Exemplo',suzerainId:'parent',region:'fictional',
 lord:'',heir:'',motto:'',foundation:1,castle:'',city:'',source:'isolated test',
 resources:{defense:10,influence:10,lands:10,law:10,population:10,power:10,wealth:10},
 assets:[{name:'Generic hall',group:'Fortificações',resource:'defense',cost:4}],
 people:[],units:[],history:[],
};
describe('Imported vassal report uses synthetic data only',()=>{
 it('preserves resources, allocation and remaining balance',()=>{
  const r=vassalWorkbookBalances(isolated);
  expect(r.allocated.defense).toBe(4);
  expect(r.available.defense).toBe(6);
  expect(r.available.power).toBe(10);
 });
 it('produces a summary without requiring real campaign snapshots',()=>{
  const report=vassalWorkbookReport(isolated);
  expect(report.some(s=>s.title==='Recursos')).toBe(true);
  expect(report.some(s=>s.title==='Fortificações')).toBe(true);
 });
});
