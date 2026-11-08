import {supabase} from '@/integrations/supabase/client';
import {parseDndCormyr300,type DndCormyrCatalog} from './dnd-cormyr-300';
import {loadDndCombatOverrides} from './dnd-private-overrides';

/** Carrega o catálogo do Supabase somente no navegador com sessão do Narrador.
 * RLS no banco aplica is_campaign_admin() AND campaign_access_active().
 * O teste explícito de papel evita até iniciar a leitura fora de sessão.
 */
export async function loadPrivateDndCormyr300():Promise<DndCormyrCatalog>{
 const db=supabase as unknown as {
  rpc:(name:string)=>Promise<{data:unknown;error:{message:string}|null}>;
  from:(table:string)=>any;
 };
 const [role,active]=await Promise.all([
  db.rpc('is_campaign_admin'),db.rpc('campaign_access_active'),
 ]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw Error('O bestiário privado exige sessão do Narrador autorizada.');
 const result=await db.from('battle_dnd_cormyr_monsters')
  .select('id,name,group_name,source,challenge_rating,hp,ac,size,speed_ft,melee,ranged,catalog_version')
  .order('id').limit(500);
 if(result.error)
  throw Error('O bestiário privado não pôde ser consultado.');
 const records=result.data as unknown[];
 if(!Array.isArray(records)||records.length<300||records.length>500)
  throw Error('O catálogo privado está incompleto: são esperadas entre 300 e 500 criaturas.');
 const monsters=records.map(record=>{
  if(!record||typeof record!=='object')throw Error('Registro de criatura inválido.');
  const m=record as Record<string,unknown>;
  return {
   id:m['id'],name:m['name'],group:m['group_name'],
   source:m['source'],challenge_rating:Number(m['challenge_rating']),
   hp:m['hp'],ac:m['ac'],size:m['size'],speed_ft:m['speed_ft'],
   melee:m['melee'],ranged:m['ranged'],special_abilities:[],
  };
 });
 // Revalidação estrita no cliente, sem confiar em conteúdos de rede.
 const base=parseDndCormyr300(JSON.stringify({
  metadata:{catalog:'Cormyr · bestiário privado de Faerûn',
   version:records.some(x=>Number((x as Record<string,unknown>)['catalog_version'])>=2)?2:1,
   count:monsters.length},
  monsters,
 }));
 return loadDndCombatOverrides(base);
}
