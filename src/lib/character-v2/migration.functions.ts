import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {reviewCharacterMigration,type CanonicalEvidence} from './migration-review';

/**
 * Admin-only, per-record, no RLS bypass, no bulk export.
 * The original snapshot leaves the server ONLY for an authenticated Narrador.
 * Not a write path: migration staging RPC is deliberately not invoked here.
 */
export const loadCharacterV2MigrationPreview=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({recordId:z.string().uuid(),houseId:z.string().min(1).max(100)}))
 .handler(async({context,data})=>{
  const authorized=await context.supabase.rpc('is_campaign_admin');
  const active=await context.supabase.rpc('campaign_access_active');
  if(authorized.error||active.error||!authorized.data||!active.data)
   throw new Error('Prévia V2 exclusiva do Narrador ativo.');
  const source=await context.supabase.from('campaign_records')
   .select('id,house_id,player_id,kind,title,content,version,visibility')
   .eq('id',data.recordId).eq('house_id',data.houseId).eq('kind','character').maybeSingle();
  if(source.error||!source.data)throw new Error('Ficha original inacessível.');
  const link=await context.supabase.from('character_source_links')
   .select('character_id,source_key')
   .eq('source_kind','campaign_record').eq('source_key',data.recordId).maybeSingle();
  if(link.error)throw new Error('Vínculo canônico não autorizado.');
  let canonical:CanonicalEvidence|null=null;
  if(link.data){
   const person=await context.supabase.from('campaign_characters')
    .select('id,house_id,review_status,confidence')
    .eq('id',link.data.character_id).maybeSingle();
   if(person.error)throw new Error('Identidade canônica indisponível.');
   if(person.data){
    canonical={
     id:person.data.id,houseId:person.data.house_id,
     reviewStatus:person.data.review_status as CanonicalEvidence['reviewStatus'],
     confidence:person.data.confidence as CanonicalEvidence['confidence'],
     sourceLinkRecordId:link.data.source_key,sourceLinkCanonicalId:link.data.character_id,
    };
   }
  }
  // RLS and role recheck after all reads; representation and membership may be revoked meanwhile.
  const after=await context.supabase.rpc('is_campaign_admin');
  const afterActive=await context.supabase.rpc('campaign_access_active');
  if(after.error||afterActive.error||!after.data||!afterActive.data)
   throw new Error('A permissão do Narrador mudou durante a consulta.');
  return reviewCharacterMigration({
   id:source.data.id,houseId:source.data.house_id!,playerId:source.data.player_id,
   version:source.data.version,title:source.data.title,content:source.data.content,
  },canonical);
 });
