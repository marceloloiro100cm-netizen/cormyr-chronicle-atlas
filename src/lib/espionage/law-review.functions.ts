import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {balances} from '@/lib/house/engine';
import type {HouseState} from '@/lib/house/types';
import {spyLawSnapshotSchema} from './difficulty.server';
import {deriveVerifiedSpyHouseLaw,pendingSpyLaw} from './law-review.server';

/** Narrator-only, identity-verified read of Law provenance.
 * RLS on the player cannot be bypassed: only the authenticated narrator may
 * enter this handler, before any use of the service role. No global clock
 * assumptions and no fabricated NPC/regional Law.
 */
export const reviewSpyLawSource=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({operationId:z.string().uuid()}))
 .handler(async({data,context})=>{
  const auth=await context.supabase.rpc('is_campaign_admin');
  if(auth.error||auth.data!==true)throw new Error('Somente o Narrador pode consultar a Lei de um alvo.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const operation=await db.from('spy_operations')
   .select('id,target_id,target_type,mission_kind,status,version')
   .eq('id',data.operationId).maybeSingle();
  if(operation.error||!operation.data)
   throw new Error('Missão não encontrada ou indisponível.');
  const op=operation.data;
  let law=pendingSpyLaw(op.target_id);
  if(op.target_type==='house'){
   const target=await db.from('noble_house_sheets')
    .select('state,version').eq('house_id',op.target_id).maybeSingle();
   if(target.error)throw new Error('Ficha do alvo indisponível para a revisão.');
   if(target.data?.state){
    // Never return raw HouseState, holdings or non-Law resources to the caller.
    const state=target.data.state as unknown as HouseState;
    law=deriveVerifiedSpyHouseLaw(state,target.data.version,op.target_id);
   }
  }
  const roleNow=await context.supabase.rpc('is_campaign_admin');
  if(roleNow.error||roleNow.data!==true)
   throw new Error('Permissão narratorial revogada durante a consulta.');
  const checked=spyLawSnapshotSchema.parse(law);
  return {
   operationId:op.id,operationVersion:op.version,targetType:op.target_type,
   targetId:op.target_id,missionKind:op.mission_kind,status:op.status,
   lawSource:checked,
   difficultyStatus:'pending_approved_rule_and_countermeasure_review' as const,
   successChancePercent:null as null,
   explanation:checked.kind==='unresolved'
    ?'Fonte de Lei indisponível ou não homologada; nenhuma dificuldade calculada.'
    :'Lei efetiva da ficha do alvo conferida apenas ao Narrador. É obrigatório homologar tabela de dificuldade e contramedidas antes do cálculo.',
  };
 });
