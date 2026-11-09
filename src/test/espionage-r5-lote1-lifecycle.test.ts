import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {temporalQueryKeysForInvalidation}
 from '@/lib/calendar/time-connections';

vi.mock('@tanstack/react-start',()=>({
 createServerFn:()=>{
  const f={middleware:()=>f,inputValidator:()=>f,handler:(handler:unknown)=>handler};
  return f;
 },
}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:null},error:null})},
}}));
import {createSpyAgent,resolveSpyAgentMission}
 from '@/lib/espionage/spy-agent-actions.functions';

const agent='11111111-1111-4111-8111-111111111111';
const operation='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
type Outcome='mission_success'|'mission_failure'|'escaped'|'captured'|'dead';
type Status='complete'|'waiting_catalog'|'missing_award'|'no_success_award';

function server(opts:{
 role?:boolean;receiptUpgrades?:string[];receiptPortrait?:string|null;
 operationOutcome?:Outcome|null;alreadyApplied?:boolean;
 intelligence?:Status;finalizeStatus?:'complete'|'waiting_catalog';rpcError?:string;
}={}){
 const calls:string[]=[];
 const db={
  active:true,
  async rpc(this:{active?:boolean},name:string){
   if(this?.active!==true)throw new Error('RPC fora do cliente');
   calls.push(name);
   if(name==='is_campaign_admin')return {data:opts.role!==false,error:null};
   if(name==='spy_create_agent')return {data:{
    id:agent,codename:'Agente R5',rank:'Verde',cunning:3,status:'available',
    missionSuccesses:0,version:1,
    portraitId:opts.receiptPortrait===undefined?'portrait-r5':opts.receiptPortrait,
    upgrades:opts.receiptUpgrades??['forged_documents'],alreadyApplied:false,
   },error:null};
   if(name==='spy_resolve_agent_mission'){
    if(opts.rpcError)return {data:null,error:{message:opts.rpcError}};
    const outcome=opts.operationOutcome===undefined?'mission_success':opts.operationOutcome;
    return {data:{
     operationId:operation,agentId:agent,alreadyApplied:opts.alreadyApplied??false,
     ...(outcome?{outcome}:{}),
     status:outcome==='dead'?'dead':outcome==='captured'?'captured':'available',
     rank:'Verde',cunning:3,missionSuccesses:outcome==='mission_success'?1:0,
    },error:null};
   }
   if(name==='spy_intelligence_operation_status')
    return {data:{status:opts.intelligence??'complete'},error:null};
   if(name==='spy_intelligence_admin_pending')
    return {data:[{
     operationId:operation,objective:'army',ownerHouseId:'source',
     targetHouseId:'target',dateKey:'1522-01-11',capacity:3,
    }],error:null};
   if(name==='spy_intelligence_finalize')
    return {data:{status:opts.finalizeStatus??'complete',revealed:3,refreshed:0},error:null};
   return {data:null,error:{message:'unexpected '+name}};
  },
 };
 return {db,calls};
}
const createInput={
 data:{houseId:'source',sourceHoldingId:'net-r5',
  codename:'Agente R5',portraitId:'portrait-r5',
  upgrades:['forged_documents'],requestKey:key},
};
const resolveInput={
 data:{operationId:operation,roll:12,modifier:0,discovered:false,
 guardOverride:null,prisonOverride:null,expectedAgentVersion:1,
 requestKey:key,reason:'Lote 1'},
};
async function createWith(db:ReturnType<typeof server>['db']){
 const input={...createInput,context:{supabase:db}};
 return (createSpyAgent as unknown as
  (arg:typeof input)=>Promise<{id:string;portraitId:string|null}>)(input);
}
async function resolveWith(db:ReturnType<typeof server>['db']){
 const input={...resolveInput,context:{supabase:db}};
 return (resolveSpyAgentMission as unknown as
  (arg:typeof input)=>Promise<{alreadyApplied:boolean;outcome?:string;
   status:string;intelligenceStatus:string}>)(input);
}
describe('R5 Lote 1: função real, contrato de banco e ciclo de premiação',()=>{
 it('confirma criação com retrato e melhorias correspondentes',async()=>{
  const {db,calls}=server();
  const res=await createWith(db);
  expect(res.id).toBe(agent);
  expect(res.portraitId).toBe('portrait-r5');
  expect(calls).toEqual(['spy_create_agent']);
 });
 it('rejeita retorno com outra melhoria da mesma quantidade',async()=>{
  await expect(createWith(server({
   receiptUpgrades:['ace_in_the_hole'],
  }).db)).rejects.toThrow('Criação de espião não confirmada');
 });
 it('rejeita retorno com outro retrato',async()=>{
  await expect(createWith(server({
   receiptPortrait:'portrait-different',
  }).db)).rejects.toThrow('Criação de espião não confirmada');
 });
 it('sucesso com prêmio completo confirma status persistido',async()=>{
  const {db,calls}=server();
  const result=await resolveWith(db);
  expect(result.outcome).toBe('mission_success');
  expect(result.intelligenceStatus).toBe('complete');
  expect(calls).toEqual([
   'is_campaign_admin','spy_resolve_agent_mission',
   'is_campaign_admin','spy_intelligence_operation_status',
  ]);
 });
 it('retry da mesma decisão não cria segunda decisão nem inventa resultado',async()=>{
  const {db,calls}=server({alreadyApplied:true,operationOutcome:null});
  const result=await resolveWith(db);
  expect(result.alreadyApplied).toBe(true);
  expect(result.outcome).toBeUndefined();
  expect(result.intelligenceStatus).toBe('complete');
  expect(calls.filter(x=>x==='spy_resolve_agent_mission')).toHaveLength(1);
 });
 it('se o prêmio ainda aguarda catálogo, não anuncia dossiê concluído',async()=>{
  const result=await resolveWith(server({
   intelligence:'waiting_catalog',finalizeStatus:'waiting_catalog',
  }).db);
  expect(result.intelligenceStatus).toBe('waiting_catalog');
 });
 it('ausência anormal de prêmio fica como retry_required, não como sucesso total',async()=>{
  const result=await resolveWith(server({intelligence:'missing_award'}).db);
  expect(result.outcome).toBe('mission_success');
  expect(result.intelligenceStatus).toBe('retry_required');
 });
 for(const outcome of ['mission_failure','escaped','captured','dead'] as const){
  it(outcome+' não gera prêmio nem outro crédito de experiência',async()=>{
   const {db,calls}=server({operationOutcome:outcome});
   const result=await resolveWith(db);
   expect(result.outcome).toBe(outcome);
   expect(result.intelligenceStatus).toBe('no_success_award');
   expect(calls).toEqual(['is_campaign_admin','spy_resolve_agent_mission']);
  });
 }
 it('RPC de resolução falha explicitamente sem maquiar confirmação',async()=>{
  await expect(resolveWith(server({
   rpcError:'missão ainda não chegou',
  }).db)).rejects.toThrow('Resolução não aplicada');
 });
 it('somente Narrador pode julgar e servidor não chama mutação sem autorização',async()=>{
  const {db,calls}=server({role:false});
  await expect(resolveWith(db)).rejects.toThrow('Somente o Narrador');
  expect(calls).toEqual(['is_campaign_admin']);
 });
 it('publicação oficial do HUB invalida painel, plano, operação, dossiê e previsão',()=>{
  const keys=temporalQueryKeysForInvalidation().map(k=>k[0]);
  for(const keyName of ['spy-house-management','espionage-regional-strategy',
   'spy-narrator-operations','spy-dossiers','spy-mission-odds']){
   expect(keys).toContain(keyName);
   expect(keys.filter(k=>k===keyName)).toHaveLength(1);
  }
 });
 it('teste SQL exige rollback e recusa ambiente de produção/com usuários',()=>{
  const sql=readFileSync('scripts/espionage-r5-lot1-rollback-acceptance.sql','utf8');
  expect(sql).toMatch(/^--/);
  expect(sql).toContain('BEGIN;');
  expect(sql).toContain("RAISE EXCEPTION 'R5: ambiente não isolado");
  expect(sql).toContain("IF EXISTS(SELECT 1 FROM public.campaign_calendar)");
  expect(sql).toContain("OR EXISTS(SELECT 1 FROM auth.users)");
  expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
  expect(sql).not.toMatch(/\bCOMMIT\s*;/i);
  for(const objective of ['house_resources','army','possessions']){
   expect(sql).toContain("'"+objective+"'");
  }
  expect(sql).toContain('spy_intelligence_finalize');
  expect(sql).toContain('spy_resolve_agent_mission');
  expect(sql).toContain("event_type='promoted'");
  expect(sql).toContain('mission_failure');
 });
 it('narrador bloqueia alterações enquanto resolve e distingue repetição',()=>{
  const src=readFileSync('src/components/house/espionage/spy-narrator-resolution.tsx','utf8');
  expect(src).toContain('disabled={busy||Boolean(outcome)}');
  expect(src).toContain('response.alreadyApplied&&!response.outcome');
  expect(src).toContain('nenhuma nova rolagem foi realizada');
 });
});
