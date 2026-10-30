import { supabase } from '@/integrations/supabase/client';

async function allRows<T>(query:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]>{
 const rows:T[]=[];
 for(let from=0;;from+=500){const r=await query(from,from+499);if(r.error)throw r.error;rows.push(...(r.data??[]));if(!r.data||r.data.length<500)return rows;}
}
export async function loadPanel(){
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw new Error('Sessão expirada.');
  const {data:admin,error:roleError}=await supabase.rpc('is_campaign_admin');if(roleError)throw roleError;
  const [houses,players,members,records,letters,receipts,catalog]=await Promise.all([
    supabase.from('campaign_houses').select('*').order('name'),supabase.from('campaign_players').select('*').order('name'),supabase.from('house_memberships').select('*'),supabase.from('campaign_records').select('*').order('updated_at',{ascending:false}),allRows((from,to)=>supabase.from('campaign_letters').select('id,sender_user_id,sender_player_id,sender_name,recipient_house_id,recipient_player_id,subject,created_at,sync_state,last_synced_at,letter_number,letter_kind,publication_state,delivery_week,creation_week,conversation_id,deleted_at,delivered_at,version,batch_key,origin_house_id,court_member_id,court_assignment,military_unit_id,house_sheet_version,campaign_date').order('id').range(from,to)).then(rows=>({data:rows.map(l=>({...l,content:''})),error:null})),allRows((from,to)=>supabase.from('letter_receipts').select('*').order('letter_id').order('user_id').range(from,to)).then(data=>({data,error:null})),supabase.from('house_catalog').select('id,name').order('name')]);
  for(const result of [houses,players,members,records,letters,receipts,catalog])if(result.error)throw result.error;
  const replyRows=await allRows((from,to)=>supabase.from('letter_replies').select('id,letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,created_at,delivered_at,publication_state,delivery_week,creation_week,reply_to_id,sync_state,campaign_date,version,updated_at,deleted_at').order('id').range(from,to));
 const replies={data:replyRows.map(r=>({...r,content:''}))};
  const rounds=await supabase.from('letter_rounds').select('*');if(rounds.error)throw rounds.error;
  return {user,catalog:catalog.data??[],admin:Boolean(admin),houses:houses.data??[],players:players.data??[],members:members.data??[],records:records.data??[],letters:letters.data??[],receipts:receipts.data??[],replies:replies.data??[],rounds:rounds.data??[]};
}

export type Panel=Awaited<ReturnType<typeof loadPanel>>;
