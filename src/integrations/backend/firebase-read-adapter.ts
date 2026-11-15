/**
 * Lote 6: readonly view adapter for the existing Firebase homologation bench.
 * Keeps a finite surface contract separate from the emulator HTTP operation list.
 * This is deliberately not installed in the production player workspace.
 */
import type { DomainRequest } from './firebase-domain-client';

export const READ_SURFACES = [
  { key: 'profile', title: 'Perfil e vínculos', domain: 'access', action: 'getProfile' },
  { key: 'houses', title: 'Catálogo de Casas', domain: 'houses', action: 'listHouses' },
  { key: 'house', title: 'Ficha da Casa', domain: 'houses', action: 'getHouse', house: true },
  { key: 'records', title: 'Registros', domain: 'records', action: 'listRecords' },
  { key: 'characterAges', title: 'Idades de personagens', domain: 'characters', action: 'houseAges', house: true },
  { key: 'publishedSchedule', title: 'Agenda publicada', domain: 'schedule', action: 'getPublished', period: true },
  { key: 'calendar', title: 'Calendário oficial', domain: 'time', action: 'getCalendar' },
  { key: 'inbox', title: 'Missivas recebidas e enviadas', domain: 'mailbox', action: 'list' },
  { key: 'mailSession', title: 'Estado do correio', domain: 'mailCommands', action: 'session' },
  { key: 'newspaper', title: 'Edições do Jornal', domain: 'newspaper', action: 'listEditions' },
  { key: 'spyAgents', title: 'Espiões da Casa', domain: 'spyAgents', action: 'houseManagement', house: true },
  { key: 'spyMissions', title: 'Missões de espionagem', domain: 'spyMissions', action: 'houseTimeline', house: true },
  { key: 'spyIntel', title: 'Dossiês de inteligência', domain: 'spyIntel', action: 'read', house: true },
  { key: 'battles', title: 'Batalhas', domain: 'battle', action: 'liveList' },
  { key: 'gm', title: 'Conteúdo do Narrador', domain: 'privateGm', action: 'listGmContent' },
  { key: 'drive', title: 'Vínculos do Google Drive', domain: 'drive', action: 'listBindings' },
] as const;

export type ReadSurface = (typeof READ_SURFACES)[number]['key'];
export interface ReadContext { houseId?: string; year?: number; month?: number }

/**
 * Only explicitly enumerated read actions can be submitted by the bench.
 * House membership is still enforced server-side; this client-side check is
 * only input validation and MUST NOT be interpreted as authorization.
 */
export function buildReadRequest(surface: ReadSurface, context: ReadContext = {}): DomainRequest {
  const entry = READ_SURFACES.find(x => x.key === surface);
  if (!entry) throw new Error('Consulta Firebase não reconhecida.');
  const houseId = context.houseId?.trim();
  if ('house' in entry && entry.house && (!houseId || houseId.length > 128 ||
      !/^[\p{L}\p{N}_ .:-]+$/u.test(houseId))) {
    throw new Error('Informe o identificador da Casa autorizada.');
  }
  const year = context.year ?? 1522;
  const month = context.month ?? 1;
  if ('period' in entry && entry.period &&
      (!Number.isInteger(year) || year < 1 || year > 9999 ||
       !Number.isInteger(month) || month < 1 || month > 12)) {
    throw new Error('Período inválido para consulta.');
  }
  const args: unknown[] =
    entry.key === 'house' || entry.key === 'characterAges' ||
    entry.key === 'spyAgents' || entry.key === 'spyMissions' ||
    entry.key === 'spyIntel' ? [houseId!] :
    entry.key === 'publishedSchedule' ? [{year,month}] :
    entry.key === 'records' || entry.key === 'mailSession' ? [{}] :
    entry.key === 'inbox' ? [{folder:'all',source:'all',pageSize:10,cursor:null,query:''}] :
    [];
  return { domain: entry.domain, action: entry.action, args };
}

export async function readFirebaseSurface<T = unknown>(
  surface: ReadSurface,
  context: ReadContext,
  config: {enabled: boolean; invoke: (request: DomainRequest) => Promise<T>},
): Promise<T> {
  if (!config.enabled) throw new Error('Consulta Firebase desabilitada neste ambiente.');
  return config.invoke(buildReadRequest(surface, context));
}
