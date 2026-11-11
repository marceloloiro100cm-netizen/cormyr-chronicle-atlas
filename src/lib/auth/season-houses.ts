// Public house picker for /auth. Selecting a house is only a UI preference, never authorization.
export type SeasonHouse = { id: string; name: string };
type Res = { data: unknown; error: { message?: string } | null };
export type HouseSource = {
  catalog: () => PromiseLike<Res>;
  playerHouses: () => PromiseLike<Res>;
};
export type SeasonHousesResult = { houses: SeasonHouse[]; errors: string[] };

export function friendlyBackendError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : typeof raw === 'object' && raw && 'message' in raw ? String((raw as { message: unknown }).message) : String(raw ?? '');
  if (/fetch|network|load failed|not accessible|paused|503|502|timeout/i.test(msg)) return 'Servidor da campanha indisponível no momento.';
  if (/permission|denied|42501|401|403|jwt/i.test(msg)) return 'Acesso ao catálogo público recusado pelo servidor.';
  return 'Falha inesperada ao consultar o servidor.';
}

const isHouse = (v: unknown): v is SeasonHouse => !!v && typeof v === 'object' && typeof (v as SeasonHouse).id === 'string' && typeof (v as SeasonHouse).name === 'string' && (v as SeasonHouse).name.trim() !== '';

async function settle(fn: () => PromiseLike<Res>): Promise<Res> {
  try { return await fn(); } catch (e) { return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }; }
}

export async function loadSeasonHouses(src: HouseSource): Promise<SeasonHousesResult> {
  const [cat, pl] = await Promise.all([settle(src.catalog), settle(src.playerHouses)]);
  const errors: string[] = [];
  if (cat.error) errors.push(`Lista de casas: ${friendlyBackendError(cat.error)}`);
  else if (!Array.isArray(cat.data)) errors.push('Lista de casas: resposta inválida do servidor.');
  if (pl.error) errors.push(`Casas de jogadores: ${friendlyBackendError(pl.error)}`);
  else if (!Array.isArray(pl.data)) errors.push('Casas de jogadores: resposta inválida do servidor.');
  if (errors.length) return { houses: [], errors };
  const ids = new Set((pl.data as unknown[]).map(p => (p && typeof p === 'object' ? (p as { house_id?: unknown }).house_id : null)).filter((x): x is string => typeof x === 'string'));
  const seen = new Set<string>();
  const houses = (cat.data as unknown[]).filter(isHouse).filter(h => h.id !== 'espiao' && ids.has(h.id) && !seen.has(h.id) && seen.add(h.id)).map(h => ({ id: h.id, name: h.name }));
  return { houses, errors };
}

export function loginErrorMessage(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String((raw as { message?: unknown })?.message ?? raw ?? '');
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/fetch|network|load failed|paused|503|502|timeout|not accessible/i.test(msg)) return 'Servidor da campanha indisponível no momento. Tente novamente em instantes.';
  return 'Não foi possível entrar.';
}

export const shouldLeaveAuthPage = (event: string, hasUser: boolean) => hasUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
