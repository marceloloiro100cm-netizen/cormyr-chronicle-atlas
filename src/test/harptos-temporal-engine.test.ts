import {describe, expect, it} from 'vitest';
import {dateKey, FESTIVALS, MONTHS, parseDate} from '@/lib/calendar/harptos';
import {
  advanceHarptosDesdia,
  daysInHarptosYear,
  fromHarptosOrdinal,
  getHarptosDesdia,
  getHarptosOrdinal,
  getHarptosSeason,
  listCrossedHarptosPeriods,
  previewHarptosDesdia,
} from '@/lib/calendar/temporal-engine';

describe('Hub Temporal · Lote 2 · motor puro de Harptos', () => {
  it('numera a cronologia absoluta a partir de 1 Hammer 0001 CV', () => {
    expect(getHarptosOrdinal('0001-01-01')).toBe(0);
    expect(fromHarptosOrdinal(0)).toEqual(parseDate('0001-01-01'));
    expect(getHarptosOrdinal('0002-01-01')).toBe(365);
    expect(getHarptosOrdinal('0005-01-01')).toBe(1461);
  });

  it('mantém 365 dias normalmente e 366 quando existe Shieldmeet', () => {
    expect(daysInHarptosYear(1522)).toBe(365);
    expect(daysInHarptosYear(1523)).toBe(365);
    expect(daysInHarptosYear(1524)).toBe(366);
    expect(getHarptosOrdinal('1525-01-01') - getHarptosOrdinal('1524-01-01')).toBe(366);
    expect(() => daysInHarptosYear(0)).toThrow(RangeError);
    expect(() => daysInHarptosYear(10000)).toThrow(RangeError);
  });

  it('converte ida/volta de todos os dias ordinários e festivais dos dois tipos de ano', () => {
    for (const year of [1522, 1524]) {
      for (let month = 0; month < MONTHS.length; month++) {
        for (let day = 1; day <= 30; day++) {
          const input = {year, month, day, festival: null};
          const ordinal = getHarptosOrdinal(input);
          expect(fromHarptosOrdinal(ordinal)).toEqual(input);
        }
      }
      for (const festival of FESTIVALS) {
        const key = dateKey({year, month: festival.month, day: 30, festival: festival.id});
        if (festival.id === 'shieldmeet' && year % 4 !== 0) {
          expect(() => getHarptosOrdinal(key)).toThrow(RangeError);
          continue;
        }
        expect(dateKey(fromHarptosOrdinal(getHarptosOrdinal(key)))).toBe(key);
      }
    }
  });

  it('posiciona cada festival intercalar após seu mês, inclusive Midwinter', () => {
    const hammer30 = getHarptosOrdinal('1522-01-30');
    const midwinter = getHarptosOrdinal('1522-F-midwinter');
    const alturiak1 = getHarptosOrdinal('1522-02-01');
    expect(midwinter - hammer30).toBe(1);
    expect(alturiak1 - midwinter).toBe(1);

    const flamerule30 = getHarptosOrdinal('1524-07-30');
    const midsummer = getHarptosOrdinal('1524-F-midsummer');
    const shieldmeet = getHarptosOrdinal('1524-F-shieldmeet');
    const eleasis1 = getHarptosOrdinal('1524-08-01');
    expect([midsummer, shieldmeet, eleasis1].map(d => d - flamerule30)).toEqual([1, 2, 3]);
  });

  it('classifica mês, estação e désdia sem converter para semanas gregorianas', () => {
    expect(getHarptosDesdia('1522-03-01')).toBe(1);
    expect(getHarptosDesdia('1522-03-10')).toBe(1);
    expect(getHarptosDesdia('1522-03-11')).toBe(2);
    expect(getHarptosDesdia('1522-03-21')).toBe(3);
    expect(getHarptosDesdia('1522-F-midwinter')).toBeNull();
    expect(getHarptosSeason('1522-F-greengrass')).toBe('spring');
    expect(getHarptosSeason('1524-F-shieldmeet')).toBe('summer');
    expect(getHarptosSeason('1522-12-01')).toBe('winter');
  });

  it('soma DEZ dias ordinários, não salta à próxima fronteira de intervalo', () => {
    expect(dateKey(advanceHarptosDesdia('1522-03-17'))).toBe('1522-03-27');
    expect(dateKey(advanceHarptosDesdia('1522-02-25'))).toBe('1522-03-05');
    expect(dateKey(advanceHarptosDesdia('1522-03-11'))).toBe('1522-03-21');
    expect(dateKey(advanceHarptosDesdia('1522-03-17', 0))).toBe('1522-03-17');
  });

  it('atravessa Midwinter sem consumir um dia ordinário', () => {
    const p = previewHarptosDesdia('1522-01-21');
    expect(p.nextDateKey).toBe('1522-02-01');
    expect(p.desdiasAdvanced).toBe(1);
    expect(p.ordinaryDaysElapsed).toBe(10);
    expect(p.calendarDaysElapsed).toBe(11);
    expect(p.crossedMonths).toEqual([{year: 1522, month: 1, season: 'winter'}]);
    expect(p.crossedFestivals.map(f => f.festivalId)).toEqual(['midwinter']);
    expect(p.nextDesdia).toBe(1);
  });

  it('registra Midsummer e Shieldmeet em sequência no ano válido', () => {
    const ordinary = previewHarptosDesdia('1522-07-21');
    expect(ordinary.nextDateKey).toBe('1522-08-01');
    expect(ordinary.calendarDaysElapsed).toBe(11);
    expect(ordinary.crossedFestivals.map(f => f.festivalId)).toEqual(['midsummer']);

    const leap = previewHarptosDesdia('1524-07-21');
    expect(leap.nextDateKey).toBe('1524-08-01');
    expect(leap.ordinaryDaysElapsed).toBe(10);
    expect(leap.calendarDaysElapsed).toBe(12);
    expect(leap.crossedFestivals.map(f => f.festivalId)).toEqual(['midsummer', 'shieldmeet']);
  });

  it('parte de um festival e conta dez dias ordinários posteriores', () => {
    expect(dateKey(advanceHarptosDesdia('1522-F-midwinter'))).toBe('1522-02-10');
    expect(dateKey(advanceHarptosDesdia('1524-F-midsummer'))).toBe('1524-08-10');
    expect(dateKey(advanceHarptosDesdia('1524-F-shieldmeet'))).toBe('1524-08-10');
    expect(previewHarptosDesdia('1524-F-midsummer').crossedFestivals.map(x => x.festivalId)).toEqual(['shieldmeet']);
  });

  it('suporta a passagem de 21 Nightal de 1522 para 1 Hammer de 1523', () => {
    const p = previewHarptosDesdia('1522-12-21');
    expect(p.nextDateKey).toBe('1523-01-01');
    expect(p.crossedYears).toEqual([1523]);
    expect(p.crossedMonths).toEqual([{year: 1523, month: 0, season: 'winter'}]);
    expect(p.crossedSeasons).toEqual([]);
    expect(p.ordinaryDaysElapsed).toBe(10);
  });

  it('reconhece transições sazonais somente quando de fato mudam', () => {
    expect(previewHarptosDesdia('1522-02-21').crossedSeasons).toEqual([
      {year: 1522, month: 2, from: 'winter', to: 'spring'},
    ]);
    expect(previewHarptosDesdia('1522-05-21').crossedSeasons).toEqual([
      {year: 1522, month: 5, from: 'spring', to: 'summer'},
    ]);
    expect(previewHarptosDesdia('1522-08-21').crossedSeasons).toEqual([
      {year: 1522, month: 8, from: 'summer', to: 'autumn'},
    ]);
    expect(previewHarptosDesdia('1522-11-21').crossedSeasons).toEqual([
      {year: 1522, month: 11, from: 'autumn', to: 'winter'},
    ]);
  });

  it('um salto de várias désdias cruza todos os períodos sem repetir meses nem anos', () => {
    const preview = previewHarptosDesdia('1522-12-11', 5);
    expect(preview.nextDateKey).toBe('1523-02-01');
    expect(preview.desdiasAdvanced).toBe(5);
    expect(preview.ordinaryDaysElapsed).toBe(50);
    expect(preview.crossedYears).toEqual([1523]);
    expect(preview.crossedMonths.map(m => [m.year, m.month])).toEqual([
      [1523, 0], [1523, 1],
    ]);
    expect(preview.crossedFestivals.map(f => f.festivalId)).toEqual(['midwinter']);
  });

  it('o mesmo intervalo não gera efeitos duplicados nem altera os objetos de entrada', () => {
    const d = {year: 1522, month: 11, day: 21, festival: null};
    const before = JSON.stringify(d);
    expect(previewHarptosDesdia(d)).toEqual(previewHarptosDesdia(d));
    expect(JSON.stringify(d)).toBe(before);
    const p = listCrossedHarptosPeriods(d, d);
    expect(p.direction).toBe('same');
    expect(p.crossedMonths).toEqual([]);
    expect(p.crossedYears).toEqual([]);
    expect(p.crossedFestivals).toEqual([]);
    expect(p.ordinaryDaysElapsed).toBe(0);
    expect(p.calendarDaysElapsed).toBe(0);
  });

  it('suporta consultas de intervalos retroativos, sem reverter histórico', () => {
    const p = listCrossedHarptosPeriods('1522-03-01', '1522-02-30');
    expect(p.direction).toBe('backward');
    expect(p.calendarDaysElapsed).toBe(-1);
    expect(p.ordinaryDaysElapsed).toBe(-1);
    expect(p.crossedMonths.map(x => x.month)).toEqual([1]);
    expect(p.crossedSeasons).toEqual([
      {year: 1522, month: 1, from: 'spring', to: 'winter'},
    ]);
    expect(p.crossedYears).toEqual([]);
    const reverse = listCrossedHarptosPeriods('1524-08-01', '1524-07-30');
    expect(reverse.crossedFestivals.map(f => f.festivalId)).toEqual([
      'shieldmeet', 'midsummer',
    ]);
  });

  it('recusa datas inválidas, anos inexistentes e ordinais fora dos limites', () => {
    expect(() => getHarptosOrdinal('1523-F-shieldmeet')).toThrow(RangeError);
    expect(() => getHarptosOrdinal({year: 1522, month: 0, day: 30, festival: 'greengrass'})).toThrow(RangeError);
    expect(() => getHarptosOrdinal('1522-02-31')).toThrow(RangeError);
    expect(() => fromHarptosOrdinal(-1)).toThrow(RangeError);
    expect(() => fromHarptosOrdinal(1.5)).toThrow(RangeError);
    expect(() => advanceHarptosDesdia('1522-01-01', -1)).toThrow(RangeError);
    expect(() => advanceHarptosDesdia('1522-01-01', 1.5)).toThrow(RangeError);
    expect(() => advanceHarptosDesdia('9999-12-21')).toThrow(RangeError);
    expect(dateKey(fromHarptosOrdinal(getHarptosOrdinal('9999-12-30')))).toBe('9999-12-30');
  });
});
