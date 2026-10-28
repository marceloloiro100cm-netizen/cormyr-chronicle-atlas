import { supabase } from '@/integrations/supabase/client';

export async function loadPanel(){
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw new Error('Sessão expirada.');
  const {data:admin,error:roleError}=await supabase.rpc('is_campaign_admin');if(roleError)throw roleError;
  const [houses,players,members,records,letters,receipts,catalog]=await Promise.all([
    supabase.from('campaign_houses').select('*').order('name'),supabase.from('campaign_players').select('*').order('name'),supabase.from('house_memberships').select('*'),supabase.from('campaign_records').select('*').order('updated_at',{ascending:false}),supabase.from('campaign_letters').select('*').order('created_at',{ascending:false}),supabase.from('letter_receipts').select('*'),supabase.from('house_catalog').select('id,name').order('name')]);
  for(const result of [houses,players,members,records,letters,receipts,catalog])if(result.error)throw result.error;
  const replies=await supabase.from('letter_replies').select('*').order('created_at');if(replies.error)throw replies.error;
  const rounds=await supabase.from('letter_rounds').select('*');if(rounds.error)throw rounds.error;
  return {user,catalog:catalog.data??[],admin:Boolean(admin),houses:houses.data??[],players:players.data??[],members:members.data??[],records:records.data??[],letters:letters.data??[],receipts:receipts.data??[],replies:replies.data??[],rounds:rounds.data??[]};
}

export type Panel=Awaited<ReturnType<typeof loadPanel>>;
