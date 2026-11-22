import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mailInsights, mailPage, mailTrashPage, type MailDataset, type MailLetter, type MailReply} from '@/lib/mail/mail-page-contract';

const NARRATOR = 'u-narrador', A = 'u-ashkar', B = 'u-fewmerry', EDITOR = 'u-editor';
const letter = (id: string, over: Partial<MailLetter>): MailLetter => ({
  id, sender_user_id: NARRATOR, sender_player_id: null, sender_name: 'Narrador', recipient_house_id: null,
  recipient_player_id: null, origin_house_id: null, subject: 'Assunto ' + id, content: 'Texto ' + id,
  created_at: '2026-11-10T12:00:00.000Z', delivered_at: '2026-11-10T12:00:00.000Z', deleted_at: null,
  publication_state: 'delivered', delivery_week: 2, creation_week: 2, letter_number: 2, letter_kind: 'reservada',
  court_member_id: null, court_assignment: null, military_unit_id: null, batch_key: null, ...over,
});
const reply = (id: string, letterId: string, over: Partial<MailReply>): MailReply => ({
  id, letter_id: letterId, author_user_id: NARRATOR, author_name: 'Narrador', recipient_user_id: A, content: 'Resposta ' + id,
  created_at: '2026-11-11T12:00:00.000Z', delivered_at: '2026-11-11T12:00:00.000Z', deleted_at: null,
  publication_state: 'delivered', delivery_week: 2, creation_week: 2, ...over,
});

function dataset(): MailDataset {
  return {
    adminUserIds: new Set([NARRATOR]),
    editorUserIds: new Set([EDITOR]),
    houses: [{id: 'ashkar', name: 'Ashkar'}, {id: 'fewmerry', name: 'Fewmerry'}, {id: 'harcourt', name: 'Harcourt'}],
    players: [
      {id: 'p-ashkar', user_id: A, roster_house_id: 'ashkar', active: true, require_password_change: false},
      {id: 'p-fewmerry', user_id: B, roster_house_id: 'fewmerry', active: true, require_password_change: false},
    ],
    memberships: [{player_id: 'p-ashkar', house_id: 'ashkar'}, {player_id: 'p-fewmerry', house_id: 'fewmerry'}],
    rounds: [{number: 2, status: 'closed'}, {number: 3, status: 'open'}],
    letters: [
      // 1: Narrador → Ashkar, respondida pela Casa (aguarda Narrador)
      letter('l1', {recipient_house_id: 'ashkar', letter_kind: 'geral', created_at: '2026-11-01T10:00:00.000Z', delivered_at: '2026-11-01T10:00:00.000Z'}),
      // 2: Ashkar → Narrador, com corte e unidade, respondida pelo Narrador
      letter('l2', {sender_user_id: A, sender_player_id: 'p-ashkar', sender_name: 'Kael', origin_house_id: 'ashkar',
        court_member_id: 'c1', military_unit_id: 'u1', delivery_week: 3, letter_number: 3, created_at: '2026-11-05T10:00:00.000Z', delivered_at: '2026-11-05T10:00:00.000Z'}),
      // 3: Fewmerry → Ashkar (cópia para mediação), não lida por Ashkar
      letter('l3', {sender_user_id: B, sender_player_id: 'p-fewmerry', sender_name: 'Bassu', origin_house_id: 'fewmerry',
        recipient_house_id: 'ashkar', created_at: '2026-11-06T10:00:00.000Z'}),
      // 4: rascunho do Narrador para Fewmerry (invisível aos jogadores)
      letter('l4', {recipient_house_id: 'fewmerry', publication_state: 'draft', delivered_at: null, delivery_week: 4, created_at: '2026-11-07T10:00:00.000Z'}),
      // 5: missiva excluída de Ashkar
      letter('l5', {sender_user_id: A, sender_player_id: 'p-ashkar', origin_house_id: 'ashkar', deleted_at: '2026-11-08T10:00:00.000Z'}),
    ],
    replies: [
      reply('r1', 'l1', {author_user_id: A, author_name: 'Kael', recipient_user_id: NARRATOR, created_at: '2026-11-02T10:00:00.000Z', delivered_at: '2026-11-02T10:00:00.000Z'}),
      reply('r2', 'l2', {created_at: '2026-11-09T10:00:00.000Z', delivered_at: '2026-11-09T10:00:00.000Z', content: 'Pedágio suspenso'}),
      reply('r3', 'l2', {publication_state: 'scheduled', delivered_at: null, delivery_week: 4, created_at: '2026-11-12T10:00:00.000Z'}),
    ],
    receipts: [{letter_id: 'l1', user_id: A, read_at: '2026-11-03T10:00:00.000Z'}, {letter_id: 'l2', user_id: NARRATOR, read_at: '2026-11-05T11:00:00.000Z'}],
  };
}
const ids = (r: {letters: {id: string}[]}) => r.letters.map(l => l.id).sort();

describe('contrato mail_page (porta literal do SQL original)', () => {
  it('aplica a mesma visibilidade por perfil', () => {
    const ds = dataset();
    expect(ids(mailPage(ds, {uid: NARRATOR}))).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(ids(mailPage(ds, {uid: A}))).toEqual(['l1', 'l2', 'l3']);
    expect(ids(mailPage(ds, {uid: B}))).toEqual(['l3']);
    // Editor-Chefe (19/11/2026): lê toda missiva entregue, nunca rascunho nem excluída.
    const editorPage = mailPage(ds, {uid: EDITOR});
    expect(ids(editorPage)).toEqual(['l1', 'l2', 'l3']);
    expect(editorPage.replies.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    expect(editorPage.letters.every(l => l.recipient_read === false)).toBe(true);
    expect(() => mailTrashPage(ds, {uid: EDITOR})).toThrow('Acesso não autorizado');
    expect(() => mailPage(ds, {uid: A}, {}, 0, 51)).toThrow('Página inválida');
  });
  it('filtra furos marcados do Editor antes da paginação sem ampliar acesso', () => {
    const ds = dataset();
    const marks = {marked_ids: ['l1', 'l3', 'l4', 'l5']};
    const first = mailPage(ds, {uid: EDITOR}, marks, 0, 1);
    const second = mailPage(ds, {uid: EDITOR}, marks, 1, 1);
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect([...ids(first), ...ids(second)].sort()).toEqual(['l1', 'l3']);
    expect(ids(mailPage(ds, {uid: EDITOR}, {marked_ids: []}))).toEqual([]);
    expect(ids(mailPage(ds, {uid: EDITOR}, {marked_ids: ['l1','l2','l3'], origin: 'fewmerry'}))).toEqual(['l3']);
    // Uma preferência local do Editor não altera os filtros dos jogadores.
    expect(ids(mailPage(ds, {uid: A}, {marked_ids: ['l2']}))).toEqual(['l1','l2','l3']);
  });
  it('filtra Caixa: recebidas, enviadas, rascunhos, programadas, histórico, cópias e excluídas', () => {
    const ds = dataset();
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'recebidas'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: A}, {box: 'recebidas'}))).toEqual(['l1', 'l3']);
    expect(ids(mailPage(ds, {uid: A}, {box: 'enviadas'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'rascunhos'}))).toEqual(['l4']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'programadas'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'historico'}))).toEqual(['l1', 'l2', 'l3']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'copias'}))).toEqual(['l3']);
    expect(ids(mailPage(ds, {uid: A}, {box: 'copias'}))).toEqual([]);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'excluidas'}))).toEqual(['l5']);
  });
  it('filtra Semana, Tipo, Casa remetente, Casa destinatária, corte e unidade', () => {
    const ds = dataset();
    expect(ids(mailPage(ds, {uid: NARRATOR}, {number: '3'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {number: '4'}))).toEqual(['l2', 'l4']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {box: 'historico', number: '4'}))).toEqual([]);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {kind: 'geral'}))).toEqual(['l1']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {origin: 'none'}))).toEqual(['l1', 'l4']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {origin: 'fewmerry'}))).toEqual(['l3']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {house: 'ashkar'}))).toEqual(['l1', 'l2', 'l3']);
    // Editor-Chefe needs every letter involving Ashkar, not only outgoing mail.
    expect(ids(mailPage(ds, {uid: EDITOR}, {house: 'ashkar'}))).toEqual(['l1', 'l2', 'l3']);
    expect(ids(mailPage(ds, {uid: EDITOR}, {origin: 'ashkar'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: EDITOR}, {house: 'ashkar', origin: 'ashkar'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {court: 'ashkar:c1'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {unit: 'ashkar:u1'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {unit: 'none'}))).toEqual(['l1', 'l3', 'l4']);
  });
  it('filtra Resposta e Minha leitura como o original', () => {
    const ds = dataset();
    expect(ids(mailPage(ds, {uid: A}, {answered: 'yes'}))).toEqual(['l1', 'l2']);
    expect(ids(mailPage(ds, {uid: A}, {answered: 'no'}))).toEqual(['l3']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {answered: 'no-delivered'}))).toEqual(['l3', 'l4']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {answered: 'awaiting-house'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {answered: 'awaiting-narrator'}))).toEqual(['l1']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {answered: 'pending-outgoing'}))).toEqual(['l2', 'l4']);
    expect(ids(mailPage(ds, {uid: A}, {read: 'yes'}))).toEqual(['l1']);
    expect(ids(mailPage(ds, {uid: A}, {read: 'no'}))).toEqual(['l2', 'l3']);
  });
  it('filtra Grupo de narração e Busca (assunto, resposta, autor ou Casa)', () => {
    const ds = dataset();
    expect(ids(mailPage(ds, {uid: NARRATOR}, {group_house_ids: ['fewmerry']}))).toEqual(['l3', 'l4']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {group_house_ids: []}))).toEqual([]);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {text: 'pedágio'}))).toEqual(['l2']);
    expect(ids(mailPage(ds, {uid: NARRATOR}, {text: 'BASSU'}))).toEqual(['l3']);
    expect(ids(mailPage(ds, {uid: A}, {text: 'fewmerry'}))).toEqual(['l3']);
  });
  it('calcula indicadores, recibos de leitura e paginação', () => {
    const ds = dataset();
    const narrator = mailPage(ds, {uid: NARRATOR});
    expect(narrator.kpis).toEqual({delivered: 3, awaiting_house: 1, awaiting_narrator: 1, scheduled_replies_next: 1, drafts: 1});
    expect(narrator.letters.find(l => l.id === 'l1')?.recipient_read).toBe(true);
    expect(narrator.letters.find(l => l.id === 'l3')?.recipient_read).toBe(false);
    const first = mailPage(ds, {uid: NARRATOR}, {}, 0, 2), second = mailPage(ds, {uid: NARRATOR}, {}, 1, 2);
    expect(first.total).toBe(4);
    expect([...ids(first), ...ids(second)].sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
    // Página escolhida pela atividade (resposta programada de l2 é a mais recente para o Narrador).
    expect(ids(first)).toContain('l2');
    // Respostas programadas do Narrador não aparecem para o jogador.
    expect(mailPage(ds, {uid: A}).replies.map(r => r.id).sort()).toEqual(['r1', 'r2']);
  });
  it('lixeira e agrupamentos de corte/unidade', () => {
    const ds = dataset();
    expect(ids(mailTrashPage(ds, {uid: A}))).toEqual(['l5']);
    expect(ids(mailTrashPage(ds, {uid: B}))).toEqual([]);
    const insight = mailInsights(ds, {uid: NARRATOR}).find(r => r.court_member_id === 'c1');
    expect(insight).toMatchObject({origin_house_id: 'ashkar', military_unit_id: 'u1', messages: 1, delivered: 1, answered: 1});
  });
  it('segue as funções SQL de origem', () => {
    const sql = readFileSync(resolve(process.cwd(), 'drizzle/migrations/0074_mediator_copies_view.sql'), 'utf8');
    for (const fragment of ["WHEN 'awaiting-narrator'", "coalesce(p_filters->>'box','')<>'copias'", 'scheduled_replies_next', "coalesce(l.delivery_week,l.letter_number)"])
      expect(sql).toContain(fragment);
  });
});
