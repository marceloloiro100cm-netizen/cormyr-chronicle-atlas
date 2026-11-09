import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {balances} from '@/lib/house/engine';
import type {HouseState} from '@/lib/house/types';
import {supabase} from '@/integrations/supabase/client';

export const spyDossierObjectiveSchema=z.enum(['house_resources','army','possessions']);
const snapshotSchema=z.record(z.string(),z.unknown());
export const spyFindingSchema=z.object({
 id:z.string().uuid(),objective:spyDossierObjectiveSchema,
 key:z.string(),snapshot:snapshotSchema,
 discoveredDate:z.string(),verifiedDate:z.string(),
});
export const spyDossierSchema=z.object({
 id:z.string().uuid(),ownerHouseId:z.string(),targetHouseId:z.string(),
 ownerHouseName:z.string(),targetHouseName:z.string(),
 targetRegion:z.string().nullable(),updatedAt:z.string(),
 findings:z.array(spyFindingSchema),
 history:z.array(z.object({
  id:z.string().uuid(),objective:spyDossierObjectiveSchema,
  key:z.string(),action:z.string(),dateKey:z.string(),
  oldSnapshot:snapshotSchema.nullable(),newSnapshot:snapshotSchema,
 })),
 adminHistory:z.array(z.object({
  id:z.string().uuid(),objective:spyDossierObjectiveSchema,
  key:z.string(),action:z.string(),dateKey:z.string(),reason:z.string(),
 })),
});
export type SpyDossier=z.infer<typeof spyDossierSchema>;
export const spyDossierListSchema=z.array(spyDossierSchema).max(5000);
export const spyPendingSchema=z.array(z.object({
 operationId:z.string().uuid(),objective:spyDossierObjectiveSchema,
 ownerHouseId:z.string(),targetHouseId:z.string(),
 dateKey:z.string(),capacity:z.number().int().min(3).max(7),
})).max(5000);
export const spyAdminOptionsSchema=z.array(z.object({
 objective:spyDossierObjectiveSchema,key:z.string(),name:z.string(),
})).max(10000);

type RpcResponse={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResponse>;
async function browserRead(name:string,args:Record<string,unknown>){
 const session=await supabase.auth.getSession();
 if(session.error||!session.data.session?.access_token)
  throw new Error('Sessão expirada. Entre novamente no Cormyr.');
 // SupabaseClient.rpc usa `this`; invocar um método extraído perde o receptor
 // e quebra os dossiês mesmo quando a sessão e a RPC do banco estão corretas.
 const rpc=supabase.rpc.bind(supabase) as unknown as Rpc;
 const result=await rpc(name,args);
 if(result.error)throw new Error('Não foi possível consultar o dossiê. Confirme o acesso e tente novamente.');
 return result.data;
}
export async function readSpyDossiersBrowser(houseId:string|null):Promise<SpyDossier[]>{
 const raw=await browserRead('spy_intelligence_read',{p_house:houseId});
 const parsed=spyDossierListSchema.safeParse(raw);
 if(!parsed.success || (houseId&&parsed.data.some(d=>d.ownerHouseId!==houseId)))
  throw new Error('Resposta de inteligência incompatível com esta Casa.');
 // Defesa em profundidade: a RPC já filtra o conteúdo pela Casa; este contrato
 // impede exibir auditoria administrativa ou snapshots históricos caso uma
 // migração futura mude inadvertidamente o formato para jogadores.
 if(houseId&&parsed.data.some(d=>
  d.adminHistory.length>0||d.history.some(e=>
   e.oldSnapshot!==null||Object.keys(e.newSnapshot).length>0)))
  throw new Error('O dossiê contém dados reservados e não pode ser exibido.');
 return parsed.data;
}
export async function readSpyIntelligencePendingBrowser(){
 return spyPendingSchema.parse(await browserRead('spy_intelligence_admin_pending',{}));
}
export async function readSpyIntelligenceOptionsBrowser(dossierId:string){
 return spyAdminOptionsSchema.parse(await browserRead('spy_intelligence_admin_options',{
  p_dossier:dossierId,
 }));
}

type ServerSupabase={
 rpc:Rpc;
 from:(table:string)=>{select:(cols:string)=>{
  eq:(key:string,value:string)=>{maybeSingle:()=>Promise<{
   data:{state:unknown}|null;error:{message:string}|null
  }>};
 }};
};
/** Admin-only: same resource formula the House sheet uses, not raw base points.
 * NEVER return the target sheet to the browser.
 */
async function officialResourceSnapshot(db:ServerSupabase,targetHouseId:string){
 const result=await db.from('noble_house_sheets').select('state')
  .eq('house_id',targetHouseId).maybeSingle();
 if(result.error)throw new Error('Não foi possível consultar a ficha oficial do alvo.');
 if(!result.data?.state)return null;
 const total=balances(result.data.state as HouseState).total;
 if(Object.values(total).some(n=>!Number.isSafeInteger(n)))
  throw new Error('Atributos da Casa requerem revisão antes de revelar segredos.');
 return total;
}
async function requireNarrator(db:ServerSupabase){
 const result=await db.rpc('is_campaign_admin',{});
 if(result.error||result.data!==true)
  throw new Error('Somente o Narrador pode executar esta ação.');
}
async function pendingByOperation(db:ServerSupabase,operationId:string){
 const result=await db.rpc('spy_intelligence_admin_pending',{});
 if(result.error)throw new Error('Não foi possível consultar missões pendentes.');
 return spyPendingSchema.parse(result.data).find(p=>p.operationId===operationId)??null;
}

/** Safe to retry after mission adjudication; unique award and row locks avoid
 * multiple revelations if the browser retries a request or narrator refreshes.
 */
export async function finishSpyIntelligence(
 db:ServerSupabase,operationId:string,
):Promise<'complete'|'waiting_catalog'|'no_success_award'>{
 await requireNarrator(db);
 // A ausência na fila NÃO significa que o prêmio foi aplicado.
 // Conferir a decisão real impede sucesso sem descobertas persistidas.
 const stateResult=await db.rpc('spy_intelligence_operation_status',{
  p_operation:operationId,
 });
 if(stateResult.error)throw new Error('Não foi possível verificar o prêmio da missão.');
 const {status}=z.object({status:z.enum([
  'complete','waiting_catalog','no_success_award','missing_award',
  'pending_resolution',
 ])}).parse(stateResult.data);
 if(status==='complete'||status==='no_success_award')return status;
 if(status==='missing_award')
  throw new Error('Missão concluída com sucesso sem prêmio de inteligência: requer reparo do Narrador.');
 if(status==='pending_resolution')
  throw new Error('A missão ainda não foi homologada pelo Narrador.');
 const pending=await pendingByOperation(db,operationId);
 if(!pending)throw new Error('Missão aguardando dados sem entrada na fila de reprocessamento.');
 const resources=pending.objective==='house_resources'
  ?await officialResourceSnapshot(db,pending.targetHouseId):null;
 const result=await db.rpc('spy_intelligence_finalize',{
  p_operation:operationId,p_resources:resources,
 });
 if(result.error)throw new Error('Resultado homologado, mas o dossiê ainda precisa de reprocessamento. Atualize a fila do Narrador.');
 const finalStatus=z.object({status:z.enum([
  'complete','waiting_catalog','no_success_award',
 ])}).passthrough().parse(result.data).status;
 return finalStatus;
}
const retryInput=z.object({operationId:z.string().uuid()}).strict();
export const retrySpyIntelligence=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(retryInput)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as ServerSupabase;
  return {status:await finishSpyIntelligence(db,data.operationId)};
 });

const actionInput=z.object({
 dossierId:z.string().uuid(),objective:spyDossierObjectiveSchema,
 subjectKey:z.string().min(1).max(160),
 action:z.enum(['reveal','revalidate','revoke']),
 reason:z.string().trim().min(10).max(1200),
}).strict();
export const adjustSpyIntelligence=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(actionInput)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as ServerSupabase;
  await requireNarrator(db);
  const all=await db.rpc('spy_intelligence_read',{p_house:null});
  if(all.error)throw new Error('Não foi possível confirmar o dossiê.');
  const dossier=spyDossierListSchema.parse(all.data).find(d=>d.id===data.dossierId);
  if(!dossier)throw new Error('Dossiê não encontrado.');
  const resources=data.objective==='house_resources'&&data.action!=='revoke'
   ?await officialResourceSnapshot(db,dossier.targetHouseId):null;
  const result=await db.rpc('spy_intelligence_admin_action',{
   p_dossier:data.dossierId,p_objective:data.objective,
   p_subject_key:data.subjectKey,p_action:data.action,p_reason:data.reason,
   p_resources:resources,
  });
  if(result.error)throw new Error('Não foi possível registrar a alteração do dossiê. Confira a fonte oficial, a justificativa e suas permissões.');
  return z.object({
   status:z.literal('applied'),knownCount:z.number().int().nonnegative(),
  }).parse(result.data);
 });
