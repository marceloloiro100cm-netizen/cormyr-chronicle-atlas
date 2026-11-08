/** Biblioteca de sessões D&D somente para Narrador ativo (RLS do Supabase).
 * Não concede acesso a fichas de Casas nem reescreve resultados oficiais.
 */
import {supabase} from '@/integrations/supabase/client';
import {crzReplayParse,crzReplaySerialize,type CrzReplaySession} from './replay';
import {crzAfterActionReport} from './insights';
import {isDndBattle} from './dnd-mode';

type QueryResult={data:unknown;error:{message:string}|null};
const db=supabase as unknown as {
 rpc:(name:string)=>Promise<QueryResult>;
 from:(table:string)=>any;
};
async function requireNarrator():Promise<void>{
 const [role,active]=await Promise.all([
  db.rpc('is_campaign_admin'),db.rpc('campaign_access_active'),
 ]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw Error('D&D: sessão privada exige Narrador autenticado e ativo.');
}
export type DndSavedBattle=Readonly<{battleId:string;updatedAt:string}>;

export async function saveDndBattle(session:CrzReplaySession):Promise<void>{
 if(!isDndBattle(session.state))throw Error('Somente batalhas D&D podem ser salvas.');
 const replay=crzReplaySerialize(session.replay);
 await requireNarrator();
 const {error}=await db.from('battle_dnd_sessions').upsert({
  battle_id:session.state.id,replay:JSON.parse(replay),
  report:session.state.phase==='completed'?crzAfterActionReport(session.replay):null,
  updated_at:new Date().toISOString(),
 },{onConflict:'owner_id,battle_id'});
 if(error)throw Error('Não foi possível salvar a batalha D&D: '+error.message);
}
export async function listDndBattles():Promise<readonly DndSavedBattle[]>{
 await requireNarrator();
 const {data,error}=await db.from('battle_dnd_sessions')
  .select('battle_id,updated_at').order('updated_at',{ascending:false}).limit(30);
 if(error||!Array.isArray(data))
  throw Error('Batalhas D&D privadas indisponíveis.');
 return data.map((r:Record<string,unknown>)=>({
  battleId:String(r['battle_id']),updatedAt:String(r['updated_at']),
 }));
}
export async function loadDndBattle(battleId:string):Promise<CrzReplaySession>{
 if(!/^dnd-training-[a-z0-9-]{1,100}$/.test(battleId))
  throw Error('Identificador de batalha inválido.');
 await requireNarrator();
 const {data,error}=await db.from('battle_dnd_sessions').select('replay')
  .eq('battle_id',battleId).single();
 if(error||!data||typeof data!=='object')
  throw Error('Batalha D&D não encontrada na conta do Narrador.');
 const raw=(data as Record<string,unknown>)['replay'];
 const restored=crzReplayParse(JSON.stringify(raw));
 if(!isDndBattle(restored.state)||restored.state.id!==battleId)
  throw Error('Batalha incompatível ou replay adulterado.');
 return restored;
}
