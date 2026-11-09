import {describe,it,expect} from 'vitest';
import * as U from '@/lib/units/metric';
import {crzRangeHex,crzRangeHexFromMetres} from '@/lib/crusade/convert';
import {crzPreset,crzMetresPerCell,crzRulesetHash} from '@/lib/crusade/ruleset';
import {DND_METRES_PER_SQUARE,DND_DIAGONAL_SQUARE_COST} from '@/lib/crusade/dnd-mode';
import {dndLegacySpeedToMetric,dndMetricSpeedToLegacy,formatDndMetres} from '@/lib/crusade/dnd-metric';
describe('padronização métrica',()=>{
 it('conversões exatas',()=>{
  expect(U.feetToMetresExact(1)).toBe(0.3048);
  expect(U.milesToKmExact(1)).toBe(1.609344);
  expect(U.poundsToKgExact(1)).toBe(0.45359237);
  expect(U.poundsToKg(10)).toBe(4.5);
  expect(U.kgToPoundsExact(U.poundsToKgExact(7))).toBeCloseTo(7,12);
 });
 it('escala de mesa',()=>{
  expect(U.tableFeetToMetres(5)).toBe(1.5);
  expect(U.tableFeetToMetres(10)).toBe(3);
  for(let ft=0;ft<=300;ft+=5)expect(U.tableMetresToFeet(U.tableFeetToMetres(ft))).toBe(ft);
 });
 it('formatadores pt-BR',()=>{
  expect(U.formatMetres(4.5)).toBe('4,5 m');
  expect(U.formatDistance(1500)).toBe('1,5 km');
  expect(U.formatKg(2.25)).toBe('2,3 kg');
  expect(formatDndMetres(30)).toBe('9 m');
 });
 it('escala D&D 3 m e diagonal 1,5',()=>{
  expect(crzMetresPerCell(crzPreset('CRZ-5E','square'))).toBe(DND_METRES_PER_SQUARE);
  expect(DND_DIAGONAL_SQUARE_COST).toBe(1.5);
 });
 it('movimento métrico idêntico ao histórico (0..1000)',()=>{
  for(let ft=0;ft<=1000;ft++)expect(Math.round(U.tableFeetToDecimetres(ft)/30)).toBe(Math.round(ft/10));
 });
 it('alcance métrico idêntico ao legado',()=>{
  const old=(ft:number)=>ft<=30?2:ft<=80?3:ft<=150?4:ft<=300?5:6;
  for(let ft=1;ft<=2000;ft++)expect(crzRangeHex(ft)).toBe(old(ft));
  expect(crzRangeHexFromMetres(9)).toBe(2);expect(crzRangeHexFromMetres(90)).toBe(5);
 });
 it('hash do ruleset preservado (campo legado inalterado)',()=>{
  const r=crzPreset('CRZ-5E','square');
  expect(r.movement.feetPerHex).toBe(10);
  expect(crzRulesetHash(r)).toBe(crzRulesetHash(crzPreset('CRZ-5E','square')));
 });
 it('adaptador do bestiário preserva origem',()=>{
  const m=dndLegacySpeedToMetric({speed_ft:30,fly_ft:60});
  expect(m).toEqual({walkM:9,flyM:18,legacy:{speed_ft:30,fly_ft:60}});
  expect(dndMetricSpeedToLegacy({walkM:9,flyM:18})).toEqual({speed_ft:30,fly_ft:60});
 });
});
