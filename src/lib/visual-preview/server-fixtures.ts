import {CORE_CATALOG} from '@/lib/house/catalog';
import {LEGACY_HOUSE_SEEDS} from '@/lib/house/legacy-seeds';
import {newHouseState, type HouseState} from '@/lib/house/types';
import {loadHouseHub, loadHouseLedger, readCourtMember, readVassalNpc} from '@/lib/house/house.functions';
import {syncPlayerFolder} from '@/lib/player-sync.functions';
import {PREVIEW_CALENDAR, PREVIEW_HOUSES, previewUuid, type PreviewContext} from './fixtures';
import {clearVisualServerFns, registerVisualServerFn, visualServerField as field} from './server-fn';
import {VISUAL_PREVIEW_PENDING} from './state';

const MONTH = PREVIEW_CALENDAR.year * 12 + PREVIEW_CALENDAR.month;

/** Ficha da Casa: usa a ficha conciliada (legacy-seeds) quando existe. */
function previewHouseState(houseId: string): HouseState {
  const seed = LEGACY_HOUSE_SEEDS[houseId];
  if (seed) return JSON.parse(JSON.stringify({...seed, houseId})) as HouseState;
  const house = PREVIEW_HOUSES.find(h => h.id === houseId);
  return newHouseState(houseId, house?.regionId ?? '', MONTH);
}

function previewLedger(houseId: string) {
  const index = Math.max(0, PREVIEW_HOUSES.findIndex(h => h.id === houseId));
  const entry = (n: number, action: string, explanation: string, rule: string, day: number) => ({
    id: previewUuid(60, index * 10 + n), action, explanation, rule, campaign_month: MONTH,
    created_at: new Date(Date.UTC(2026, 10, day, 15)).toISOString(), actor: 'Narrador', version: n,
    operation_key: previewUuid(61, index * 10 + n),
  });
  return [
    entry(3, 'purchase', 'Compra de posse registrada pela Casa.', 'Prosperidade · Capítulo 2', 16),
    entry(2, 'fortune', 'Sorte da Casa de Hammer confirmada.', 'Guerra dos Tronos RPG · Capítulo 6', 13),
    entry(1, 'import', 'Ficha conciliada a partir das planilhas oficiais.', 'Conciliação 2026-10-29', 2),
  ];
}

/** Registra as server functions lidas pelas telas originais da área interna. */
export function registerVisualServerFixtures(context: PreviewContext) {
  clearVisualServerFns();
  const admin = context.profile === 'narrador';
  const houses = PREVIEW_HOUSES.map(h => ({id: h.id, name: h.name, region: h.region, crest: h.crest, castle: h.castle, lord_name: h.lord}));
  const canRead = (houseId: string) => admin || houseId === context.house.id;
  const findRecord = (houseId: string, id: string) => {
    const row = context.records.find(r => r['house_id'] === houseId && r['id'] === id);
    if (!row) throw new Error('Registro indisponível na prévia visual.');
    return {id: String(row['id']), title: String(row['title']), content: String(row['content'])};
  };

  registerVisualServerFn(loadHouseHub, input => {
    const houseId = field(input, 'houseId');
    if (!canRead(houseId) && !PREVIEW_HOUSES.some(h => h.id === houseId)) throw new Error('Casa não autorizada.');
    return {
      state: previewHouseState(houseId), version: 4, catalog: CORE_CATALOG, houses,
      ledger: previewLedger(houseId), syncState: 'synced', admin, canEditAttributes: admin,
    };
  });
  registerVisualServerFn(loadHouseLedger, input => previewLedger(field(input, 'houseId')).reverse());
  registerVisualServerFn(readCourtMember, input => findRecord(field(input, 'houseId'), field(input, 'id')));
  registerVisualServerFn(readVassalNpc, input => findRecord(field(input, 'houseId'), field(input, 'id')));
  registerVisualServerFn(syncPlayerFolder, () => {
    throw new Error(VISUAL_PREVIEW_PENDING);
  });
}
