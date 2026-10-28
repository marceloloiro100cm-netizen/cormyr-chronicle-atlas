import { describe, it, expect } from 'vitest';
import { CORE_CATALOG } from '@/lib/house/catalog';
import { newHouseState, type CatalogItem, type Resource } from '@/lib/house/types';
import { quote } from '@/lib/house/engine';

function filterCatalog(
  catalog: CatalogItem[],
  filters: {
    category?: string;
    query?: string;
    resourceFilter?: Resource | '';
    maxCost?: number | '';
    durationFilter?: 'all' | 'immediate' | 'construction';
    repeatableFilter?: 'all' | 'repeatable' | 'unique';
    availableOnly?: boolean;
    state?: ReturnType<typeof newHouseState>;
    domainId?: string;
  }
) {
  const {
    category = '',
    query = '',
    resourceFilter = '',
    maxCost = '',
    durationFilter = 'all',
    repeatableFilter = 'all',
    availableOnly = false,
    state = newHouseState('test'),
    domainId = '',
  } = filters;

  return catalog.filter(i => {
    if (category) {
      const selectedCats = category.includes(',') ? category.split(',') : [category];
      if (!selectedCats.includes(i.category)) return false;
    }

    if (query) {
      const qText = query.toLowerCase();
      const text = `${i.name} ${i.original} ${i.description}`.toLowerCase();
      if (!text.includes(qText)) return false;
    }

    if (resourceFilter) {
      if (!i.costs.some(c => c.resource === resourceFilter)) return false;
    }

    if (maxCost !== '' && typeof maxCost === 'number') {
      if (resourceFilter) {
        const matchingCost = i.costs.find(c => c.resource === resourceFilter);
        if (matchingCost && matchingCost.amount > maxCost) return false;
      } else {
        if (i.costs.some(c => c.amount > maxCost)) return false;
      }
    }

    if (durationFilter === 'immediate') {
      if (i.duration.months > 0 || (i.duration.dice ?? 0) > 0) return false;
    } else if (durationFilter === 'construction') {
      if (i.duration.months === 0 && (i.duration.dice ?? 0) === 0) return false;
    }

    if (repeatableFilter === 'repeatable' && !i.repeatable) return false;
    if (repeatableFilter === 'unique' && i.repeatable) return false;

    if (availableOnly) {
      const qRes = quote(i, state, domainId);
      if (qRes.errors.length > 0) return false;
    }

    return true;
  });
}

describe('filtros de compras de posses', () => {
  it('filtra por categoria especifica e combinada', () => {
    const fortificationOnly = filterCatalog(CORE_CATALOG, { category: 'fortification' });
    expect(fortificationOnly.length).toBeGreaterThan(0);
    expect(fortificationOnly.every(i => i.category === 'fortification')).toBe(true);

    const terrainDomainCats = filterCatalog(CORE_CATALOG, { category: 'terrain,feature,community' });
    expect(terrainDomainCats.length).toBeGreaterThan(0);
    expect(terrainDomainCats.every(i => ['terrain', 'feature', 'community'].includes(i.category))).toBe(true);
  });

  it('filtra por texto no nome ou na descricao', () => {
    const casteloQuery = filterCatalog(CORE_CATALOG, { query: 'Castelo' });
    expect(casteloQuery.some(i => i.name.includes('Castelo') || i.description.includes('Castelo'))).toBe(true);
  });

  it('filtra por recurso de custo e custo maximo', () => {
    const defenseItems = filterCatalog(CORE_CATALOG, { resourceFilter: 'defense' });
    expect(defenseItems.every(i => i.costs.some(c => c.resource === 'defense'))).toBe(true);

    const cheapDefenseItems = filterCatalog(CORE_CATALOG, { resourceFilter: 'defense', maxCost: 20 });
    expect(cheapDefenseItems.every(i => {
      const cost = i.costs.find(c => c.resource === 'defense');
      return cost ? cost.amount <= 20 : false;
    })).toBe(true);
  });

  it('filtra por tempo de obra (imediata vs construcao)', () => {
    const immediate = filterCatalog(CORE_CATALOG, { durationFilter: 'immediate' });
    expect(immediate.every(i => i.duration.months === 0 && (i.duration.dice ?? 0) === 0)).toBe(true);

    const construction = filterCatalog(CORE_CATALOG, { durationFilter: 'construction' });
    expect(construction.every(i => i.duration.months > 0 || (i.duration.dice ?? 0) > 0)).toBe(true);
  });

  it('filtra por repetibilidade (repetivel vs unica)', () => {
    const repeatable = filterCatalog(CORE_CATALOG, { repeatableFilter: 'repeatable' });
    expect(repeatable.every(i => i.repeatable === true)).toBe(true);

    const unique = filterCatalog(CORE_CATALOG, { repeatableFilter: 'unique' });
    expect(unique.every(i => i.repeatable === false)).toBe(true);
  });

  it('filtra por disponibilidade no local (somente disponiveis com saldo suficiente)', () => {
    const state = newHouseState('test-house');
    state.base.defense = 10; // Saldo de defesa = 10
    state.domains = [{ id: 'd1', name: 'Domínio 1', terrain: 'hills', features: [], notes: '' }];

    const availableDefense = filterCatalog(CORE_CATALOG, {
      category: 'fortification',
      availableOnly: true,
      state,
      domainId: 'd1',
    });

    // Itens com custo maior que 10 de defesa devem ter sido filtrados
    expect(availableDefense.every(i => {
      const qRes = quote(i, state, 'd1');
      return qRes.errors.length === 0;
    })).toBe(true);
  });
});
