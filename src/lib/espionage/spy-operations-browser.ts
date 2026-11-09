import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';

const spyOperationStatus=z.enum(['draft','planned','traveling','operating',
 'pending_narrator_review','returning','completed','cancelled']);
export const spyNarratorOperationSchema=z.object({
 operationId:z.string().uuid(),
 ownerHouseId:z.string().min(1),ownerHouseName:z.string().min(1),
 targetHouseId:z.string().min(1),targetHouseName:z.string().min(1),
 agentName:z.string().min(1),agentStatus:z.string().nullable(),
 status:spyOperationStatus,objective:z.enum(['house_resources','army','possessions']),
 departureKey:z.string().nullable(),arrivalKey:z.string().nullable(),
 investigationEndKey:z.string().nullable(),
 outcome:z.string().nullable(),intelligenceStatus:z.string().nullable(),
 createdAt:z.string().min(1),
}).strict();
const operationsSchema=z.array(spyNarratorOperationSchema).max(1200);
export type SpyNarratorOperation=z.infer<typeof spyNarratorOperationSchema>;

export const spyCounterintelligenceSchema=z.object({
 totalDetections:z.number().int().nonnegative(),
 alerts:z.array(z.object({
  dateKey:z.string().min(1),
  result:z.enum(['escaped','captured','dead']),
 }).strict()).max(12),
}).strict();
export type SpyCounterintelligence=z.infer<typeof spyCounterintelligenceSchema>;

type RpcResponse={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResponse>;
async function privateSpyRead(name:string,args:Record<string,unknown>){
 const session=await supabase.auth.getSession();
 if(session.error||!session.data.session?.access_token)
  throw new Error('Sessão expirada. Entre novamente para consultar a espionagem.');
 // Não usar um método rpc desligado do SupabaseClient; preserva a sessão JWT.
 const rpc=supabase.rpc.bind(supabase) as unknown as Rpc;
 const response=await rpc(name,args);
 if(response.error)throw new Error('Consulta indisponível ou não autorizada. Atualize a sessão.');
 return response.data;
}
/** RPC do Narrador valida is_campaign_admin() no banco; não lê tabelas diretamente. */
export async function readSpyNarratorOperationsBrowser():Promise<SpyNarratorOperation[]>{
 return operationsSchema.parse(await privateSpyRead('spy_narrator_operations_dashboard',{}));
}
/** Sem identidade, Casa de origem nem identificadores de espiões adversários. */
export async function readSpyHouseCounterintelligenceBrowser(houseId:string){
 if(!houseId||houseId.length>100)throw new Error('Casa inválida.');
 return spyCounterintelligenceSchema.parse(
  await privateSpyRead('spy_house_counterintelligence',{p_house:houseId}));
}

/** Histórico inteiro somente para o Narrador: o banco valida o papel por RPC.
 * Nunca encaminhar estes eventos às Casas atacantes.
 */
const spyNarratorIncidentSchema=z.object({
 id:z.string().uuid(),dateKey:z.string().min(1),
 outcome:z.enum(['escaped','captured','dead']),
 ownerHouseName:z.string().min(1),targetHouseName:z.string().min(1),
 agentName:z.string().min(1),targetRegion:z.string().nullable(),
 detail:z.string(),
}).strict();
export const spyNarratorIncidentListSchema=z.array(spyNarratorIncidentSchema).max(800);
export type SpyNarratorIncident=z.infer<typeof spyNarratorIncidentSchema>;
export async function readSpyNarratorIncidentsBrowser():Promise<SpyNarratorIncident[]>{
 return spyNarratorIncidentListSchema.parse(await privateSpyRead('spy_narrator_incident_history',{}));
}
