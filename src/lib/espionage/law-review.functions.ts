import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {HouseState} from '@/lib/house/types';
import {spyLawSnapshotSchema} from './difficulty.server';
import {deriveVerifiedSpyHouseLaw,pendingSpyLaw} from './law-review.server';

type UnregisteredSelect={data:unknown;error:{message:string}|null};
type UnregisteredTable={select:(fields:string)=>{eq:(column:string,value:string)=>{
 maybeSingle:()=>Promise<UnregisteredSelect>}}};
const operationSchema=z.object({
 id:z.string().uuid(),target_id:z.string().min(1),target_type:z.enum(['house','region','person']),
 mission_kind:z.string(),status:z.string(),version:z.number().int().min(1),
});
const targetSheetSchema=z.object({state:z.unknown(),version:z.number().int().min(1)});

/** Narrator-only, identity-verified target Law read. This function MUST NOT
 * be mounted for players or expose the raw target HouseState.
 */
export const reviewSpyLawSource=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({operationId:z.string().uuid()}))
 .handler(async({data,context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');
  if(role.error||role.data!==true)
   throw new Error('Somente o Narrador pode consultar a Lei de um alvo.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  // The spy tables await their approved migration, so narrow the ungenerated
  // Supabase table selection locally and validate *every* result at runtime.
  const db=supabaseAdmin as unknown as {from:(table:string)=>UnregisteredTable};
  const operation=await db.from('spy_operations')
   .select('id,target_id,target_type,mission_kind,status,version')
   .eq('id',data.operationId).maybeSingle();
  const parsedOp=operationSchema.safeParse(operation.data);
  if(operation.error||!parsedOp.success)
   throw new Error('Missão não encontrada ou indisponível.');
  const op=parsedOp.data;
  let law=pendingSpyLaw(op.target_id);
  if(op.target_type==='house'){
   const result=await db.from('noble_house_sheets')
    .select('state,version').eq('house_id',op.target_id).maybeSingle();
   if(result.error)throw new Error('Ficha do alvo indisponível para a revisão.');
   if(result.data!==null){
    const target=targetSheetSchema.safeParse(result.data);
    if(!target.success)throw new Error('Versão da ficha do alvo inválida.');
    // Balance engine uses the canonical stored state; no HouseState is returned.
    const candidate=target.data.state as HouseState;
    law=deriveVerifiedSpyHouseLaw(candidate,target.data.version,op.target_id);
   }
  }
  const refreshed=await context.supabase.rpc('is_campaign_admin');
  if(refreshed.error||refreshed.data!==true)
   throw new Error('Permissão narratorial revogada durante a consulta.');
  return {
   operationId:op.id,operationVersion:op.version,targetType:op.target_type,
   targetId:op.target_id,missionKind:op.mission_kind,status:op.status,
   lawSource:spyLawSnapshotSchema.parse(law),
   difficultyStatus:'pending_approved_rule_and_countermeasure_review' as const,
   successChancePercent:null as null,
   explanation:law.kind==='unresolved'
    ?'Fonte de Lei indisponível ou não homologada; nenhuma dificuldade calculada.'
    :'Lei efetiva do alvo conferida apenas pelo Narrador. Avaliar as contramedidas antes do cálculo final.',
  };
 });
