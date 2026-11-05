import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {verifyReplay,battleHash,canonicalJson} from '../domain/replay';
import {battleReport} from '../domain/report';
import type {BattleState} from '../domain/types';
import type {HouseState} from '@/lib/house/types';
import {v35OfficialSources,v35ManualOutcome,v35ApplyManualLosses,
 v35DecisionsSchema,V35_POLICY_VERSION,type V35Decision,
 type V35HouseSnapshot} from './official-adjudication';

type Db={rpc:(name:string,args?:Record<string,unknown>)=>
 Promise<{data:any;error:{message:string}|null}>;from:(table:string)=>any};
const uuid=z.string().uuid();
const caseInput=z.object({caseId:uuid}).strict();
const stageInput=z.object({battleSessionId:uuid}).strict();
const saveInput=caseInput.extend({
 expectedReviewVersion:z.number().int().min(0).max(99),decisions:v35DecisionsSchema,
}).strict();
const approveInput=caseInput.extend({
 expectedReviewVersion:z.number().int().min(1).max(100),
 planHash:z.string().regex(/^[0-9a-f]{64}$/),
 acknowledgement:z.literal('APROVAR BAIXAS'),
}).strict();
const applyInput=caseInput.extend({
 operationId:uuid,acknowledgement:z.literal('APLICAR NAS CASAS'),
}).strict();
export type V35CaseRow={
 id:string;battle_session_id:string;created_by:string;
 house_a_id:string;house_b_id:string;
 expected_version_a:number;expected_version_b:number;
 source_hash_a:string;source_hash_b:string;battle_hash:string;
 sources_json:unknown;report_json:unknown;
 decisions_json:unknown;plan_hash:string|null;review_version:number;
 status:'draft'|'approved'|'applied'|'rejected';apply_id:string|null;
 approved_by:string|null;approved_at:string|null;applied_at:string|null;
};
export type V35CaseList=Readonly<Pick<V35CaseRow,
 'id'|'battle_session_id'|'house_a_id'|'house_b_id'|'status'|'review_version'>>;
function enabled(){
 if(process.env['ENABLE_BATTLE_V35_OFFICIAL']!=='true')
  throw new Error('Homologação V3.5 bloqueada por configuração.');
}
function applyEnabled(){
 if(process.env['ENABLE_BATTLE_V35_APPLY']!=='true')
  throw new Error('Aplicação oficial desativada: falta autorizar a política manual e homologar.');
}
async function narrator(db:Db){
 const [a,b]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(a.error||b.error||a.data!==true||b.data!==true)
  throw new Error('Somente o Narrador ativo pode homologar batalhas oficiais.');
}
async function trusted():Promise<Db>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 return supabaseAdmin as unknown as Db;
}
async function caseRow(db:Db,id:string):Promise<V35CaseRow>{
 const r=await db.from('battle_v35_cases').select('*').eq('id',id).maybeSingle();
 if(r.error||!r.data)throw new Error('Revisão não localizada ou sem acesso.');
 return r.data as V35CaseRow;
}
async function verifiedOfficialBattle(db:Db,id:string){
 const [battle,events]=await Promise.all([
  db.from('battle_sim_sessions').select('*').eq('id',id).maybeSingle(),
  db.from('battle_sim_events').select('event_json').eq('session_id',id)
   .order('seq',{ascending:true}).limit(1201),
 ]);
 if(battle.error||!battle.data||events.error||!events.data)
  throw new Error('Replay oficial não pode ser lido.');
 const initial=battle.data.initial_state_json as BattleState;
 const result=verifyReplay({
  format:'CCA-BATTLE-REPLAY-1',rulesVersion:'PTE-2.0',schemaVersion:2,
  initial,initialStateHash:battle.data.initial_state_hash,
  commands:events.data.map((e:{event_json:unknown})=>e.event_json),
  finalStateHash:battle.data.state_hash,
 });
 if(canonicalJson(result.state)!==canonicalJson(battle.data.current_state_json))
  throw new Error('Integridade do estado oficial salvo diverge do replay.');
 const sources=v35OfficialSources(initial,result.state);
 return {initial,final:result.state,sources};
}
async function officialHouses(db:Db,ids:readonly string[]):Promise<V35HouseSnapshot[]>{
 const result=await db.from('noble_house_sheets').select('house_id,version,state')
  .in('house_id',ids);
 if(result.error||!Array.isArray(result.data)||result.data.length!==2)
  throw new Error('As duas fichas oficiais precisam estar acessíveis ao Narrador.');
 return result.data.map((r:{house_id:string;version:number;state:HouseState})=>({
  houseId:r.house_id,version:Number(r.version),state:r.state,
 }));
}
function assertSourcesSnapshot(sources:ReturnType<typeof v35OfficialSources>,
 houses:readonly V35HouseSnapshot[]){
 for(const source of sources){
  const house=houses.find(h=>h.houseId===source.houseId);
  if(!house||house.version!==source.sourceVersion||house.state.houseId!==source.houseId)
   throw new Error('Ficha oficial alterada desde a importação: prepare outro confronto.');
 }
}
function assertFrozen(caseData:V35CaseRow,houses:readonly V35HouseSnapshot[]){
 const a=houses.find(h=>h.houseId===caseData.house_a_id);
 const b=houses.find(h=>h.houseId===caseData.house_b_id);
 if(!a||!b||a.version!==caseData.expected_version_a||
  b.version!==caseData.expected_version_b||
  battleHash(a.state)!==caseData.source_hash_a||
  battleHash(b.state)!==caseData.source_hash_b)
  throw new Error('As fichas oficiais mudaram desde a criação do dossiê.');
 return {a,b};
}
async function validatedPlan(db:Db,c:V35CaseRow){
 const battle=await verifiedOfficialBattle(db,c.battle_session_id);
 if(battleHash(battle.final)!==c.battle_hash||
  canonicalJson(battle.sources)!==canonicalJson(c.sources_json))
  throw new Error('Dossiê e replay oficial não correspondem.');
 const outcome=v35ManualOutcome(battle.initial,battle.final,c.decisions_json);
 if(outcome.planHash!==c.plan_hash||outcome.policyVersion!==V35_POLICY_VERSION)
  throw new Error('Política de baixas ou decisões foram alteradas.');
 return {battle,outcome};
}
export const listV35Cases=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).handler(async({context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const result=await db.from('battle_v35_cases')
   .select('id,battle_session_id,house_a_id,house_b_id,status,review_version')
   .order('updated_at',{ascending:false}).limit(60);
  if(result.error)throw new Error('Dossiês indisponíveis.');
  await narrator(db);
  return (result.data??[]) as V35CaseList[];
 });
export const readV35Case=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(caseInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const c=await caseRow(db,data.caseId);
  await narrator(db);
  return c;
 });
export const stageV35Case=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(stageInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const {sources,final}=await verifiedOfficialBattle(db,data.battleSessionId);
  const ids=[...new Set(sources.map(s=>s.houseId))].sort();
  if(ids.length!==2)throw new Error('Duas casas oficiais são obrigatórias.');
  const houses=await officialHouses(db,ids);
  assertSourcesSnapshot(sources,houses);
  const a=houses.find(h=>h.houseId===ids[0])!,b=houses.find(h=>h.houseId===ids[1])!;
  await narrator(db);
  const service=await trusted();
  const result=await service.from('battle_v35_cases').insert({
   battle_session_id:data.battleSessionId,created_by:context.userId,
   house_a_id:a.houseId,house_b_id:b.houseId,
   expected_version_a:a.version,expected_version_b:b.version,
   source_hash_a:battleHash(a.state),source_hash_b:battleHash(b.state),
   battle_hash:battleHash(final),sources_json:sources,
   report_json:battleReport(final),status:'draft',review_version:0,
   decisions_json:[],
  }).select('id').single();
  if(result.error||!result.data?.id)
   throw new Error('Não foi possível abrir o dossiê (pode já existir).');
  return {caseId:String(result.data.id)};
 });
export const saveV35Plan=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(saveInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const c=await caseRow(db,data.caseId);
  if(c.status!=='draft')throw new Error('A decisão já foi homologada ou encerrada.');
  const battle=await verifiedOfficialBattle(db,c.battle_session_id);
  const outcome=v35ManualOutcome(battle.initial,battle.final,data.decisions);
  if(canonicalJson(outcome.sources)!==canonicalJson(c.sources_json)||
    outcome.battleHash!==c.battle_hash)
   throw new Error('Fontes originais divergentes.');
  await narrator(db);
  const service=await trusted();
  const result=await service.rpc('battle_v35_save_plan',{
   p_actor:context.userId,p_case:c.id,p_expected:data.expectedReviewVersion,
   p_decisions:outcome.decisions,p_hash:outcome.planHash,
  });
  if(result.error)throw new Error('CONFLICT: outra decisão foi registrada.');
  return {reviewVersion:Number(result.data),planHash:outcome.planHash};
 });
export const approveV35Plan=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(approveInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const c=await caseRow(db,data.caseId);
  if(c.status!=='draft'||c.review_version!==data.expectedReviewVersion||
    c.plan_hash!==data.planHash)
   throw new Error('Dossiê desatualizado, recarregue para aprovar.');
  const {battle}=await validatedPlan(db,c);
  const houses=await officialHouses(db,[c.house_a_id,c.house_b_id]);
  assertSourcesSnapshot(battle.sources,houses);
  assertFrozen(c,houses);
  await narrator(db);
  const service=await trusted();
  const result=await service.rpc('battle_v35_approve_plan',{
   p_actor:context.userId,p_case:c.id,p_expected:data.expectedReviewVersion,
   p_hash:data.planHash,
  });
  if(result.error||result.data!==true)throw new Error('Aprovação não foi confirmada.');
  return {approved:true as const};
 });
export const applyV35Plan=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(applyInput)
 .handler(async({data,context})=>{
  enabled();applyEnabled();
  const db=context.supabase as unknown as Db;await narrator(db);
  const c=await caseRow(db,data.caseId);
  if(c.status==='applied'){
   if(c.apply_id===data.operationId)return {duplicate:true as const,caseId:c.id};
   throw new Error('Dossiê já aplicado com outra chave de operação.');
  }
  if(c.status!=='approved'||!c.approved_by||!c.plan_hash)
   throw new Error('O Narrador precisa aprovar o dossiê antes de aplicar.');
  const {battle,outcome}=await validatedPlan(db,c);
  const before=await officialHouses(db,[c.house_a_id,c.house_b_id]);
  assertSourcesSnapshot(battle.sources,before);
  const {a,b}=assertFrozen(c,before);
  const next=v35ApplyManualLosses([a,b],outcome,c.id);
  const nextA=next.find(s=>s.houseId===c.house_a_id)!;
  const nextB=next.find(s=>s.houseId===c.house_b_id)!;
  await narrator(db);
  const service=await trusted();
  const result=await service.rpc('battle_v35_apply',{
   p_actor:context.userId,p_case:c.id,p_operation:data.operationId,
   p_plan_hash:outcome.planHash,p_before_a:a.state,p_before_b:b.state,
   p_after_a:nextA.state,p_after_b:nextB.state,
   p_version_a:a.version,p_version_b:b.version,
   p_new_hash_a:battleHash(nextA.state),p_new_hash_b:battleHash(nextB.state),
  });
  if(result.error)throw new Error('A aplicação atômica foi recusada. Nenhuma baixa parcial deve ser lançada.');
  return {duplicate:Boolean(result.data?.duplicate),caseId:c.id};
 });
