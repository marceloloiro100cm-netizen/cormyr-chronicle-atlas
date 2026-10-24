import { balances } from './engine';
import { RESOURCE_KEYS, type HouseState } from './types';
export const HOUSE_CHART_MAX = 100;
export function houseResourceChart(state: HouseState) {
  const b = balances(state);
  return RESOURCE_KEYS.map(resource => ({ resource, total: b.total[resource], plotted: Math.min(HOUSE_CHART_MAX, Math.max(0, b.total[resource])) }));
}