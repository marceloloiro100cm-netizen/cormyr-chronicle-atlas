/** Partidas V3 sincronizadas entre duas casas.
 * APENAS exércitos-modelo: nunca faz write em HouseState, economia ou calendário.
 * A flag da interface permanece OFF até migração 0078 + E2E JWT em homologação.
 */
import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {battleHash} from '../domain/replay';
import {MODEL_HOUSES} from './model-houses';
import {V3_COMMANDERS} from './commanders';
import {SCENARIOS} from '../geometry/map-fixtures';
import {createV3Game,type V3Step,type V3ScenarioOptions} from './engine';
import {captureV3Replay,verifyV3Replay,applyV3ReplayStep,v3StepSchema} from './replay';

const uuid=z.string().uuid();
const liveOptions=z.object({
 attackerHouseId:z.enum(MODEL_HOUSES.map(h=>h.id) as [string,...string[]]),
 defenderHouseId:z.enum(MODEL_HOUSES.map(h=>h.id) as [string,...string[]]),
 attackerCommander:z.enum(V3_COMMANDERS.map(c=>c.id) as [string,...string[]]),
 defenderCommander:z.enum(V3_COMMANDERS.map(c=>c.id) as [string,...string[]]),
 scenario:z.enum(Object.keys(SCENARIOS) as [string,...string[]]),
}).strict();
const createInput=z.object({
 title:z.string().trim().min(5).max(120),
 attackerHouseId:z.string().trim().min(1).max(100),
 defenderHouseId:z.string().trim().min(1).max(100),
 options:liveOptions,
}).strict();
const matchInput=z.object({id:uuid}).strict();
const turnInput=z.object({
 id:uuid,expectedVersion:z.number().int().min(0).max(1499),
 step:v3StepSchema,
}).strict();
type Db={rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;from:(table:string)=>any};
const BATTLE_NARRATOR_ONLY_RELEASE=true;
function requireLiveEnabled(){
 if(BATTLE_NARRATOR_ONLY_RELEASE||process.env['ENABLE_BATTLE_V3_LIVE']!=='true')
  throw new Error('Batalhas multiplayer não habilitadas neste ambiente.');
}

export type LiveV3Match=Readonly<{
 id:string;title:string;attacker_house_id:string;defender_house_id:string;
 state_version:number;state_hash:string;replay_json:unknown;
 status:'active'|'completed'|'closed';updated_at:string;
}>;
async function requireAccess(db:Db){
 const r=await db.rpc('campaign_access_active');
 if(r.error||r.data!==true)throw new Error('Acesso à campanha não autorizado.');
}
async function isAdmin(db:Db):Promise<boolean>{
 const role=await db.rpc('is_campaign_admin');
 if(role.error)throw new Error('Papel atual indisponível.');
 return role.data===true;
}
async function requireNarrator(db:Db){
 await requireAccess(db);
 if(!await isAdmin(db))throw new Error('Somente o Narrador pode convocar multiplayer.');
}
async function canControl(db:Db,houseId:string):Promise<boolean>{
 if(await isAdmin(db))return true;
 const member=await db.rpc('in_campaign_house',{h:houseId,edit_required:true});
 return !member.error&&member.data===true;
}
async function readRow(db:Db,id:string):Promise<LiveV3Match>{
 await requireAccess(db);
 const result=await db.from('battle_v3_live_matches')
  .select('id,title,attacker_house_id,defender_house_id,state_version,state_hash,replay_json,status,updated_at')
  .eq('id',id).maybeSingle();
 if(result.error||!result.data)throw new Error('Partida não encontrada ou acesso revogado.');
 await requireAccess(db);
 return result.data as LiveV3Match;
}
export const listLiveV3Matches=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  requireLiveEnabled();
  const db=context.supabase as unknown as Db;
  await requireAccess(db);
  const result=await db.from('battle_v3_live_matches')
   .select('id,title,attacker_house_id,defender_house_id,state_version,status,updated_at')
   .order('updated_at',{ascending:false}).limit(60);
  if(result.error)throw new Error('Partidas multiplayer indisponíveis neste ambiente.');
  await requireAccess(db);
  return (result.data??[]) as Omit<LiveV3Match,'state_hash'|'replay_json'>[];
 });
export const createLiveV3Match=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(createInput)
 .handler(async({data,context})=>{
  requireLiveEnabled();
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  if(data.attackerHouseId===data.defenderHouseId)
   throw new Error('Multiplayer exige duas casas distintas.');
  for(const houseId of [data.attackerHouseId,data.defenderHouseId]){
   const house=await db.from('campaign_houses').select('id')
    .eq('id',houseId).eq('active',true).eq('season',2).maybeSingle();
   if(house.error||!house.data?.id)throw new Error('Casa não está ativa na campanha.');
  }
  const options={...data.options,opponent:'human'} as V3ScenarioOptions;
  const replay=captureV3Replay(createV3Game(options));
  await requireNarrator(db);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  const stored=await trusted.from('battle_v3_live_matches').insert({
   title:data.title,created_by:context.userId,
   attacker_house_id:data.attackerHouseId,defender_house_id:data.defenderHouseId,
   replay_json:replay,state_hash:replay.finalHash,state_version:0,status:'active',
  }).select('id').single();
  if(stored.error||!stored.data?.id)throw new Error('Não foi possível criar a partida multiplayer.');
  return {id:String(stored.data.id)};
 });
export const readLiveV3Match=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(matchInput)
 .handler(async({data,context})=>{
  requireLiveEnabled();
  const db=context.supabase as unknown as Db;
  const row=await readRow(db,data.id);
  const {game}=verifyV3Replay(row.replay_json);
  if(game.battle.stacks.some(s=>s.source.kind!=='fictional')||
     game.setup.opponent!=='human'||battleHash(game)!==row.state_hash)
   throw new Error('Partida multiplayer com estado inconsistente.');
  const turn=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  const side=turn?.side??null;
  const allowed=side?await canControl(db,side==='attacker'?row.attacker_house_id:row.defender_house_id):false;
  await requireAccess(db);
  return {id:row.id,title:row.title,version:row.state_version,
   status:row.status,attackerHouseId:row.attacker_house_id,defenderHouseId:row.defender_house_id,
   canPlay:row.status==='active'&&allowed,gameJson:JSON.stringify(game)};
 });
export const playLiveV3Turn=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(turnInput)
 .handler(async({data,context})=>{
  requireLiveEnabled();
  const db=context.supabase as unknown as Db;
  const row=await readRow(db,data.id);
  if(row.status!=='active')throw new Error('Partida já encerrada.');
  if(row.state_version!==data.expectedVersion)throw new Error('CONFLICT: recarregue o turno atualizado.');
  const {game}=verifyV3Replay(row.replay_json);
  if(game.setup.opponent!=='human'||game.battle.stacks.some(s=>s.source.kind!=='fictional')||
     battleHash(game)!==row.state_hash)
   throw new Error('Integridade da partida não confirmada.');
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
  if(!active||game.battle.phase!=='active')throw new Error('Nenhum turno ativo.');
  const house=active.side==='attacker'?row.attacker_house_id:row.defender_house_id;
  if(!await canControl(db,house))throw new Error('Esta casa não controla o turno atual.');
  const step=data.step as V3Step;
  if(step.type==='AI'||step.type==='COMMAND'&&step.actor!=='narrator')
   throw new Error('Comandos automáticos não são aceitos do navegador.');
  if(step.type==='COMMAND'&&step.command.type==='MANUAL_FINISH'&&!await isAdmin(db))
   throw new Error('Encerramento manual exclusivo do Narrador.');
  const next=applyV3ReplayStep(game,step);
  if(next.steps.length!==game.steps.length+1)
   throw new Error('O comando não avançou o histórico.');
  const file=captureV3Replay(next);
  await requireAccess(db);
  if(!await canControl(db,house))throw new Error('Autorização revogada durante o turno.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const trusted=supabaseAdmin as unknown as Db;
  const stored=await trusted.from('battle_v3_live_matches').update({
   replay_json:file,state_hash:file.finalHash,state_version:data.expectedVersion+1,
   status:next.battle.phase==='completed'?'completed':'active',
   updated_at:new Date().toISOString(),
  }).eq('id',data.id).eq('state_version',data.expectedVersion)
   .eq('state_hash',row.state_hash).eq('status','active').select('id').maybeSingle();
  if(stored.error||!stored.data?.id)
   throw new Error('CONFLICT: outra aba executou o turno; recarregue.');
  return {version:data.expectedVersion+1,status:next.battle.phase};
 });
