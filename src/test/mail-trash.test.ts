import {describe,expect,it} from 'vitest';
import {deliveredReply,hasDeliveredAnswer,lastReplyActivity,narratorThreadStage,type LetterRow} from '@/lib/letters';

const original:LetterRow={
 id:'letter-1',sender_user_id:'narrator',sender_name:'Narrador',
 recipient_house_id:'silversky',recipient_player_id:null,
 subject:'A obra e o cargo',content:'Carta original',created_at:'2026-10-30T12:00:00Z',
 sync_state:'synced',last_synced_at:null,letter_number:1,letter_kind:'reservada',
 publication_state:'delivered',delivered_at:'2026-10-30T12:00:00Z',
};

describe('Missivas e respostas com exclusão reversível',()=>{
 it('excluir uma resposta não remove nem altera o fio da missiva',()=>{
  const first={id:'reply-1',letter_id:original.id,author_user_id:'player',publication_state:'delivered',
    created_at:'2026-10-30T12:30:00Z'};
  const second={id:'reply-2',letter_id:original.id,author_user_id:'narrator',publication_state:'delivered',
    created_at:'2026-10-30T13:00:00Z'};
  expect(hasDeliveredAnswer(original,[first,second])).toBe(true);
  const deleted={...first,deleted_at:'2026-11-01T00:00:00Z'};
  expect(deliveredReply(deleted)).toBe(false);
  expect(deliveredReply(second)).toBe(true);
  expect(hasDeliveredAnswer(original,[deleted,second])).toBe(false);
  expect(original.subject).toBe('A obra e o cargo');
  expect(original.id).toBe('letter-1');
  expect(narratorThreadStage(original,[deleted,second],'narrator')).toBe('awaiting-house');
 });
 it('respostas excluídas não influenciam leitura e podem voltar ao cálculo após restauração',()=>{
  const deleted={id:'reply-3',letter_id:original.id,author_user_id:'player',
    publication_state:'delivered',created_at:'2026-10-30T13:30:00Z',
    deleted_at:'2026-11-01T00:00:00Z'};
  expect(lastReplyActivity(original.id,[deleted],'narrator')).toBe('');
  const restored={...deleted,deleted_at:null};
  expect(lastReplyActivity(original.id,[restored],'narrator')).toBe('2026-10-30T13:30:00Z');
  expect(hasDeliveredAnswer(original,[restored])).toBe(true);
 });
});
