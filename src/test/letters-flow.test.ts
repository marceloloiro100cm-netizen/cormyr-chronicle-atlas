// Live integration tests use isolated accounts and a fixture house, never campaign participants.
// Run with server connection variables present; cleanup removes every fixture.
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_SERVICE_ROLE_KEY'], publicKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
describe.skipIf(!url || !key || !publicKey)('Numbered letters, kinds and player flow', () => {
  it('sends numbered geral/reservada letters, player replies and writes new letters', async () => {
    if (!url || !key || !publicKey) throw new Error('Test connection missing');
    const shim = (k: string): typeof fetch => (input, init) => { const h = new Headers(init?.headers); if (k.startsWith('sb_') && h.get('Authorization') === `Bearer ${k}`) h.delete('Authorization'); h.set('apikey', k); return fetch(input, { ...init, headers: h }); };
    const admin = createClient<Database>(url, key, { auth: { persistSession: false }, global: { fetch: shim(key) } });
    const ids: string[] = [], players: string[] = [], letters: string[] = [];
    const houseId = 'fixture-house-' + crypto.randomUUID().slice(0, 8);
    try {
      await admin.from('campaign_houses').insert({ id: houseId, name: 'Isolated fixture house', source: 'fixture', active: true, season: 2 });
      const clients: ReturnType<typeof createClient<Database>>[] = [];
      for (let i = 0; i < 3; i++) {
        const email = `cormyr-letters-${crypto.randomUUID()}@example.invalid`, password = crypto.randomUUID() + 'aA9!';
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (error || !data.user) throw error ?? new Error('Account creation failed'); ids.push(data.user.id);
        const client = createClient<Database>(url, publicKey, { auth: { persistSession: false }, global: { fetch: shim(publicKey) } }); expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull(); clients.push(client);
        const player = await admin.from('campaign_players').insert({ name: `Letters fixture ${i}`, user_id: data.user.id }).select().single(); if (player.error || !player.data) throw player.error; players.push(player.data.id);
        expect((await admin.from('house_memberships').insert({ player_id: player.data.id, house_id: houseId, authorized_by: data.user.id })).error).toBeNull();
      }
      const [p1, p2, gm] = clients; if (!p1 || !p2 || !gm) throw new Error('Fixtures unavailable');
      const gmId = ids[2]; if (!gmId) throw new Error('Missing gm');
      expect((await admin.from('user_roles').insert({ user_id: gmId, role: 'admin' })).error).toBeNull();

      // Missiva 1 geral para a casa toda (uma linha por destinatário, mesmo número)
      const batchKey = crypto.randomUUID();
      const sent = await gm.rpc('send_campaign_letter_batch', { p_kind: 'geral', p_number: 1, p_subject: 'Fixture Missiva 1', p_content: 'Conteúdo geral', p_recipients: ['h:' + houseId, 'p:' + players[0]], p_key: batchKey });
      expect(sent.error).toBeNull(); expect(sent.data).toBe(2);
      // repetição com a mesma chave não duplica destinatários
      const again = await gm.rpc('send_campaign_letter_batch', { p_kind: 'geral', p_number: 1, p_subject: 'Fixture Missiva 1', p_content: 'Conteúdo geral', p_recipients: ['h:' + houseId, 'p:' + players[0]], p_key: batchKey });
      expect(again.error).toBeNull(); expect(again.data).toBe(0);
      const stored = await admin.from('campaign_letters').select('id,letter_number,letter_kind').eq('batch_key', batchKey);
      expect(stored.data).toHaveLength(2);
      expect(stored.data?.every(l => l.letter_number === 1 && l.letter_kind === 'geral')).toBe(true);
      letters.push(...(stored.data ?? []).map(l => l.id));

      // numeração automática: sem número explícito, vira a próxima
      const autoKey = crypto.randomUUID();
      const auto = await gm.rpc('send_campaign_letter_batch', { p_kind: 'reservada', p_number: null as unknown as number, p_subject: 'Fixture reservada', p_content: 'Só um destinatário', p_recipients: ['p:' + players[1]], p_key: autoKey });
      expect(auto.error).toBeNull(); expect(auto.data).toBe(1);
      const autoRow = await admin.from('campaign_letters').select('id,letter_number,letter_kind').eq('batch_key', autoKey).single();
      expect(autoRow.data?.letter_number).toBe(2); expect(autoRow.data?.letter_kind).toBe('reservada');
      if (autoRow.data) letters.push(autoRow.data.id);

      // reservada exige exatamente um destinatário
      const invalid = await gm.rpc('send_campaign_letter_batch', { p_kind: 'reservada', p_number: 3, p_subject: 'x', p_content: 'y', p_recipients: ['h:' + houseId, 'p:' + players[0]], p_key: crypto.randomUUID() });
      expect(invalid.error).not.toBeNull();

      // jogador responde: fica respondido, recibo gravado, idempotente
      const letterId = stored.data?.[0]?.id; if (!letterId) throw new Error('Missing letter');
      const replyKey = crypto.randomUUID();
      const r1 = await p1.rpc('reply_campaign_letter', { p_letter: letterId, p_content: 'Resposta do jogador', p_key: replyKey });
      const r2 = await p1.rpc('reply_campaign_letter', { p_letter: letterId, p_content: 'Resposta do jogador', p_key: replyKey });
      expect(r1.error).toBeNull(); expect(r2.data).toBe(r1.data);
      const receipts = await admin.from("letter_receipts").select("letter_id").eq("letter_id", letterId);
      expect(receipts.data).toHaveLength(1);

      // jogador escreve missiva nova ao narrador, sem responder nada
      const ownKey = crypto.randomUUID();
      const own = await p1.rpc('player_send_letter', { p_subject: 'Dúvida do jogador', p_content: 'Texto novo', p_key: ownKey });
      expect(own.error).toBeNull(); letters.push(own.data as string);
      const ownRow = await admin.from('campaign_letters').select('letter_kind,letter_number,sender_name,recipient_house_id').eq('id', own.data).single();
      expect(ownRow.data).toMatchObject({ letter_kind: 'reservada', letter_number: null, sender_name: 'Letters fixture 0', recipient_house_id: houseId });
      // narrador lê e responde a missiva do jogador
      const gmSees = await gm.from('campaign_letters').select('id').eq('id', own.data);
      expect(gmSees.data).toHaveLength(1);
      const gmReply = await gm.rpc('reply_campaign_letter', { p_letter: own.data as string, p_content: 'Resposta do narrador', p_key: crypto.randomUUID() });
      expect(gmReply.error).toBeNull();
      const gmReplyRow = await admin.from('letter_replies').select('author_name').eq('id', gmReply.data).single();
      expect(gmReplyRow.data?.author_name).toBe('Mestre');
      // o outro jogador da mesma casa não lê a missiva pessoal do colega
      const p2Sees = await p2.from('campaign_letters').select('id').eq('id', own.data);
      expect(p2Sees.data).toEqual([]);
    } finally {
      const replies = await admin.from('letter_replies').select('id').in('letter_id', letters);
      const entities = [...letters, ...(replies.data ?? []).map(r => r.id)];
      await admin.from('sync_outbox').delete().in('entity_id', entities);
      await admin.from('letter_replies').delete().in('letter_id', letters);
      await admin.from('letter_receipts').delete().in('letter_id', letters);
      await admin.from('campaign_letters').delete().in('id', letters);
      await admin.from('house_memberships').delete().in('player_id', players);
      await admin.from('campaign_players').delete().in('id', players);
      await admin.from('campaign_houses').delete().eq('id', houseId);
      await admin.from('user_roles').delete().in('user_id', ids);
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
  }, 60000);
});
