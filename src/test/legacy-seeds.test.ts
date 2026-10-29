import { describe, it, expect } from 'vitest';
import { LEGACY_HOUSE_SEEDS } from '../lib/house/legacy-seeds';
import { balances } from '../lib/house/engine';
import { CORE_CATALOG } from '../lib/house/catalog';

describe('Legacy House Seeds', () => {
  const houses = ['ashkar', 'grantass', 'silversky', 'everlost', 'erdenor', 'fewmerry'];

  for (const house of houses) {
    it(`should correctly validate ${house} data structure and balances`, () => {
      const seed = LEGACY_HOUSE_SEEDS[house];
      expect(seed).toBeDefined();
      expect(seed.phase).toBe('active');
      expect(seed.domains.length).toBeGreaterThan(0);
      expect(seed.holdings.length).toBeGreaterThan(0);
      expect(seed.units.length).toBeGreaterThan(0);

      const b = balances(seed);
      // Validate that the totals calculated from the balances() function don't throw an error and exist.
      expect(b).toBeDefined();
      expect(b.total).toBeDefined();
      expect(b.total.defense).toBeDefined();
      expect(b.total.influence).toBeDefined();
      expect(b.total.lands).toBeDefined();
      expect(b.total.law).toBeDefined();
      expect(b.total.population).toBeDefined();
      expect(b.total.power).toBeDefined();
      expect(b.total.wealth).toBeDefined();
    });
  }
});
