import { describe, it, expect } from 'vitest';
import { LEGACY_HOUSE_SEEDS } from '../lib/house/legacy-seeds';
import { balances } from '../lib/house/engine';
import { RESOURCE_KEYS } from '../lib/house/types';
import sources from './fixtures/house-workbooks-2026-10-29.json';

const expected = {
 ashkar: [0,30,1,30,5,0,1],
 grantass: [4,9,0,2,15,1,4],
 silversky: [11,33,7,27,40,1,37],
 everlost: [0,0,0,40,29,0,0],
 erdenor: [9,1,2,30,44,16,16],
 fewmerry: [1,13,0,22,38,0,5],
};
describe('workbook reconciliation 2026-10-29', () => {
 for (const [key, source] of Object.entries(sources)) {
  it(key + ': includes initial bonuses exactly once and matches source accounting', () => {
   const state = LEGACY_HOUSE_SEEDS[key]!;
   for (const [i,resource] of RESOURCE_KEYS.entries()) {
    const column = String.fromCharCode(66+i);
    const inputs = source.cells.filter(c => c.cell.startsWith(column) && Number(c.cell.slice(1)) >= 8 && Number(c.cell.slice(1)) < source.totalRow);
    const sum = inputs.reduce((n,c) => n + (typeof c.value === 'number' ? c.value : 0),0);
    expect(state.base[resource], resource).toBe(sum);
    expect(source.cells.find(c => c.cell === column+source.totalRow)?.value).toBe(sum);
   }
   expect(state.method).toBe('import');
   expect(state.regionalApplied).toBe(false);
   expect(RESOURCE_KEYS.map(r => balances(state).available[r])).toEqual(expected[key as keyof typeof expected]);
   expect(state.importSources.join(' ')).toContain(source.file);
   const ids = [...state.holdings,...state.units].map(x => x.id);
   expect(new Set(ids).size).toBe(ids.length);
  });
 }
 it('Erdenor includes the final pasture omitted from the spreadsheet total', () => {
  const source = sources.erdenor.cells;
  expect(source.find(c => c.cell === 'E29')?.value).toBe(-1);
  expect(source.find(c => c.cell === 'E30')?.value).toBe(3);
  expect(balances(LEGACY_HOUSE_SEEDS.erdenor!).available.lands).toBe(2);
 });
 it('preserves historical military costs and flags incomplete military sources', () => {
  const state = LEGACY_HOUSE_SEEDS.fewmerry!;
  expect(state.units.find(u => u.types.includes('infantry'))?.costs[0]?.amount).toBe(5);
  expect(state.units.find(u => u.types.includes('support'))?.costs[0]?.amount).toBe(7);
  expect(state.units.every(u => u.notes.includes('não confirmados'))).toBe(true);
 });
 it('does not turn fortune test modifiers into permanent Law losses', () => {
  for (const key of ['ashkar','grantass','fewmerry']) expect(LEGACY_HOUSE_SEEDS[key]!.permanent.law).toBe(0);
 });
});
