import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {parseReplayJson,battleHash,verifyReplay,canonicalJson} from './domain/replay';
import {battleCommandSchema,applyBattleCommand} from './domain/turns';
import {chooseAiCommand} from './domain/ai';
import {adaptOfficialUnit} from './adapters/unit-readonly';
import type {BattleState,BattleCommand} from './domain/types';
import type {HouseState} from '@/lib/house/types';

const uuid=z.string().uuid();
const saveInput=z.object({replayJson:z.string().min(20).max(1_500_000)}).strict();
const loadInput=z.object({sessionId:uuid}).strict();
const aiInput=loadInput.extend({expectedVersion:z.number().int().min(0).max(1199)}).strict();
const commandInput=loadInput.extend({commandId:uuid,expectedVersion:z.number().int().min(0).max(1199),
 command:battleCommandSchema}).strict();
type RpcResult={data:unknown;error:{message:string;code?:string}|null};
type Db={
 rpc:(name:string,args?:Record<string,unknown>)=>Promise<RpcResult>;
 from:(table:string)=>any;
};
function requirePersistenceEnabled(){
 if(process.env['ENABLE_BATTLE_PERSISTENCE']==='false')
  throw new Error('Persistência de batalha desativada pelo servidor.');
}
async function requireNarrator(db:Db):Promise<void>{
 const [role,active]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw new Error('Acesso ao módulo de batalhas salvas restrito ao Narrador.');
}
/** Confirma o armazenamento no servidor, sem expor segredos, antes da UI de salvamento.
 * Falha segura quando o projeto não possui a chave técnica, banco ou papel ativo.
 */
export const checkBattlePersistence=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  // O cliente técnico é criado SOMENTE no servidor e nunca devolvido ao navegador.
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  const [sessions,events]=await Promise.all([
   trusted.from('battle_sim_sessions').select('id').limit(0),
   trusted.from('battle_sim_events').select('seq').limit(0),
  ]);
  if(sessions.error||events.error)
   throw new Error('Armazenamento de batalhas indisponível neste ambiente.');
  await requireNarrator(db);
  return {available:true as const};
 });

/** Não aceitar HouseState do cliente; reconsultar a origem e recusar versões alteradas. */
async function verifySources(db:Db,initial:BattleState):Promise<void>{
 const authoritative=new Map<string,{state:HouseState;version:number}>();
 for(const copy of initial.stacks){
  if(copy.source.kind!=='house-readonly')continue;
  const houseId=copy.source.houseId,unitId=copy.source.unitId;
  if(!houseId||!unitId)throw new Error('Origem não identificada.');
  let house=authoritative.get(houseId);
  if(!house){
   const res=await db.from('noble_house_sheets').select('state,version').eq('house_id',houseId).maybeSingle();
   if(res.error||!res.data?.state)throw new Error('Fonte oficial não acessível.');
   house={state:res.data.state as HouseState,version:Number(res.data.version)};
   authoritative.set(houseId,house);
  }
  if(house.version!==copy.source.sourceVersion)
   throw new Error('A unidade oficial mudou; importe um novo snapshot autorizado.');
  const unit=house.state.units.find(u=>u.id===unitId);
  if(!unit)throw new Error('Unidade original não encontrada.');
  const computed=adaptOfficialUnit(house.state,unit,{
   houseId,unitId,side:copy.side,position:copy.position,primaryTypeId:copy.primaryTypeId,
   sourceVersion:house.version,capturedAt:copy.source.sourceCapturedAt??'',
   ...(copy.profileDecisionReason?{profileDecisionReason:copy.profileDecisionReason}:{})
  });
  const {id:_a,...expected}=computed,{id:_b,...actual}=copy;
  if(canonicalJson(expected)!==canonicalJson(actual))
   throw new Error('Snapshot de unidade diverge da fonte oficial.');
 }
}
/** Os tipos do banco ainda não estão no cliente gerado: acesso tipado mínimo sem alterar tabelas existentes. */
export const listSavedBattles=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;await requireNarrator(db);
  const rows=await db.from('battle_sim_sessions')
   .select('id,name,status,state_version,updated_at,rules_version')
   .order('updated_at',{ascending:false}).limit(60);
  if(rows.error)throw new Error('Não foi possível carregar batalhas salvas.');
  await requireNarrator(db);
  return (rows.data??[]) as {id:string;name:string;status:string;state_version:number;updated_at:string;rules_version:string}[];
 });
export const readSavedBattle=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(loadInput)
 .handler(async({data,context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;await requireNarrator(db);
  const [session,entries]=await Promise.all([
   db.from('battle_sim_sessions').select('*').eq('id',data.sessionId).maybeSingle(),
   db.from('battle_sim_events').select('event_json').eq('session_id',data.sessionId)
    .order('seq',{ascending:true}).limit(1200),
  ]);
  if(session.error||entries.error||!session.data)throw new Error('Batalha indisponível.');
  const initial=session.data.initial_state_json as BattleState;
  const raw={format:'CCA-BATTLE-REPLAY-1',rulesVersion:'PTE-2.0',schemaVersion:2,
   initial,initialStateHash:session.data.initial_state_hash,
   commands:(entries.data??[]).map((v:{event_json:unknown})=>v.event_json),
   finalStateHash:session.data.state_hash};
  const verified=verifyReplay(raw);
  if(battleHash(verified.state)!==session.data.state_hash||
    canonicalJson(verified.state)!==canonicalJson(session.data.current_state_json))
   throw new Error('Integridade não confirmada: sessão salva divergente.');
  await requireNarrator(db);
  return {replayJson:JSON.stringify(raw),stateVersion:Number(session.data.state_version)};
 });
export const saveBattleReplay=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(saveInput)
 .handler(async({data,context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;await requireNarrator(db);
  const checked=parseReplayJson(data.replayJson);
  if(!['active','completed','archived'].includes(checked.state.phase))
   throw new Error('Sessão ainda não iniciada.');
  await verifySources(db,checked.file.initial);
  // Segunda checagem após acesso a fichas, antes de usar a chave secreta de servidor.
  await requireNarrator(db);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  const result=await trusted.rpc('battle_sim_commit_replay',{
   p_actor:context.userId,p_name:checked.file.initial.name,
   p_initial:checked.file.initial,p_current:checked.state,
   p_initial_hash:checked.file.initialStateHash,p_current_hash:checked.file.finalStateHash,
   p_receipts:checked.file.commands,
  });
  if(result.error||typeof result.data!=='string')
   throw new Error('Falha ao salvar batalha em armazenamento homologado.');
  return {sessionId:result.data,stateVersion:checked.file.commands.length};
 });
/** Uma ação por chamada; servidor reexecuta reducer e transação faz CAS/idempotência. */
export const applySavedBattleCommand=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(commandInput)
 .handler(async({data,context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;await requireNarrator(db);
  const old=await db.from('battle_sim_sessions').select('current_state_json,state_hash,state_version')
   .eq('id',data.sessionId).maybeSingle();
  if(old.error||!old.data)throw new Error('Batalha salva não encontrada.');
  const duplicate=await db.from('battle_sim_events').select('command_json,event_json')
   .eq('session_id',data.sessionId).eq('command_id',data.commandId).maybeSingle();
  if(duplicate.error)throw new Error('Não foi possível conferir comando anterior.');
  if(duplicate.data){
   if(canonicalJson(duplicate.data.command_json)!==canonicalJson(data.command))
    throw new Error('commandId reutilizado com payload diferente.');
   await requireNarrator(db);
   return {duplicate:true,receipt:duplicate.data.event_json,stateVersion:Number(old.data.state_version)};
  }
  if(Number(old.data.state_version)!==data.expectedVersion)
   throw new Error('CONFLICT: a sessão foi atualizada. Recarregue o último estado.');
  const state=old.data.current_state_json as BattleState;
  if(battleHash(state)!==old.data.state_hash)throw new Error('Integridade não confirmada.');
  const unit=state.stacks.find(s=>s.id===state.activeUnitId);
  if(data.command.type!=='MANUAL_FINISH'&&(!unit||state.controls[unit.side]==='ai'))
   throw new Error('Comandos da IA não podem ser falsificados pelo navegador.');
  const next=applyBattleCommand(state,data.command as BattleCommand,'narrator');
  const receipt={actionSeq:data.expectedVersion+1,commandId:'cmd-'+(data.expectedVersion+1),
   command:data.command,actor:'narrator' as const,
   prevHash:old.data.state_hash,stateHash:battleHash(next)};
  await requireNarrator(db);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  const result=await trusted.rpc('battle_sim_commit_step',{
   p_actor:context.userId,p_session:data.sessionId,p_expected:data.expectedVersion,
   p_command_id:data.commandId,p_command:data.command,p_receipt:receipt,
   p_current:next,p_prev_hash:old.data.state_hash,p_state_hash:receipt.stateHash,
  });
  if(result.error)throw new Error(result.error.message.includes('CONFLICT')?
   'CONFLICT: estado mudou; recarregue.':'Comando persistido não confirmado.');
  return {duplicate:false,receipt,stateVersion:receipt.actionSeq};
 });


/** Próxima fase: a IA avança SOMENTE no servidor sobre uma sessão já salva.
 * Cada passo usa o mesmo CAS atômico e o mesmo hash do histórico. A versão
 * esperada garante que duas abas não avancem a mesma sessão silenciosamente.
 * Faz no máximo 16 ações por chamada para limitar tempo de resposta/abuso.
 */
export const advanceSavedBattleAi=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(aiInput)
 .handler(async({data,context})=>{
  requirePersistenceEnabled();
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  const loaded=await db.from('battle_sim_sessions')
   .select('current_state_json,state_hash,state_version')
   .eq('id',data.sessionId).maybeSingle();
  if(loaded.error||!loaded.data)throw new Error('Batalha salva não encontrada.');
  let version=Number(loaded.data.state_version);
  if(version!==data.expectedVersion)
   throw new Error('CONFLICT: outra aba alterou a sessão. Recarregue o estado.');
  let state=loaded.data.current_state_json as BattleState;
  if(battleHash(state)!==loaded.data.state_hash)
   throw new Error('Integridade não confirmada no estado persistido.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  let previousHash=loaded.data.state_hash as string,applied=0;
  for(let i=0;i<16;i++){
   if(state.phase!=='active'||!state.activeUnitId)break;
   const unit=state.stacks.find(stack=>stack.id===state.activeUnitId);
   if(!unit||state.controls[unit.side]!=='ai')break;
   if(version>=1200)throw new Error('Limite de comandos do replay alcançado.');
   const command=chooseAiCommand(state);
   const next=applyBattleCommand(state,command,'ai');
   const nextHash=battleHash(next),nextVersion=version+1;
   const receipt={
    actionSeq:nextVersion,commandId:'cmd-'+nextVersion,
    command,actor:'ai' as const,prevHash:previousHash,stateHash:nextHash,
   };
   // Confere role/campanha em cada comando; a RPC também confere user_roles.
   await requireNarrator(db);
   const result=await trusted.rpc('battle_sim_commit_step',{
    p_actor:context.userId,p_session:data.sessionId,p_expected:version,
    p_command_id:crypto.randomUUID(),p_command:command,p_receipt:receipt,
    p_current:next,p_prev_hash:previousHash,p_state_hash:nextHash,
   });
   if(result.error){
    if(result.error.message.includes('CONFLICT'))
     throw new Error('CONFLICT: outra aba alterou a sessão. Recarregue o estado.');
    throw new Error('Avanço da IA não pôde ser confirmado.');
   }
   version=nextVersion;state=next;previousHash=nextHash;applied++;
  }
  await requireNarrator(db);
  return {applied,stateVersion:version,phase:state.phase};
 });
