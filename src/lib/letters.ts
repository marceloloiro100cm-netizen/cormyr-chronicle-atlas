export type LetterRow = {
  id: string;
  sender_user_id: string;
  sender_player_id?: string | null;
  version?: number;
  sender_name: string;
  recipient_house_id: string | null;
  recipient_player_id: string | null;
  subject: string;
  content: string;
  created_at: string;
  sync_state: string;
  last_synced_at: string | null;
  letter_number: number | null;
  letter_kind: 'geral' | 'reservada';
  publication_state?: string;
  delivery_week?: number | null;
  creation_week?: number | null;
  conversation_id?: string | null;
  deleted_at?: string | null;
  delivered_at?: string | null;
};

export type LetterGroup = {
  number: number | null;
  letters: LetterRow[];
};

export type ReplyRef = {letter_id:string;created_at?:string;delivered_at?:string|null};
export type ReceiptRef = {letter_id:string;user_id:string;read_at?:string};

/** Momento da informação mais recente de uma missiva (a resposta entregue mais nova). */
export function lastReplyActivity(letterId:string, replies:ReplyRef[]):string {
  return replies.reduce((latest,r)=>{
    if(r.letter_id!==letterId)return latest;
    const t=r.delivered_at??r.created_at??'';
    return t>latest?t:latest;
  },'');
}

/** Uma missiva lida volta a ser não lida quando chega resposta mais nova que a leitura. */
export function isLetterRead(letterId:string, receipt:ReceiptRef|undefined, replies:ReplyRef[]):boolean {
  if(!receipt)return false;
  const lastReply=lastReplyActivity(letterId,replies);
  return !lastReply||!receipt.read_at||receipt.read_at>=lastReply;
}

export function filterLetters(letters:LetterRow[], replies:ReplyRef[], filters:{number:string;kind:string;answered:string;house?:string;read?:string}, context?:{players:{id:string;user_id:string|null;roster_house_id:string|null}[];receipts:ReceiptRef[];userId:string;admin:boolean}) {
  return letters.filter(l=>{
    const player=context?.players.find(p=>p.id===l.sender_player_id||p.id===l.recipient_player_id||p.user_id===l.sender_user_id);
    const house=l.recipient_house_id??player?.roster_house_id;
    const receipt=context?.receipts.find(r=>r.letter_id===l.id&&(context.admin&&l.sender_user_id===context.userId?r.user_id!==context.userId:r.user_id===context.userId));
    const read=isLetterRead(l.id,receipt,replies);
    return (!filters.number||String(l.letter_number)===filters.number)&&(!filters.kind||l.letter_kind===filters.kind)&&(!filters.answered||(replies.some(r=>r.letter_id===l.id)?'yes':'no')===filters.answered)&&(!filters.house||house===filters.house)&&(!filters.read||(read?'yes':'no')===filters.read);
  });
}

/** Missivas recebidas do narrador, agrupadas por número (mais recente primeiro). */
export function groupReceivedLetters(letters: LetterRow[], userId: string): LetterGroup[] {
  const received = letters.filter((l) => l.sender_user_id !== userId);
  const byNumber = new Map<number | null, LetterRow[]>();
  for (const letter of received) {
    const key = letter.letter_number;
    const list = byNumber.get(key) ?? [];
    list.push(letter);
    byNumber.set(key, list);
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => (b ?? -1) - (a ?? -1))
    .map(([number, group]) => ({
      number,
      letters: group.sort((x, y) => y.created_at.localeCompare(x.created_at)),
    }));
}

/** Missivas escritas pelo próprio jogador, mais recentes primeiro. */
export function sentLetters(letters: LetterRow[], userId: string): LetterRow[] {
  return letters
    .filter((l) => l.sender_user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Próximo número de missiva do narrador. */
export function nextLetterNumber(letters: {letter_number:number|null}[]): number {
  return letters.reduce((max, l) => Math.max(max, l.letter_number ?? 0), 0) + 1;
}

/**
 * Missivas que chegaram ao usuário e ainda não foram abertas: recebidas (não escritas por ele),
 * não excluídas, já entregues, sem registro de leitura — ou lidas antes de uma resposta mais nova.
 * Segue exatamente a mesma regra do rótulo "Não lida" e do filtro de leitura da lista.
 */
export function unreadReceivedCount(letters: LetterRow[], replies: ReplyRef[], receipts: ReceiptRef[], userId: string): number {
  return letters.filter((l) => {
    if (l.sender_user_id === userId) return false;
    if (l.deleted_at) return false;
    if (l.publication_state && l.publication_state !== 'delivered') return false;
    const receipt = receipts.find((r) => r.letter_id === l.id && r.user_id === userId);
    return !isLetterRead(l.id, receipt, replies);
  }).length;
}

type RoundReply = ReplyRef & { author_user_id: string; author_player_id: string | null; house_id: string | null; publication_state: string; delivery_week: number | null };
type RoundPlayer = { id: string; user_id: string | null; active: boolean };

/** Pendências por casa: somente narrativa entregue na semana aberta, sem resposta posterior da casa. */
export function pendingRoundHouses(week: number | null, houses: {id:string;name:string;active:boolean;season:number}[], players: RoundPlayer[], members: {house_id:string;player_id:string}[], letters: LetterRow[], replies: RoundReply[]) {
  if (week === null) return [];
  const activePlayers = players.filter(p => p.active && p.user_id);

  const playerById = new Map<string, RoundPlayer>();
  const playerByUserId = new Map<string, RoundPlayer>();
  for (let i = 0; i < activePlayers.length; i++) {
    const p = activePlayers[i];
    if (p.id) playerById.set(p.id, p);
    if (p.user_id) playerByUserId.set(p.user_id, p);
  }
  const playerFor = (id:string|null|undefined,userId?:string) => {
    if (id) {
      const p = playerById.get(id);
      if (p) return p;
    }
    if (userId) {
      const p = playerByUserId.get(userId);
      if (p) return p;
    }
    return undefined;
  };

  const housesByPlayerId = new Map<string, string[]>();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    let arr = housesByPlayerId.get(m.player_id);
    if (!arr) {
      arr = [];
      housesByPlayerId.set(m.player_id, arr);
    }
    arr.push(m.house_id);
  }
  const housesFor = (player:RoundPlayer|undefined) => player ? (housesByPlayerId.get(player.id) || []) : [];

  const repliesByLetter = new Map<string, RoundReply[]>();
  for (let i = 0; i < replies.length; i++) {
    const r = replies[i];
    if (r.publication_state === 'delivered') {
      let arr = repliesByLetter.get(r.letter_id);
      if (!arr) {
        arr = [];
        repliesByLetter.set(r.letter_id, arr);
      }
      arr.push(r);
    }
  }

  const pending = new Map<string,Set<string>>();
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    if (letter.deleted_at || letter.publication_state !== 'delivered') continue;
    const answers = repliesByLetter.get(letter.id) || [];
    const latest = new Map<string,string>();
    const add = (ids:string[],time:string) => {
      for (let j = 0; j < ids.length; j++) {
        const id = ids[j];
        const prev = latest.get(id) ?? '';
        latest.set(id, time > prev ? time : prev);
      }
    };
    if (!letter.sender_player_id && !playerFor(null,letter.sender_user_id) && (letter.delivery_week ?? letter.letter_number) === week) {
      add(letter.recipient_house_id ? [letter.recipient_house_id] : housesFor(playerFor(letter.recipient_player_id)),letter.delivered_at ?? letter.created_at);
    }
    for (let j = 0; j < answers.length; j++) {
      const reply = answers[j];
      if (reply.author_player_id || playerFor(null,reply.author_user_id) || reply.delivery_week !== week) continue;
      const targets = reply.house_id ? [reply.house_id] : letter.recipient_house_id ? [letter.recipient_house_id] : housesFor(playerFor(letter.recipient_player_id ?? letter.sender_player_id,letter.sender_user_id));
      add(targets,reply.delivered_at ?? reply.created_at ?? '');
    }
    for (const [houseId,lastNarrative] of latest) {
      const eligible = activePlayers.filter(p => housesFor(p).includes(houseId));
      if (!eligible.length) continue;
      let answered = false;
      for (let j = 0; j < answers.length; j++) {
        const r = answers[j];
        if (r.delivery_week === week && (r.delivered_at ?? r.created_at ?? '') >= lastNarrative) {
          if (eligible.some(p => p.id === r.author_player_id || p.user_id === r.author_user_id)) {
            answered = true;
            break;
          }
        }
      }
      if (!answered) {
        let ids = pending.get(houseId);
        if (!ids) {
          ids = new Set<string>();
          pending.set(houseId,ids);
        }
        ids.add(letter.id);
      }
    }
  }
  return houses.filter(h => h.active && h.season === 2 && pending.has(h.id)).map(h => ({id:h.id,name:h.name,letterIds:[...(pending.get(h.id) ?? [])]})).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
}
