import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  WAUKEEN_FESTIVALS,
  TYR_OBSERVANCES,
  SEASON_MARKERS,
  canonicalObservanceEntries,
  fixedFestivalDescription,
  festivalsInRange,
  absoluteDay,
} from './hub-model';

describe('Hub Temporal: unificação de festivais e limpeza técnica', () => {
  it('unifica todos os 12 festivais de Waukeen, 3 ritos mensais de Tyr (36/ano) e 4 estações', () => {
    expect(WAUKEEN_FESTIVALS).toHaveLength(12);
    expect(TYR_OBSERVANCES).toHaveLength(3);
    expect(SEASON_MARKERS).toHaveLength(4);
    const entries = canonicalObservanceEntries();
    expect(entries).toHaveLength(12 + 36 + 4);
    // Sornyn em Flamerule (mês 6) dura 3 dias (3 a 5 de Flamerule).
    const start = absoluteDay({year: 1522, month: 6, day: 3, festival: null});
    const end = absoluteDay({year: 1522, month: 6, day: 6, festival: null});
    const occ = festivalsInRange(entries, start, end);
    const sornyn = occ.find(o => o.festival.name.includes('Sornyn'));
    expect(sornyn).toBeDefined();
    expect(sornyn!.end - sornyn!.start).toBe(3);
  });

  it('enriquece a descrição dos dias festivos fixos de Harptos com os costumes de Cormyr', () => {
    const desc = fixedFestivalDescription('greengrass', 'fallback');
    expect(desc).toContain('Chauntea');
  });

  it('remove painéis técnicos, calendário duplicado e link quebrado /diagnostico da interface de jogo', () => {
    const ws = readFileSync('src/components/players/players-workspace.tsx', 'utf8');
    expect(ws).not.toContain('<PublicChronicleCalendar');
    expect(ws).not.toContain('FirebaseRuntimeApprovals');
    expect(ws).not.toContain('FirebaseCouncilAccessReview');

    const ficha = readFileSync('src/components/players/ficha-tab.tsx', 'utf8');
    expect(ficha).not.toContain('Economia Firebase');

    const shell = readFileSync('src/components/campaign-shell.tsx', 'utf8');
    expect(shell).not.toContain('/diagnostico');

    const narrator = readFileSync('src/components/players/narrator/NarratorWorkspace.tsx', 'utf8');
    expect(narrator).not.toContain('/diagnostico');
  });
});
