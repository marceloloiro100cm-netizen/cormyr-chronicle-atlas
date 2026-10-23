export type LetterRow = {
  id: string;
  sender_user_id: string;
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
};

export type LetterGroup = {
  number: number | null;
  letters: LetterRow[];
};

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
export function nextLetterNumber(letters: LetterRow[]): number {
  return letters.reduce((max, l) => Math.max(max, l.letter_number ?? 0), 0) + 1;
}
