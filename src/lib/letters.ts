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
