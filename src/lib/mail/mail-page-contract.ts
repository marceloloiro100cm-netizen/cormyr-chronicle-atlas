/**
 * Contrato das missivas da segunda temporada, portado literalmente das funções
 * SQL originais (drizzle/migrations):
 * - mail_page            → 0074_mediator_copies_view.sql
 * - mail_trash_page      → 0069_mail_trash_restore.sql
 * - mail_insights        → 0037_mail_recipients_and_assignments.sql
 * - mail_recipient_read  → 0037_mail_recipients_and_assignments.sql
 * - can_read_letter_as   → 0035_missivas_lifecycle_and_audience.sql
 * - can_read_reply       → 0019_active_players_public_catalog.sql
 *
 * Função pura, sem I/O: recebe o conjunto de dados já carregado (Firestore,
 * prévia visual ou testes) e devolve exatamente o que a tela original espera
 * de `supabase.rpc('mail_page', …)`. Assim todos os filtros (Caixa, Grupo,
 * Casa destinatária/legado, Casa remetente, Membro da corte, Unidade militar,
 * Semana, Tipo, Resposta, Minha leitura e Busca), os indicadores e a ordem
 * das páginas permanecem idênticos ao original, seja qual for a origem dos dados.
 */
export type MailLetter = {
  id: string;
  sender_user_id: string;
  sender_player_id: string | null;
  sender_name: string | null;
  recipient_house_id: string | null;
  recipient_player_id: string | null;
  origin_house_id: string | null;
  subject: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  deleted_at: string | null;
  publication_state: string;
  delivery_week: number | null;
  creation_week: number | null;
  letter_number: number | null;
  letter_kind: string | null;
  court_member_id: string | null;
  court_assignment: string | null;
  military_unit_id: string | null;
  batch_key: string | null;
  [field: string]: unknown;
};
export type MailReply = {
  id: string;
  letter_id: string;
  author_user_id: string;
  author_name: string | null;
  recipient_user_id: string | null;
  content: string;
  created_at: string;
  delivered_at: string | null;
  deleted_at: string | null;
  publication_state: string;
  delivery_week: number | null;
  creation_week: number | null;
  [field: string]: unknown;
};
export type MailReceipt = {letter_id: string; user_id: string; read_at: string};
export type MailPlayer = {id: string; user_id: string | null; roster_house_id: string | null; active: boolean; require_password_change: boolean};
export type MailMembership = {player_id: string; house_id: string};
export type MailHouse = {id: string; name: string};
export type MailRound = {number: number; status: string};
export type MailDataset = {
  letters: readonly MailLetter[];
  replies: readonly MailReply[];
  receipts: readonly MailReceipt[];
  players: readonly MailPlayer[];
  memberships: readonly MailMembership[];
  houses: readonly MailHouse[];
  rounds: readonly MailRound[];
  /** Contas com papel de administrador (Narrador). */
  adminUserIds: ReadonlySet<string>;
  /**
   * Contas Editor-Chefe. 0116 negava tudo; desde 19/11/2026 (decisão do
   * proprietário) o Editor lê toda missiva e resposta ENTREGUE e não excluída,
   * para escrever o Jornal. Nunca rascunhos, programadas, Lixeira, escrita ou
   * recibos de outras pessoas.
   */
  editorUserIds?: ReadonlySet<string>;
};
export type MailViewer = {uid: string};
export type MailFilters = Partial<Record<'box' | 'number' | 'kind' | 'origin' | 'house' | 'court' | 'unit' | 'answered' | 'read' | 'text', string>> & {
  group_house_ids?: readonly string[];
  [field: string]: unknown;
};
export type MailKpis = {delivered: number; awaiting_house: number; awaiting_narrator: number; scheduled_replies_next: number; drafts: number};
export type MailPageResult = {
  total: number;
  kpis: MailKpis;
  letters: (MailLetter & {recipient_read: boolean})[];
  replies: MailReply[];
};

const text = (value: unknown) => typeof value === 'string' ? value : '';
const lower = (value: unknown) => text(value).toLowerCase();
const time = (value: string | null | undefined) => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
/** concat_ws ignora nulos; `||` com nulo anula a expressão inteira. */
const concatWs = (...parts: unknown[]) => parts.filter(p => p !== null && p !== undefined).map(String).join(' ');
const concatStrict = (...parts: unknown[]) => parts.some(p => p === null || p === undefined) ? null : parts.map(String).join(' ');
const pick = (filters: MailFilters, key: keyof MailFilters) => text(filters[key]);

function isAdmin(ds: MailDataset, uid: string) {
  return ds.adminUserIds.has(uid);
}
function isEditor(ds: MailDataset, uid: string) {
  return ds.editorUserIds?.has(uid) ?? false;
}
/** campaign_access_active(): Narrador ou jogador ativo sem troca de senha pendente. */
function accessActive(ds: MailDataset, uid: string) {
  return isAdmin(ds, uid) || isEditor(ds, uid) || ds.players.some(p => p.user_id === uid && p.active && !p.require_password_change);
}

/** can_read_letter_as (0035) + leitura somente-entregue do Editor-Chefe. */
export function canReadLetterAs(ds: MailDataset, l: MailLetter, viewer: string): boolean {
  if (isEditor(ds, viewer)) return l.deleted_at === null && l.publication_state === 'delivered';
  if (isAdmin(ds, viewer)) return true;
  if (l.deleted_at !== null) return false;
  return ds.players.some(p => p.user_id === viewer && p.active && !p.require_password_change && (
    l.sender_user_id === viewer || (l.publication_state === 'delivered' && (
      // An imported Narrator-wide announcement has no individual recipient.
      // Only currently active House players may read it; it never grants edit.
      (l['source'] === 'imported' && l.letter_kind === 'geral' &&
       l.origin_house_id === null && l.recipient_house_id === null &&
       l.recipient_player_id === null && ds.memberships.some(m => m.player_id === p.id)) ||
      l.recipient_player_id === p.id || (l.recipient_player_id === null &&
        ds.memberships.some(m => m.player_id === p.id && m.house_id === l.recipient_house_id))))));
}
/** can_read_reply (0019) + leitura somente-entregue do Editor-Chefe. */
export function canReadReply(ds: MailDataset, r: MailReply, viewer: string): boolean {
  if (isEditor(ds, viewer)) {
    if (r.deleted_at !== null || r.publication_state !== 'delivered') return false;
    const parent = ds.letters.find(l => l.id === r.letter_id);
    return Boolean(parent && canReadLetterAs(ds, parent, viewer));
  }
  if (isAdmin(ds, viewer)) return true;
  if (!accessActive(ds, viewer)) return false;
  if (r.author_user_id === viewer) return true;
  if (r.publication_state !== 'delivered' || r.recipient_user_id !== viewer) return false;
  const letter = ds.letters.find(l => l.id === r.letter_id);
  return Boolean(letter && canReadLetterAs(ds, letter, viewer));
}

/** mail_recipient_read (0037): o destinatário real confirmou a leitura. */
export function mailRecipientRead(ds: MailDataset, l: MailLetter, viewer: string): boolean {
  if (!accessActive(ds, viewer) || !(l.sender_user_id === viewer || isAdmin(ds, viewer)) || !canReadLetterAs(ds, l, viewer)) return false;
  return ds.receipts.some(rr => rr.letter_id === l.id && rr.user_id !== l.sender_user_id && (
    (l.recipient_player_id !== null && ds.players.some(cp => cp.id === l.recipient_player_id && cp.user_id === rr.user_id)) ||
    (l.recipient_house_id !== null && ds.players.some(cp => cp.user_id === rr.user_id &&
      ds.memberships.some(hm => hm.player_id === cp.id && hm.house_id === l.recipient_house_id))) ||
    (l.recipient_player_id === null && l.recipient_house_id === null && ds.adminUserIds.has(rr.user_id))));
}

/** Jogador ligado a uma das Casas (roster oficial ou vínculo autorizado). */
function playerInHouse(ds: MailDataset, player: MailPlayer, houseId: string) {
  return player.roster_house_id === houseId || ds.memberships.some(m => m.player_id === player.id && m.house_id === houseId);
}
function letterPlayers(ds: MailDataset, l: MailLetter) {
  return ds.players.filter(p => p.id === l.sender_player_id || p.id === l.recipient_player_id || p.user_id === l.sender_user_id);
}

/**
 * mail_page (0074). Lança erro nas mesmas condições da função SQL.
 * O conjunto de dados deve conter todas as missivas; a visibilidade por
 * perfil (RLS) é aplicada aqui.
 */
export function mailPage(ds: MailDataset, viewer: MailViewer, filters: MailFilters = {}, page = 0, size = 20): MailPageResult {
  const uid = viewer.uid;
  if (!accessActive(ds, uid)) throw new Error('Jogador não autorizado');
  if (!Number.isInteger(page) || !Number.isInteger(size) || page < 0 || size < 1 || size > 50) throw new Error('Página inválida');
  const admin = isAdmin(ds, uid);
  const box = pick(filters, 'box');
  const number = pick(filters, 'number');
  const kind = pick(filters, 'kind');
  const origin = pick(filters, 'origin');
  const house = pick(filters, 'house');
  const court = pick(filters, 'court');
  const unit = pick(filters, 'unit');
  const answered = pick(filters, 'answered');
  const read = pick(filters, 'read');
  const search = pick(filters, 'text');
  const hasGroup = Object.prototype.hasOwnProperty.call(filters, 'group_house_ids');
  const group = Array.isArray(filters.group_house_ids) ? filters.group_house_ids.map(String) : [];

  // RLS: só missivas e respostas que o leitor pode ver entram nas subconsultas.
  const replies = ds.replies.filter(r => canReadReply(ds, r, uid));
  const repliesOf = (id: string) => replies.filter(r => r.letter_id === id);
  const receipts = ds.receipts.filter(r => admin || r.user_id === uid);
  const stateFor = (b: string) => b === 'rascunhos' ? 'draft' : b === 'programadas' ? 'scheduled' : 'delivered';

  const lastAuthor = (l: MailLetter): string | null => {
    const entries: {author: string; at: number; rank: number; id: string}[] = [];
    if (l.publication_state === 'delivered') entries.push({author: l.sender_user_id, at: time(l.delivered_at ?? l.created_at), rank: 0, id: l.id});
    for (const r of repliesOf(l.id)) if (r.publication_state === 'delivered')
      entries.push({author: r.author_user_id, at: time(r.delivered_at ?? r.created_at), rank: 1, id: r.id});
    entries.sort((a, b) => b.at - a.at || b.rank - a.rank || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    return entries[0]?.author ?? null;
  };
  const answeredByOther = (l: MailLetter) => repliesOf(l.id).some(r => r.publication_state === 'delivered' && r.author_user_id !== l.sender_user_id);
  const readState = (l: MailLetter) => receipts.some(rr => rr.letter_id === l.id && rr.user_id === uid &&
    !repliesOf(l.id).some(r => r.publication_state === 'delivered' && r.author_user_id !== uid && time(r.delivered_at ?? r.created_at) > time(rr.read_at)))
    ? 'yes' : 'no';
  const narratorAddressed = (l: MailLetter) => l.recipient_house_id === null && l.recipient_player_id === null;

  const matches = (l: MailLetter, latest: string | null): boolean => {
    if (box === 'excluidas' ? l.deleted_at === null : l.deleted_at !== null) return false;
    if (box === 'recebidas' && l.sender_user_id === uid) return false;
    if (box === 'enviadas' && l.sender_user_id !== uid) return false;
    if (['rascunhos', 'programadas', 'historico'].includes(box)) {
      const state = stateFor(box);
      if (l.publication_state !== state && !repliesOf(l.id).some(r => r.publication_state === state)) return false;
    }
    if (number !== '' && String(l.delivery_week ?? l.letter_number ?? '') !== number &&
      !repliesOf(l.id).some(r => (box !== 'historico' || r.publication_state === 'delivered') &&
        String(r.delivery_week ?? r.creation_week ?? '') === number)) return false;
    if (kind !== '' && l.letter_kind !== kind) return false;
    if (origin !== '' && !((origin === 'none' && l.origin_house_id === null) || l.origin_house_id === origin)) return false;
    if (house !== '' && !(l.recipient_house_id === house || l.origin_house_id === house ||
      letterPlayers(ds, l).some(p => playerInHouse(ds, p, house)))) return false;
    if (court !== '' && !((court === 'none' && l.court_member_id === null) ||
      (l.origin_house_id !== null && l.court_member_id !== null && `${l.origin_house_id}:${l.court_member_id}` === court))) return false;
    if (unit !== '' && !((unit === 'none' && l.military_unit_id === null) ||
      (l.origin_house_id !== null && l.military_unit_id !== null && `${l.origin_house_id}:${l.military_unit_id}` === unit))) return false;
    if (answered !== '') {
      const ok = answered === 'yes' ? answeredByOther(l)
        : answered === 'no' ? !answeredByOther(l)
        : answered === 'no-delivered' ? admin && !repliesOf(l.id).some(r => r.publication_state === 'delivered')
        : answered === 'awaiting-house' ? admin && latest === uid
        : answered === 'awaiting-narrator' ? admin && latest !== null && latest !== uid && (l.sender_user_id === uid || narratorAddressed(l) ||
            repliesOf(l.id).some(r => r.publication_state === 'delivered' && r.author_user_id === uid))
        : answered === 'pending-outgoing' ? admin && ((l.sender_user_id === uid && ['draft', 'scheduled'].includes(l.publication_state)) ||
            repliesOf(l.id).some(r => r.publication_state === 'scheduled' || (r.publication_state === 'draft' && r.author_user_id === uid)))
        : false;
      if (!ok) return false;
    }
    if (read !== '' && readState(l) !== read) return false;
    if (hasGroup && !group.some(g => g === l.origin_house_id || g === l.recipient_house_id ||
      letterPlayers(ds, l).some(p => playerInHouse(ds, p, g)))) return false;
    if (admin && box === 'recebidas' && !narratorAddressed(l)) return false;
    if (box === 'copias' && !(admin && l.sender_player_id !== null && l.recipient_house_id !== null && l.publication_state === 'delivered')) return false;
    if (search !== '') {
      const housesOf = (ids: (string | null)[]) => ds.houses.filter(h => ids.includes(h.id));
      const hit = contains(concatWs(l.subject, l.content, l.sender_name), search) ||
        repliesOf(l.id).some(r => contains(concatWs(r.content, r.author_name), search)) ||
        housesOf([l.recipient_house_id, l.origin_house_id]).some(h => contains(h.name, search)) ||
        ds.players.filter(p => p.id === l.recipient_player_id || p.id === l.sender_player_id || p.user_id === l.sender_user_id)
          .some(p => ds.houses.some(h => playerInHouse(ds, p, h.id) && contains(h.name, search)));
      if (!hit) return false;
    }
    return true;
  };

  const visible = ds.letters.filter(l => canReadLetterAs(ds, l, uid))
    .map(l => ({letter: l, latest: lastAuthor(l)}))
    .filter(({letter, latest}) => matches(letter, latest));
  const visibleIds = new Set(visible.map(v => v.letter.id));
  const openRounds = ds.rounds.filter(r => r.status === 'open').map(r => r.number);
  const closedRounds = ds.rounds.filter(r => r.status === 'closed').map(r => r.number);
  const nextRound = (openRounds.length ? Math.max(...openRounds) : closedRounds.length ? Math.max(...closedRounds) : 0) + 1;
  const kpis: MailKpis = {
    delivered: visible.filter(v => v.letter.publication_state === 'delivered').length,
    awaiting_house: visible.filter(v => v.letter.publication_state === 'delivered' && v.latest === uid).length,
    awaiting_narrator: visible.filter(v => v.letter.publication_state === 'delivered' && v.latest !== null && v.latest !== uid &&
      (v.letter.sender_user_id === uid || narratorAddressed(v.letter) ||
        repliesOf(v.letter.id).some(r => r.publication_state === 'delivered' && r.author_user_id === uid))).length,
    drafts: visible.filter(v => v.letter.publication_state === 'draft' && v.letter.sender_user_id === uid).length +
      replies.filter(r => visibleIds.has(r.letter_id) && r.publication_state === 'draft' && r.author_user_id === uid).length,
    scheduled_replies_next: replies.filter(r => visibleIds.has(r.letter_id) && r.publication_state === 'scheduled' &&
      r.delivery_week === nextRound && r.author_user_id === uid).length,
  };
  const activity = (l: MailLetter) => Math.max(time(l.created_at), ...repliesOf(l.id)
    .filter(r => r.deleted_at === null && (r.publication_state === 'delivered' ||
      (r.author_user_id === uid && ['scheduled', 'draft'].includes(r.publication_state))))
    .map(r => time(r.delivered_at ?? r.created_at)));
  const byIdDesc = (a: MailLetter, b: MailLetter) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const pageRows = visible.map(v => v.letter)
    .sort((a, b) => activity(b) - activity(a) || byIdDesc(a, b))
    .slice(page * size, page * size + size);
  const pageIds = new Set(pageRows.map(l => l.id));
  return {
    total: visible.length,
    kpis,
    letters: [...pageRows].sort((a, b) => time(b.created_at) - time(a.created_at) || byIdDesc(a, b))
      .map(l => ({...l, recipient_read: mailRecipientRead(ds, l, uid)})),
    replies: replies.filter(r => pageIds.has(r.letter_id))
      .sort((a, b) => time(a.created_at) - time(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** mail_trash_page (0069). */
export function mailTrashPage(ds: MailDataset, viewer: MailViewer, filters: MailFilters = {}, page = 0, size = 20) {
  const uid = viewer.uid;
  if (!uid || !accessActive(ds, uid) || isEditor(ds, uid)) throw new Error('Acesso não autorizado');
  if (!Number.isInteger(page) || !Number.isInteger(size) || page < 0 || size < 1 || size > 50) throw new Error('Página inválida');
  const admin = isAdmin(ds, uid);
  const number = pick(filters, 'number'), kind = pick(filters, 'kind'), origin = pick(filters, 'origin');
  const house = pick(filters, 'house'), court = pick(filters, 'court'), unit = pick(filters, 'unit'), search = pick(filters, 'text');
  const hasGroup = Object.prototype.hasOwnProperty.call(filters, 'group_house_ids');
  const group = Array.isArray(filters.group_house_ids) ? filters.group_house_ids.map(String) : null;
  const deletedReplies = (id: string) => ds.replies.filter(d => d.letter_id === id && d.deleted_at !== null &&
    (d.publication_state !== 'draft' || d.author_user_id === uid));
  const visible = ds.letters.filter(c => {
    const deletedOnes = deletedReplies(c.id);
    if (c.deleted_at === null && !deletedOnes.length) return false;
    const letterEligible = c.deleted_at !== null && (admin || c.sender_user_id === uid);
    const replyEligible = deletedOnes.some(d => admin || (d.author_user_id === uid && (
      (c.deleted_at === null && canReadLetterAs(ds, c, uid)) || (c.deleted_at !== null && c.sender_user_id === uid))));
    if (!letterEligible && !replyEligible) return false;
    if (number !== '' && String(c.delivery_week ?? '') !== number &&
      !deletedOnes.some(rr => String(rr.delivery_week ?? '') === number && (admin || rr.author_user_id === uid))) return false;
    if (kind !== '' && c.letter_kind !== kind) return false;
    if (origin !== '' && !(c.origin_house_id === origin || (origin === 'none' && c.origin_house_id === null))) return false;
    if (house !== '' && !(c.recipient_house_id === house ||
      ds.players.some(pp => pp.id === c.sender_player_id && pp.roster_house_id === house))) return false;
    if (court !== '' && !((c.origin_house_id !== null && c.court_member_id !== null && `${c.origin_house_id}:${c.court_member_id}` === court) ||
      (court === 'none' && c.court_member_id === null))) return false;
    if (unit !== '' && !((c.origin_house_id !== null && c.military_unit_id !== null && `${c.origin_house_id}:${c.military_unit_id}` === unit) ||
      (unit === 'none' && c.military_unit_id === null))) return false;
    if (hasGroup && !(group && group.some(g => g === c.origin_house_id || g === c.recipient_house_id ||
      ds.players.some(pp => (pp.id === c.sender_player_id || pp.id === c.recipient_player_id) && pp.roster_house_id === g)))) return false;
    if (search !== '') {
      const own = concatStrict(c.subject, c.sender_name, c.content);
      const hit = (own !== null && contains(own, search)) || deletedOnes.some(rr => (admin || rr.author_user_id === uid) &&
        (() => { const v = concatStrict(rr.content, rr.author_name); return v !== null && contains(v, search); })());
      if (!hit) return false;
    }
    return true;
  });
  const deletedAt = (c: MailLetter) => Math.max(time(c.deleted_at), ...ds.replies
    .filter(r => r.letter_id === c.id && r.deleted_at !== null && (admin || r.author_user_id === uid)).map(r => time(r.deleted_at)));
  const byIdDesc = (a: MailLetter, b: MailLetter) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const pageRows = [...visible].sort((a, b) => deletedAt(b) - deletedAt(a) || byIdDesc(a, b)).slice(page * size, page * size + size);
  const pageIds = new Set(pageRows.map(l => l.id));
  return {
    total: visible.length,
    letters: [...pageRows].sort((a, b) => time(b.created_at) - time(a.created_at) || byIdDesc(a, b)).map(l => ({...l, recipient_read: false})),
    replies: ds.replies.filter(d => pageIds.has(d.letter_id) && d.deleted_at !== null &&
      (d.publication_state !== 'draft' || d.author_user_id === uid) && (admin || d.author_user_id === uid))
      .sort((a, b) => time(b.deleted_at) - time(a.deleted_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** mail_insights (0037): agrupamento por Casa remetente, corte e unidade. */
export function mailInsights(ds: MailDataset, viewer: MailViewer) {
  if (!accessActive(ds, viewer.uid)) return [];
  const rows = new Map<string, {origin_house_id: string | null; court_member_id: string | null; court_assignment: string | null;
    military_unit_id: string | null; batches: Set<string>; deliveries: number; delivered: number; answered: number}>();
  for (const l of ds.letters) {
    if (l.deleted_at !== null || !canReadLetterAs(ds, l, viewer.uid)) continue;
    const key = JSON.stringify([l.origin_house_id, l.court_member_id, l.court_assignment, l.military_unit_id]);
    const row = rows.get(key) ?? {origin_house_id: l.origin_house_id, court_member_id: l.court_member_id,
      court_assignment: l.court_assignment, military_unit_id: l.military_unit_id, batches: new Set<string>(), deliveries: 0, delivered: 0, answered: 0};
    row.batches.add(l.batch_key ?? l.id);
    row.deliveries++;
    if (l.publication_state === 'delivered') {
      row.delivered++;
      if (ds.replies.some(r => r.letter_id === l.id && r.publication_state === 'delivered' && r.author_user_id !== l.sender_user_id &&
        canReadReply(ds, r, viewer.uid))) row.answered++;
    }
    rows.set(key, row);
  }
  const nullsLast = (a: string | null, b: string | null) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
  return [...rows.values()]
    .sort((a, b) => nullsLast(a.origin_house_id, b.origin_house_id) || nullsLast(a.court_member_id, b.court_member_id) ||
      nullsLast(a.military_unit_id, b.military_unit_id))
    .map(({batches, ...row}) => ({...row, messages: batches.size}));
}

/** Critério de grupo regional de mail_overview_grouped/mail_insights_grouped (0047). */
function inHouseGroup(ds: MailDataset, l: MailLetter, houseIds: readonly string[]) {
  return houseIds.some(x => x === l.origin_house_id || x === l.recipient_house_id ||
    ds.players.some(p => (p.id === l.sender_player_id || p.id === l.recipient_player_id) && p.roster_house_id === x));
}
/** mail_overview_grouped (0047): totais do Narrador para um grupo de Casas. */
export function mailOverviewGrouped(ds: MailDataset, viewer: MailViewer, houseIds: readonly string[]) {
  const rows = isAdmin(ds, viewer.uid) ? ds.letters.filter(l => l.deleted_at === null && inHouseGroup(ds, l, houseIds)) : [];
  return {
    total: rows.length,
    scheduled: rows.filter(l => l.publication_state === 'scheduled').length,
    drafts: rows.filter(l => l.publication_state === 'draft').length,
    delivered: rows.filter(l => l.publication_state === 'delivered').length,
  };
}
/** mail_insights_grouped (0047): agrupamento de corte/unidade restrito ao grupo. */
export function mailInsightsGrouped(ds: MailDataset, viewer: MailViewer, houseIds: readonly string[]) {
  if (!isAdmin(ds, viewer.uid)) return [];
  return mailInsights({...ds, letters: ds.letters.filter(l => inHouseGroup(ds, l, houseIds))}, viewer);
}
