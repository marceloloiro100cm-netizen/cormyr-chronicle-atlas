/**
 * Motor puro de tempo de Harptos.
 *
 * Lote 2 do Hub Temporal: NÃO altera o calendário publicado, rodadas,
 * estado de Casas, correspondências ou banco de dados.
 *
 * Désdia = dez dias ORDINÁRIOS. Festivais intercalares existem na cronologia
 * mas não consomem esses dez dias nem formam uma quarta désdia.
 * Nenhuma operação usa o calendário gregoriano ou Date.
 */
import {FESTIVALS, MONTHS, dateKey, parseDate, type CampaignDate} from './harptos';

export type HarptosDateInput = CampaignDate | string;
export type HarptosSeason = 'winter' | 'spring' | 'summer' | 'autumn';
export type HarptosDirection = 'forward' | 'backward' | 'same';
export type CrossedHarptosMonth = {year: number; month: number; season: HarptosSeason};
export type CrossedHarptosSeason = {
  year: number; month: number; from: HarptosSeason; to: HarptosSeason;
};
export type CrossedHarptosFestival = {date: string; festivalId: string; name: string};
export type HarptosInterval = {
  from: string;
  to: string;
  direction: HarptosDirection;
  ordinaryDaysElapsed: number;
  calendarDaysElapsed: number;
  crossedMonths: CrossedHarptosMonth[];
  crossedYears: number[];
  crossedSeasons: CrossedHarptosSeason[];
  crossedFestivals: CrossedHarptosFestival[];
};
export type HarptosDesdiaPreview = HarptosInterval & {
  desdiasAdvanced: number;
  nextDate: CampaignDate;
  nextDateKey: string;
  nextDesdia: 1 | 2 | 3 | null;
};

const DAYS_PER_MONTH = 30;
const ORDINARY_DAYS_PER_YEAR = 360;
const MAX_YEAR = 9999;
const SEASONS: readonly HarptosSeason[] = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
];

function checkedDate(input: HarptosDateInput): CampaignDate {
  const parsed = typeof input === 'string' ? parseDate(input) : parseDate(dateKey(input));
  if (!parsed || (typeof input !== 'string' && (
    input.year !== parsed.year || input.month !== parsed.month ||
    input.day !== parsed.day || input.festival !== parsed.festival
  ))) {
    throw new RangeError('Data de Harptos inválida.');
  }
  return parsed;
}

function festivalsAfterMonth(year: number, month: number) {
  return FESTIVALS.filter(f => f.month === month && (f.id !== 'shieldmeet' || year % 4 === 0));
}

function firstDayOfYear(year: number): number {
  return (year - 1) * 365 + Math.floor((year - 1) / 4);
}

/** Número de dias de calendário do ano: 365 ou 366, com Shieldmeet a cada quatro anos. */
export function daysInHarptosYear(year: number): 365 | 366 {
  if (!Number.isInteger(year) || year < 1 || year > MAX_YEAR) {
    throw new RangeError('Ano de Harptos inválido.');
  }
  return year % 4 === 0 ? 366 : 365;
}

/** Estação referente à data, inclusive ao festival do mês precedente. */
export function getHarptosSeason(input: HarptosDateInput): HarptosSeason {
  return SEASONS[checkedDate(input).month]!;
}

/** 1, 2 ou 3 para um dia ordinário; null para festival intercalar. */
export function getHarptosDesdia(input: HarptosDateInput): 1 | 2 | 3 | null {
  const date = checkedDate(input);
  return date.festival ? null : (Math.floor((date.day - 1) / 10) + 1) as 1 | 2 | 3;
}

/** Ordinal absoluto, baseado em zero desde 1 Hammer de 0001 CV.
 * Inclui todos os festivais intercalares; ordena Midsummer ANTES de Shieldmeet.
 */
export function getHarptosOrdinal(input: HarptosDateInput): number {
  const date = checkedDate(input);
  let inYear = date.month * DAYS_PER_MONTH;
  for (let month = 0; month < date.month; month++) {
    inYear += festivalsAfterMonth(date.year, month).length;
  }
  if (date.festival) {
    const festivals = festivalsAfterMonth(date.year, date.month);
    const offset = festivals.findIndex(f => f.id === date.festival);
    if (offset < 0) throw new RangeError('Festival inválido no ano indicado.');
    inYear += DAYS_PER_MONTH + offset;
  } else {
    inYear += date.day - 1;
  }
  return firstDayOfYear(date.year) + inYear;
}

/** Inverso exato de getHarptosOrdinal; não depende do fuso horário. */
export function fromHarptosOrdinal(ordinal: number): CampaignDate {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= firstDayOfYear(MAX_YEAR + 1)) {
    throw new RangeError('Ordinal de Harptos fora do intervalo permitido.');
  }

  // Busca binária de ano para evitar percorrer todos os anos em saltos longos.
  let low = 1;
  let high = MAX_YEAR + 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (firstDayOfYear(middle) <= ordinal) low = middle;
    else high = middle;
  }

  let withinYear = ordinal - firstDayOfYear(low);
  for (let month = 0; month < MONTHS.length; month++) {
    if (withinYear < DAYS_PER_MONTH) {
      return {year: low, month, day: withinYear + 1, festival: null};
    }
    withinYear -= DAYS_PER_MONTH;
    const festivals = festivalsAfterMonth(low, month);
    if (withinYear < festivals.length) {
      return {year: low, month, day: 30, festival: festivals[withinYear]!.id};
    }
    withinYear -= festivals.length;
  }
  throw new RangeError('Ordinal incompatível com o calendário de Harptos.');
}

/** Índice dos dias ORDINÁRIOS, sem os festivais.
 * Para um festival, usa como referência o último dia ordinário do mês.
 */
function ordinaryDayIndex(input: CampaignDate): number {
  return (input.year - 1) * ORDINARY_DAYS_PER_YEAR +
    input.month * DAYS_PER_MONTH + (input.festival ? 29 : input.day - 1);
}

function ordinaryDateAt(index: number): CampaignDate {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_YEAR * ORDINARY_DAYS_PER_YEAR) {
    throw new RangeError('Avanço ultrapassa os limites de Harptos.');
  }
  const year = Math.floor(index / ORDINARY_DAYS_PER_YEAR) + 1;
  const inYear = index % ORDINARY_DAYS_PER_YEAR;
  return {
    year,
    month: Math.floor(inYear / DAYS_PER_MONTH),
    day: (inYear % DAYS_PER_MONTH) + 1,
    festival: null,
  };
}

/** Avança N désdias, com 10 dias ordinários cada; ignora festivais para contagem.
 * A origem pode estar no meio de uma désdia ou num festival intercalar.
 * Uma data festiva conta a partir do último dia ordinário que a antecedeu.
 */
export function advanceHarptosDesdia(start: HarptosDateInput, count = 1): CampaignDate {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('A quantidade de désdias deve ser um inteiro não negativo.');
  }
  const from = checkedDate(start);
  if (count === 0) return {...from};
  return ordinaryDateAt(ordinaryDayIndex(from) + count * 10);
}

/** Percorre fronteiras de meses, anos, estações e festivais entre duas datas.
 * O ponto inicial é EXCLUÍDO e o ponto final INCLUÍDO, inclusive no retrocesso.
 * As listas obedecem à direção da consulta, sem mutar qualquer estado.
 */
export function listCrossedHarptosPeriods(fromInput: HarptosDateInput, toInput: HarptosDateInput): HarptosInterval {
  const start = checkedDate(fromInput);
  const end = checkedDate(toInput);
  const startOrdinal = getHarptosOrdinal(start);
  const endOrdinal = getHarptosOrdinal(end);
  const sign = Math.sign(endOrdinal - startOrdinal);
  const direction: HarptosDirection = sign > 0 ? 'forward' : sign < 0 ? 'backward' : 'same';
  const crossedMonths: CrossedHarptosMonth[] = [];
  const crossedYears: number[] = [];
  const crossedSeasons: CrossedHarptosSeason[] = [];
  const crossedFestivals: CrossedHarptosFestival[] = [];

  if (sign !== 0) {
    const startMonth = start.year * 12 + start.month;
    const endMonth = end.year * 12 + end.month;
    for (let index = startMonth + sign; sign * (endMonth - index) >= 0; index += sign) {
      const year = Math.floor(index / 12);
      const month = index % 12;
      const season = SEASONS[month]!;
      const previousMonth = (month - sign + 12) % 12;
      const previousSeason = SEASONS[previousMonth]!;
      crossedMonths.push({year, month, season});
      if (season !== previousSeason) {
        crossedSeasons.push({year, month, from: previousSeason, to: season});
      }
    }
    for (let year = start.year + sign; sign * (end.year - year) >= 0; year += sign) {
      crossedYears.push(year);
    }
    for (let year = Math.min(start.year, end.year); year <= Math.max(start.year, end.year); year++) {
      for (const festival of FESTIVALS) {
        if (festival.id === 'shieldmeet' && year % 4 !== 0) continue;
        const key = dateKey({year, month: festival.month, day: 30, festival: festival.id});
        const ordinal = getHarptosOrdinal(key);
        const within = sign > 0
          ? ordinal > startOrdinal && ordinal <= endOrdinal
          : ordinal < startOrdinal && ordinal >= endOrdinal;
        if (within) crossedFestivals.push({date: key, festivalId: festival.id, name: festival.name});
      }
    }
    crossedFestivals.sort((a, b) =>
      sign * (getHarptosOrdinal(a.date) - getHarptosOrdinal(b.date))
    );
  }

  return {
    from: dateKey(start),
    to: dateKey(end),
    direction,
    ordinaryDaysElapsed: ordinaryDayIndex(end) - ordinaryDayIndex(start),
    calendarDaysElapsed: endOrdinal - startOrdinal,
    crossedMonths, crossedYears, crossedSeasons, crossedFestivals,
  };
}

/** Prévia para o futuro Hub: leitura pura, sem publicar um turno ou executar efeitos. */
export function previewHarptosDesdia(start: HarptosDateInput, count = 1): HarptosDesdiaPreview {
  const nextDate = advanceHarptosDesdia(start, count);
  const crossed = listCrossedHarptosPeriods(start, nextDate);
  return {
    ...crossed,
    desdiasAdvanced: count,
    nextDate,
    nextDateKey: dateKey(nextDate),
    nextDesdia: getHarptosDesdia(nextDate),
  };
}
