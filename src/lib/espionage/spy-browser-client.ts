import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';
import {balances} from '@/lib/house/engine';
import type {HouseState} from '@/lib/house/types';
import {spyManagementSchema,type SpyManagement} from './spy-management.functions';
import {resolveSpyPortraitImageUrl} from './spy-portrait-manifest';
import {spyRecruitmentOptionsSchema,type SpyRecruitmentOptions} from './spy-recruitment.functions';
import {spyRegionalStrategySchema} from './region-turns';
import type {SpyAgentUpgrade} from './spy-agent-progression';

type RpcResponse={data:unknown;error:{message:string;code?:string}|null};
type BrowserRpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResponse>;
const db=supabase as unknown as {rpc:BrowserRpc};

/** The browser already owns the active Supabase session. Using the
 * authenticated Supabase client directly avoids depending on a secondary
 * TanStack server-function bearer-header transport.
 *
 * The RPCs are SECURITY DEFINER but verify auth.uid(), active membership and
 * House ownership in PostgreSQL; this function NEVER bypasses those checks.
 */
async function houseRpc(name:string,houseId:string,extra:Record<string,unknown>={}){
 const {data:{session},error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!session?.access_token)throw new Error('Sessão expirada. Entre novamente no Cormyr.');
 const result=await db.rpc(name,{p_house:houseId,...extra});
 if(result.error){
  if(/permission|unauthoriz|não autorizad|nao autorizad|jwt|auth/i.test(result.error.message))
   throw new Error('Você não tem autorização para os espiões desta Casa.');
  throw new Error('O cadastro de espionagem não respondeu. Tente atualizar a página.');
 }
 return result.data;
}

const spyMissionTimelineSchema=z.array(z.object({
 operationId:z.string().uuid(),agentId:z.string().uuid(),
 operationVersion:z.number().int().positive(),
 departureKey:z.string().min(1),arrivalKey:z.string().min(1),
 investigationEndKey:z.string().min(1),
 originRegion:z.string().min(1),destinationRegion:z.string().min(1),
 travelDays:z.number().int().nonnegative(),targetHouseName:z.string().nullable(),
}).strict()).max(5000);

export async function readSpyHouseManagementBrowser(houseId:string):Promise<SpyManagement>{
 const result=await houseRpc('spy_house_management',houseId);
 const parsed=spyManagementSchema.safeParse(result);
 if(!parsed.success||parsed.data.houseId!==houseId)
  throw new Error('Resposta do cadastro de agentes inconsistente.');
 // Resource estimate is optional UI data and never grants purchase authority.
 // PostgreSQL checks actual Wealth atomically during purchase.
 let availableWealth:number|null=null;
 try{
  const sheet=await supabase.from('noble_house_sheets')
   .select('state').eq('house_id',houseId).maybeSingle();
  if(!sheet.error&&sheet.data?.state){
   const total=balances(sheet.data.state as unknown as HouseState).available.wealth;
   if(Number.isSafeInteger(total))availableWealth=total;
  }
 }catch{/* The roster is valid even if an auxiliary balance read fails. */}
 // This UI reads PostgreSQL directly; map official catalog IDs to local
 // assets even before the idempotent SQL URL reconciliation is executed.
 // Assignments and per-house availability stay as supplied by the RPC.
 const timelines=spyMissionTimelineSchema.safeParse(
  await houseRpc('spy_house_mission_timeline',houseId));
 if(!timelines.success)throw new Error('Cronograma de missões inconsistente.');
 const byOperation=new Map(timelines.data.map(t=>[t.operationId,t]));
 const operations=parsed.data.operations.map(op=>{
  const t=byOperation.get(op.id);
  return t?{
   ...op,travelDays:t.travelDays,arrivalKey:t.arrivalKey,
   departureKey:t.departureKey,investigationEndKey:t.investigationEndKey,
   originRegion:t.originRegion,destinationRegion:t.destinationRegion,
   targetHouseName:t.targetHouseName,version:t.operationVersion,
  }:op;
 });
 const portraits=parsed.data.portraits.map(p=>({
  ...p,imageUrl:resolveSpyPortraitImageUrl(p.id,p.imageUrl),
 }));
 return {...parsed.data,operations,portraits,availableWealth};
}

export async function readSpyRecruitmentOptionsBrowser(houseId:string):Promise<SpyRecruitmentOptions>{
 const data=await houseRpc('spy_recruitment_options',houseId);
 const parsed=spyRecruitmentOptionsSchema.safeParse(data);
 if(!parsed.success||parsed.data.houseId!==houseId)
  throw new Error('A lista de vagas não pôde ser validada.');
 return parsed.data;
}

const creationSchema=z.object({
 id:z.string().uuid(),codename:z.string().trim().min(2).max(80),
 rank:z.literal('Verde'),cunning:z.literal(3),status:z.literal('available'),
 missionSuccesses:z.literal(0),portraitId:z.string().nullable(),
 version:z.number().int().positive(),
 upgrades:z.array(z.enum(['forged_documents','ace_in_the_hole'])).max(2),
 alreadyApplied:z.boolean(),
}).strict();

export async function createSpyAgentBrowser(input:{
 houseId:string;sourceHoldingId:string;codename:string;portraitId:string|null;
 upgrades:SpyAgentUpgrade[];requestKey:string;
}){
 const data=await houseRpc('spy_create_agent',input.houseId,{
  p_source_holding:input.sourceHoldingId,p_codename:input.codename,
  p_portrait:input.portraitId,p_upgrades:input.upgrades,p_request_key:input.requestKey,
 });
 const parsed=creationSchema.safeParse(data);
 if(!parsed.success||parsed.data.codename!==input.codename||
   parsed.data.upgrades.length!==input.upgrades.length)
  throw new Error('O banco não confirmou a criação do espião.');
 return parsed.data;
}

export async function readSpyRegionalStrategyBrowser(houseId:string){
 const data=await houseRpc('spy_get_regional_strategy',houseId);
 const parsed=spyRegionalStrategySchema.safeParse(data);
 if(!parsed.success||parsed.data.houseId!==houseId)
  throw new Error('As posições dos agentes não puderam ser validadas.');
 return parsed.data;
}

const spyRemovalSchema=z.object({
 agentId:z.string().uuid(),
 refundedWealth:z.number().int().min(0).max(2),
 freedSlot:z.literal(true),
 portraitReleased:z.boolean(),
 alreadyApplied:z.boolean(),
 houseVersion:z.number().int().nonnegative(),
}).strict();

/** Secure PostgreSQL transaction. Archives the agent, frees its slot and
 * portrait and refunds only equipment costs actually recorded on the House. */
export async function removeSpyAgentBrowser(input:{
 houseId:string;agentId:string;expectedAgentVersion:number;
 expectedHouseVersion:number;requestKey:string;
}){
 const data=await houseRpc('spy_remove_agent',input.houseId,{
  p_agent:input.agentId,p_expected_agent_version:input.expectedAgentVersion,
  p_expected_house_version:input.expectedHouseVersion,
  p_request_key:input.requestKey,
 });
 const parsed=spyRemovalSchema.safeParse(data);
 if(!parsed.success||parsed.data.agentId!==input.agentId)
  throw new Error('Baixa do agente não confirmada pelo banco.');
 return parsed.data;
}

const submittedMissionSchema=z.object({
 operationId:z.string().uuid(),agentId:z.string().uuid(),
 targetHouseId:z.string().min(1),status:z.enum(['traveling','operating','pending_narrator_review']),
 alreadyApplied:z.boolean(),calendarVersion:z.number().int().positive(),
 departureKey:z.string().min(1),arrivalKey:z.string().min(1),
 investigationEndsKey:z.string().min(1),
 travelDays:z.number().int().nonnegative(),
}).strict();

/** Starts the operation immediately on the official Harptos date.
 * PostgreSQL computes its own canonical route and arrival deadline.
 * The Narrator only adjudicates mission results, not travel authorization.
 */
export async function submitSpyHouseMissionBrowser(input:{
 houseId:string;agentId:string;targetHouseId:string;
 destinationRegion:string;expectedAgentVersion:number;
 expectedCalendarVersion:number;requestKey:string;
}){
 const data=await houseRpc('spy_submit_house_mission',input.houseId,{
  p_agent:input.agentId,p_target:input.targetHouseId,
  p_destination:input.destinationRegion,
  p_expected_agent_version:input.expectedAgentVersion,
  p_expected_calendar_version:input.expectedCalendarVersion,
  p_request_key:input.requestKey,
 });
 const parsed=submittedMissionSchema.safeParse(data);
 if(!parsed.success||parsed.data.agentId!==input.agentId||
  parsed.data.targetHouseId!==input.targetHouseId)
  throw new Error('A ordem não foi confirmada pelo servidor.');
 return parsed.data;
}

const cancelledMissionSchema=z.object({
 operationId:z.string().uuid(),agentId:z.string().uuid(),
 status:z.literal('cancelled'),alreadyApplied:z.boolean(),
}).strict();

/** Atomic, idempotent cancellation preserving the registered timeline,
 * operation audit trail and the spy's last confirmed location.
 */
export async function cancelSpyMissionBrowser(input:{
 houseId:string;operationId:string;expectedVersion:number;requestKey:string;
}){
 const data=await houseRpc('spy_cancel_house_mission',input.houseId,{
  p_operation:input.operationId,p_expected_version:input.expectedVersion,
  p_request_key:input.requestKey,
 });
 const parsed=cancelledMissionSchema.safeParse(data);
 if(!parsed.success||parsed.data.operationId!==input.operationId)
  throw new Error('O cancelamento não foi confirmado pelo servidor.');
 return parsed.data;
}
