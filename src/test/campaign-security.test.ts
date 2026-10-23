// Live integration tests use isolated accounts, never campaign participants.
// Run with server connection variables present; cleanup removes every fixture.
import { describe,it,expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_SERVICE_ROLE_KEY'],publicKey=process.env['SUPABASE_PUBLISHABLE_KEY'];
describe.skipIf(!url||!key||!publicKey)('Campaign authorization and persistence',()=>{
  it('isolates houses, private players and GM secrets; makes responses idempotent',async()=>{
    if(!url||!key||!publicKey)throw new Error('Test connection missing');
    const shim=(k:string):typeof fetch=>(input,init)=>{const h=new Headers(init?.headers);if(k.startsWith('sb_')&&h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');h.set('apikey',k);return fetch(input,{...init,headers:h});};
    const admin=createClient<Database>(url,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
    const ids:string[]=[],players:string[]=[],records:string[]=[],letters:string[]=[];
    const clients:ReturnType<typeof createClient<Database>>[]=[];
    try{
      for(let i=0;i<4;i++){
        const email=`cormyr-test-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+'aA9!';
        const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error||!data.user)throw error??new Error('Account creation failed');ids.push(data.user.id);
        const client=createClient<Database>(url,publicKey,{auth:{persistSession:false},global:{fetch:shim(publicKey)}});const login=await client.auth.signInWithPassword({email,password});expect(login.error).toBeNull();clients.push(client);
        const player=await admin.from('campaign_players').insert({name:`Isolated test ${i}`,user_id:data.user.id}).select().single();if(player.error||!player.data)throw player.error;players.push(player.data.id);
        const membership=await admin.from('house_memberships').insert({player_id:player.data.id,house_id:i===2?'harcourt':'erdenor',authorized_by:data.user.id});expect(membership.error).toBeNull();
      }
      const [a,b,c,gm]=clients;if(!a||!b||!c||!gm)throw new Error('Fixtures unavailable');
      const [aId,bId,cId,gmId]=ids;const [aPlayer,bPlayer,cPlayer]=players;if(!aId||!bId||!cId||!gmId||!aPlayer||!bPlayer||!cPlayer)throw new Error('Missing identifiers');
      const role=await admin.from('user_roles').insert({user_id:gmId,role:'admin'});expect(role.error).toBeNull();
      for(const visibility of ['house','player','gm']){
        const row=await gm.from('campaign_records').insert({title:'Isolated '+visibility,content:'Original',house_id:'erdenor',player_id:visibility==='player'?aPlayer:null,visibility,kind:'document',created_by:gmId,updated_by:gmId}).select().single();if(row.error||!row.data)throw row.error;records.push(row.data.id);
      }
      const sharedId=records[0];if(!sharedId)throw new Error('Missing shared record');
      const readA=await a.from('campaign_records').select('id').in('id',records);expect(readA.error).toBeNull();expect(readA.data?.map(r=>r.id).sort()).toEqual(records.slice(0,2).sort());
      const readB=await b.from('campaign_records').select('id').in('id',records);expect(readB.data?.map(r=>r.id)).toEqual([records[0]]);
      const readC=await c.from('campaign_records').select('id').in('id',records);expect(readC.data).toEqual([]);
      const auto=await c.from('house_memberships').insert({player_id:cPlayer,house_id:'erdenor',authorized_by:cId});expect(auto.error).not.toBeNull();
      const promote=await c.from('user_roles').insert({user_id:cId,role:'admin'});expect(promote.error).not.toBeNull();
      const edited=await a.rpc('save_campaign_record',{p_id:sharedId,p_version:1,p_title:'Updated',p_content:'Persisted edit'});expect(edited.error).toBeNull();
      const stale=await b.rpc('save_campaign_record',{p_id:sharedId,p_version:1,p_title:'Stale',p_content:'Must not overwrite'});expect(stale.error).not.toBeNull();
      const versions=await a.from('record_versions').select('version').eq('record_id',sharedId).order('version');expect(versions.data?.map(v=>v.version)).toEqual([1,2]);
      const lid=crypto.randomUUID();letters.push(lid);const sent=await gm.rpc('send_campaign_message',{p_recipient:'h:erdenor',p_subject:'Isolated test missiva',p_content:'Only authorized house',p_key:lid});expect(sent.error).toBeNull();
      const hidden=await c.from('campaign_letters').select('id').eq('id',lid);expect(hidden.data).toEqual([]);
      const forbidden=await c.rpc('reply_campaign_letter',{p_letter:lid,p_content:'Forbidden',p_key:crypto.randomUUID()});expect(forbidden.error).not.toBeNull();
      const replyKey=crypto.randomUUID();const first=await a.rpc('reply_campaign_letter',{p_letter:lid,p_content:'Authorized reply',p_key:replyKey});const second=await a.rpc('reply_campaign_letter',{p_letter:lid,p_content:'Authorized reply',p_key:replyKey});expect(first.error).toBeNull();expect(second.data).toBe(first.data);
      const replies=await gm.from('letter_replies').select('*').eq('letter_id',lid);expect(replies.data?.length).toBe(1);expect(replies.data?.[0]?.recipient_user_id).toBe(gmId);
      const receipt=await a.from('letter_receipts').select('*').eq('letter_id',lid);expect(receipt.data?.length).toBe(1);
      const queue=await admin.from('sync_outbox').select('entity_type,state').in('entity_id',[...records,lid,first.data??'00000000-0000-0000-0000-000000000000']);expect(queue.data?.length).toBe(6);expect(queue.data?.every(q=>q.state==='pending')).toBe(true);
    }finally{
      await admin.from('letter_versions').delete().in('letter_id',letters);
      const replies=await admin.from('letter_replies').select('id').in('letter_id',letters);const entities=[...records,...letters,...(replies.data??[]).map(r=>r.id)];
      await admin.from('sync_outbox').delete().in('entity_id',entities);await admin.from('letter_replies').delete().in('letter_id',letters);await admin.from('letter_receipts').delete().in('letter_id',letters);await admin.from('campaign_letters').delete().in('id',letters);await admin.from('record_versions').delete().in('record_id',records);await admin.from('campaign_records').delete().in('id',records);await admin.from('house_memberships').delete().in('player_id',players);await admin.from('campaign_players').delete().in('id',players);for(const id of ids)await admin.auth.admin.deleteUser(id);
    }
  },60000);
});