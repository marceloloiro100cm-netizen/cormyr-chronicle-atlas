import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {battleHash,canonicalJson} from '../domain/replay';
import type {Side} from '../domain/types';
import type {V3Game,V3ScenarioOptions} from './engine';
import type {CommanderId} from './commanders';
import {v34NewGame,v34Act,v34Replay,v34ActionSchema,
 type V34Action,type V34Receipt,V34_MAX_COMMANDS} from './synced';

type Db={rpc:(name:string,args?:Record<string,unknown>)=>
 Promise<{data:any;error:{message:string;code?:string}|null}>;from:(table:string)=>any};
const uuid=z.string().uuid(),houseId=z.string().min(1).max(100);
const createInput=z.object({invitationId:uuid,defenderHouseId:houseId}).strict();
const sessionInput=z.object({sessionId:uuid}).strict();
const joinInput=sessionInput.extend({side:z.enum(['attacker','defender'])}).strict();
const stepInput=sessionInput.extend({
 commandId:uuid,expectedVersion:z.number().int().min(0).max(599),
 expectedHash:z.string().regex(/^[0-9a-f]{64}$/),action:v34ActionSchema,
}).strict();
function enabled(){
 if(process.env['ENABLE_BATTLE_V34_SYNC']!=='true')
  throw new Error('Sessões V3.4 indisponíveis até migração e homologação.');
}
async function access(db:Db){
 const result=await db.rpc('campaign_access_active');
 if(result.error||result.data!==true)throw new Error('Acesso à campanha não está ativo.');
}
async function narrator(db:Db){
 const [role,active]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||role.data!==true||active.error||active.data!==true)
  throw new Error('Esta operação é exclusiva do Narrador.');
}
async function member(db:Db,house:string){
 const result=await db.rpc('battle_v34_can_control',{p_house:house});
 if(result.error||result.data!==true)
  throw new Error('Você não participa desta casa nesta temporada.');
}
async function trusted():Promise<Db>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 return supabaseAdmin as unknown as Db;
}
type SessionRow={
 id:string;title:string;invitation_id:string;attacker_house_id:string;defender_house_id:string;
 attacker_user_id:string|null;defender_user_id:string|null;
 status:'waiting'|'active'|'completed'|'closed';state_version:number;
 config_json:V3ScenarioOptions;initial_game_json:V3Game;
 current_game_json:V3Game;initial_hash:string;current_hash:string;
};
export type V34SessionListItem=Readonly<Pick<SessionRow,
 'id'|'title'|'attacker_house_id'|'defender_house_id'|'attacker_user_id'|
 'defender_user_id'|'status'|'state_version'>>;
export type V34SessionView=Readonly<{
 session:V34SessionListItem;game:V3Game;initialGame:V3Game;
 receipts:readonly V34Receipt[];hash:string;version:number;
 mySide:Side|null;invitationOpen:boolean;
}>;
async function getSession(db:Db,id:string):Promise<SessionRow>{
 const found=await db.from('battle_v34_sessions').select('*').eq('id',id).maybeSingle();
 if(found.error||!found.data)throw new Error('Partida não encontrada ou acesso revogado.');
 return found.data as SessionRow;
}
async function replayChecked(db:Db,session:SessionRow):Promise<{
 game:V3Game;receipts:V34Receipt[];
}>{
 const rows=await db.from('battle_v34_receipts')
  .select('seq,side,actor_id,command_id,action_json,prev_hash,state_hash')
  .eq('session_id',session.id).order('seq',{ascending:true}).limit(V34_MAX_COMMANDS+1);
 if(rows.error||!Array.isArray(rows.data))throw new Error('Registro da partida indisponível.');
 const original=v34NewGame(session.config_json);
 if(battleHash(original)!==session.initial_hash||
   canonicalJson(original)!==canonicalJson(session.initial_game_json))
  throw new Error('Integridade do cenário inicial não confirmada.');
 const receipts:V34Receipt[]=rows.data.map((row:any)=>({
  seq:Number(row.seq),side:row.side as Side,actorId:String(row.actor_id),
  commandId:String(row.command_id),action:row.action_json as V34Action,
  prevHash:String(row.prev_hash),stateHash:String(row.state_hash),
 }));
 const actual=v34Replay(original,receipts,session.current_hash);
 if(receipts.length!==session.state_version||
  battleHash(actual)!==session.current_hash||
  canonicalJson(actual)!==canonicalJson(session.current_game_json))
  throw new Error('Sessão sincronizada divergente do replay verificável.');
 return {game:actual,receipts};
}
async function invitationIsOpen(db:Db,id:string):Promise<boolean>{
 const invite=await db.from('battle_v3_invitations').select('status').eq('id',id).maybeSingle();
 return !invite.error&&invite.data?.status==='open';
}
export const listV34Sessions=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  enabled();const db=context.supabase as unknown as Db;
  await access(db);
  const rows=await db.from('battle_v34_sessions')
   .select('id,title,attacker_house_id,defender_house_id,attacker_user_id,defender_user_id,status,state_version')
   .order('updated_at',{ascending:false}).limit(40);
  if(rows.error)throw new Error('Lista de partidas sincronizadas indisponível.');
  await access(db);
  return (rows.data??[]) as V34SessionListItem[];
 });
/** Narrador cria uma sessão de duas CASAS distintas a partir de uma convocação aberta. */
export const createV34Session=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(createInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const [inv,house]=await Promise.all([
   db.from('battle_v3_invitations').select('*')
    .eq('id',data.invitationId).eq('status','open').maybeSingle(),
   db.from('campaign_houses').select('id').eq('id',data.defenderHouseId)
    .eq('active',true).eq('season',2).maybeSingle(),
  ]);
  if(inv.error||!inv.data||house.error||!house.data?.id)
   throw new Error('Convocação ou casa adversária não está ativa.');
  if(inv.data.target_house_id===data.defenderHouseId)
   throw new Error('Selecione duas casas de jogadores diferentes.');
  const config:V3ScenarioOptions={
   attackerHouseId:inv.data.attacker_model_id,defenderHouseId:inv.data.defender_model_id,
   attackerCommander:inv.data.attacker_commander as CommanderId,
   defenderCommander:inv.data.defender_commander as CommanderId,
   scenario:inv.data.scenario,opponent:'human',
  };
  const game=v34NewGame(config),hash=battleHash(game);
  await narrator(db);
  const service=await trusted();
  const result=await service.from('battle_v34_sessions').insert({
   invitation_id:data.invitationId,title:inv.data.title,
   attacker_house_id:inv.data.target_house_id,defender_house_id:data.defenderHouseId,
   created_by:context.userId,config_json:config,initial_game_json:game,
   current_game_json:game,initial_hash:hash,current_hash:hash,
   status:'waiting',state_version:0,
  }).select('id').single();
  if(result.error||!result.data?.id)
   throw new Error('Falha ao criar partida (uma sessão por convocação).');
  return {sessionId:String(result.data.id)};
 });
export const readV34Session=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(sessionInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await access(db);
  const session=await getSession(db,data.sessionId);
  const checked=await replayChecked(db,session);
  await access(db);
  const userId=context.userId;
  const mySide=session.attacker_user_id===userId?'attacker':
   session.defender_user_id===userId?'defender':null;
  if(mySide)await member(db,mySide==='attacker'?session.attacker_house_id:session.defender_house_id);
  const service=await trusted();
  const invitationOpen=await invitationIsOpen(service,session.invitation_id);
  return {session:{
   id:session.id,title:session.title,attacker_house_id:session.attacker_house_id,
   defender_house_id:session.defender_house_id,attacker_user_id:session.attacker_user_id,
   defender_user_id:session.defender_user_id,status:session.status,
   state_version:session.state_version,
  },game:checked.game,initialGame:session.initial_game_json,receipts:checked.receipts,
    hash:session.current_hash,version:session.state_version,
    mySide,invitationOpen} as V34SessionView;
 });
export const joinV34Session=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(joinInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await access(db);
  const session=await getSession(db,data.sessionId);
  const house=data.side==='attacker'?session.attacker_house_id:session.defender_house_id;
  await member(db,house);
  const service=await trusted();
  if(!await invitationIsOpen(service,session.invitation_id))
   throw new Error('Convocação encerrada.');
  await member(db,house);
  const result=await service.rpc('battle_v34_join_seat',{
   p_session:data.sessionId,p_actor:context.userId,p_side:data.side,
  });
  if(result.error)throw new Error('Não foi possível ocupar esse lado (pode estar ocupado).');
  return {joined:true as const,side:data.side};
 });
export const playV34Step=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(stepInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await access(db);
  const session=await getSession(db,data.sessionId);
  const side:Side|null=session.attacker_user_id===context.userId?'attacker':
   session.defender_user_id===context.userId?'defender':null;
  if(!side)throw new Error('Somente o ocupante da cadeira pode dar ordens.');
  const house=side==='attacker'?session.attacker_house_id:session.defender_house_id;
  await member(db,house);
  const service=await trusted();
  if(!await invitationIsOpen(service,session.invitation_id))
   throw new Error('A convocação foi encerrada.');
  const checked=await replayChecked(db,session);
  const existing=checked.receipts.find(x=>x.commandId===data.commandId);
  if(existing){
   if(existing.actorId!==context.userId||existing.side!==side||
    canonicalJson(existing.action)!==canonicalJson(data.action))
    throw new Error('Identificador de comando reutilizado de forma incompatível.');
   return {duplicate:true,version:session.state_version,hash:session.current_hash};
  }
  if(session.status!=='active'||session.state_version!==data.expectedVersion||
   session.current_hash!==data.expectedHash||session.state_version>=V34_MAX_COMMANDS)
   throw new Error('CONFLICT: turno alterado. Atualize a partida.');
  const updated=v34Act(checked.game,side,data.action),nextHash=battleHash(updated);
  await member(db,house);await access(db);
  const result=await service.rpc('battle_v34_commit_step',{
   p_session:session.id,p_actor:context.userId,p_side:side,
   p_expected:data.expectedVersion,p_command_id:data.commandId,
   p_action:data.action,p_next:updated,p_prev_hash:session.current_hash,p_next_hash:nextHash,
  });
  if(result.error)throw new Error('CONFLICT: ordem não registrada; recarregue a partida.');
  return {duplicate:Boolean(result.data?.duplicate),version:Number(result.data?.version),
   hash:String(result.data?.hash)};
 });
export const closeV34Session=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(sessionInput)
 .handler(async({data,context})=>{
  enabled();const db=context.supabase as unknown as Db;await narrator(db);
  const service=await trusted();
  const result=await service.from('battle_v34_sessions')
   .update({status:'closed',updated_at:new Date().toISOString()})
   .eq('id',data.sessionId).select('id').maybeSingle();
  if(result.error||!result.data?.id)throw new Error('Partida não encontrada.');
  return {closed:true as const};
 });
