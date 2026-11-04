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
 const portraits=parsed.data.portraits.map(p=>({
  ...p,imageUrl:resolveSpyPortraitImageUrl(p.id,p.imageUrl),
 }));
 return {...parsed.data,portraits,availableWealth};
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
