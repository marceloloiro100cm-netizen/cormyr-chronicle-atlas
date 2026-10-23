import { describe, expect, it } from 'vitest';
import { groupReceivedLetters, nextLetterNumber, sentLetters, type LetterRow } from '@/lib/letters';

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: crypto.randomUUID(),
  sender_user_id: 'narrador',
  sender_name: 'Mestre',
  recipient_house_id: 'erdenor',
  recipient_player_id: null,
  subject: 'Assunto',
  content: 'Conteúdo',
  created_at: '2026-10-01T00:00:00Z',
  sync_state: 'pending',
  last_synced_at: null,
  letter_number: 1,
  letter_kind: 'geral',
  ...over,
});

describe('groupReceivedLetters', () => {
  it('agrupa por número, do mais recente para o mais antigo', () => {
    const letters = [row({ letter_number: 1 }), row({ letter_number: 2 }), row({ letter_number: 1 })];
    const groups = groupReceivedLetters(letters, 'jogador');
    expect(groups.map((g) => g.number)).toEqual([2, 1]);
    expect(groups[1]?.letters).toHaveLength(2);
  });

  it('exclui as missivas escritas pelo próprio usuário', () => {
    const letters = [row({ sender_user_id: 'jogador', letter_number: null }), row({ letter_number: 1 })];
    const groups = groupReceivedLetters(letters, 'jogador');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.letters).toHaveLength(1);
  });

  it('mantém missivas sem número em grupo próprio', () => {
    const groups = groupReceivedLetters([row({ letter_number: null })], 'jogador');
    expect(groups[0]?.number).toBeNull();
  });
});

describe('sentLetters', () => {
  it('retorna só as missivas do usuário, mais recentes primeiro', () => {
    const letters = [
      row({ sender_user_id: 'jogador', created_at: '2026-10-01T00:00:00Z' }),
      row({ sender_user_id: 'jogador', created_at: '2026-10-03T00:00:00Z' }),
      row({}),
    ];
    const mine = sentLetters(letters, 'jogador');
    expect(mine).toHaveLength(2);
    expect(mine[0]?.created_at).toBe('2026-10-03T00:00:00Z');
  });
});

describe('nextLetterNumber', () => {
  it('é um a mais que o maior número existente', () => {
    expect(nextLetterNumber([row({ letter_number: 1 }), row({ letter_number: 3 })])).toBe(4);
  });

  it('começa em 1 quando não há missivas numeradas', () => {
    expect(nextLetterNumber([row({ letter_number: null })])).toBe(1);
    expect(nextLetterNumber([])).toBe(1);
  });
});
