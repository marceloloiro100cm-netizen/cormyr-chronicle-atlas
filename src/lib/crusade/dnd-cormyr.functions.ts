import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {parseDndCormyr300} from './dnd-cormyr-300';

type Db={rpc:(name:string,args?:Record<string,unknown>)=>
 Promise<{data:unknown;error:{message:string}|null}>;
 from:(table:string)=>any};
async function requireNarrator(db:Db):Promise<void>{
 const [role,active]=await Promise.all([
  db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw Error('A biblioteca D&D é restrita ao Narrador autorizado.');
}
/** Fonte privada, nunca exposta a jogadores, visitantes ou GitHub público.
 * Retorna apenas números e metadados do catálogo curado, sem poderes especiais.
 * Os dados não são enviados a clientes sem sessão autenticada de Narrador.
 */
export const loadBattleDndCormyr300=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  const result=await db.from('battle_dnd_cormyr_monsters')
   .select('id,name,group_name,source,challenge_rating,hp,ac,size,speed_ft,melee,ranged')
   .order('id').limit(300);
  if(result.error)
   throw Error('Não foi possível consultar o bestiário privado de Cormyr.');
  const records=result.data as unknown[];
  if(!Array.isArray(records)||records.length!==300)
   throw Error('Bestiário privado está incompleto; requer exatamente 300 criaturas.');
  const monsters=records.map(raw=>{
   if(!raw||typeof raw!=='object')
    throw Error('Registro de criatura inválido.');
   const row=raw as Record<string,unknown>;
   return {
    id:row['id'],name:row['name'],group:row['group_name'],
    source:row['source'],challenge_rating:Number(row['challenge_rating']),
    hp:row['hp'],ac:row['ac'],size:row['size'],
    speed_ft:row['speed_ft'],
    melee:row['melee'],ranged:row['ranged'],
    special_abilities:[],
   };
  });
  // Valida também na saída do servidor, antes de revelar qualquer ficha.
  const catalog=parseDndCormyr300(JSON.stringify({
   metadata:{catalog:'Cormyr · 300 criaturas D&D para Faerûn',
    version:1,count:300},
   monsters,
  }));
  await requireNarrator(db);
  return catalog;
 });
