/** Cadastro privado V2: criaturas novas pertencem somente ao Narrador.
 * Não publica os dados no código, não altera os 300 monstros de origem.
 */
import {supabase} from '@/integrations/supabase/client';
import {parseDndCustomMonster,type DndCormyrMonster}
 from './dnd-cormyr-300';
const db=supabase as unknown as {
 rpc:(name:string)=>Promise<{data:unknown;error:{message:string}|null}>;
 from:(table:string)=>any;
};
async function requireNarrator():Promise<string>{
 const [role,active,user]=await Promise.all([
  db.rpc('is_campaign_admin'),db.rpc('campaign_access_active'),
  supabase.auth.getUser(),
 ]);
 if(role.error||active.error||role.data!==true||active.data!==true||
  user.error||!user.data.user?.id)
  throw Error('Catálogo privado exige Narrador autenticado e autorizado.');
 return user.data.user.id;
}
export async function loadDndCustomMonsters():Promise<readonly DndCormyrMonster[]>{
 await requireNarrator();
 const {data,error}=await db.from('battle_dnd_custom_monsters')
  .select('id,payload').order('id').limit(201);
 if(error||!Array.isArray(data))
  throw Error('Não foi possível ler as criaturas extras privadas.');
 if(data.length>200)throw Error('Catálogo V2 excede 200 criaturas extras.');
 return data.map((row:Record<string,unknown>)=>{
  const parsed=parseDndCustomMonster(row['payload']);
  if(parsed.id!==row['id'])throw Error('Criatura extra com ID inconsistente.');
  return parsed;
 });
}
/** Somente entradas próprias prefixadas custom-. Revisão e inserção no banco
 * privado; não permite sobrescrever IDs de fonte da seleção 300.
 */
export async function saveDndCustomMonster(input:unknown):Promise<void>{
 const parsed=parseDndCustomMonster(input);
 if(!parsed.id.startsWith('custom-'))
  throw Error('Novas criaturas precisam ter ID iniciado por custom-.');
 const uid=await requireNarrator();
 const {error}=await db.from('battle_dnd_custom_monsters').upsert({
  id:parsed.id,payload:parsed,catalog_version:2,
  created_by:uid,updated_at:new Date().toISOString(),
 },{onConflict:'id'});
 if(error)throw Error('Criatura extra não salva: '+error.message);
}
export async function deleteDndCustomMonster(id:string):Promise<void>{
 if(!/^custom-[a-z0-9-]{1,48}$/.test(id))throw Error('ID extra inválido.');
 await requireNarrator();
 const {error}=await db.from('battle_dnd_custom_monsters').delete().eq('id',id);
 if(error)throw Error('Não foi possível excluir a criatura extra.');
}
