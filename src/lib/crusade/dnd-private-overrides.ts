/** Ajustes privados de estatísticas; catálogo base imutável.
 * O banco restringe SELECT/INSERT/UPDATE/DELETE ao Narrador ativo via RLS.
 */
import {supabase} from '@/integrations/supabase/client';
import {applyDndCombatOverrides,dndCombatOverrideSchema,
 type DndCombatOverride,type DndCombatOverrideEntry,
 type DndCormyrCatalog} from './dnd-cormyr-300';
const db=supabase as unknown as {
 rpc:(name:string)=>Promise<{data:unknown;error:{message:string}|null}>;
 from:(table:string)=>any;
};
async function requireNarrator(){
 const [role,active]=await Promise.all([
  db.rpc('is_campaign_admin'),db.rpc('campaign_access_active'),
 ]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw Error('Somente Narrador ativo pode editar o bestiário privado.');
}
export async function loadDndCombatOverrides(
 catalog:DndCormyrCatalog):Promise<DndCormyrCatalog>{
 await requireNarrator();
 const {data,error}=await db.from('battle_dnd_monster_overrides')
  .select('monster_id,combat_patch').limit(500);
 if(error||!Array.isArray(data))
  throw Error('Não foi possível consultar as correções privadas do bestiário.');
 const patches:DndCombatOverrideEntry[]=data.map((entry:Record<string,unknown>)=>({
  monsterId:String(entry['monster_id']),
  patch:dndCombatOverrideSchema.parse(entry['combat_patch']),
 }));
 return applyDndCombatOverrides(catalog,patches);
}
export async function saveDndCombatOverride(
 monsterId:string,patch:DndCombatOverride):Promise<void>{
 if(!/^[a-z0-9][a-z0-9-]{0,55}$/.test(monsterId))
  throw Error('ID de monstro inválido.');
 const valid=dndCombatOverrideSchema.parse(patch);
 await requireNarrator();
 const user=await supabase.auth.getUser();
 const uid=user.data.user?.id;
 if(user.error||!uid)throw Error('Sessão do Narrador indisponível.');
 const {error}=await db.from('battle_dnd_monster_overrides').upsert({
  monster_id:monsterId,combat_patch:valid,updated_by:uid,
  updated_at:new Date().toISOString(),
 },{onConflict:'monster_id'});
 if(error)throw Error('Não foi possível salvar a ficha privada: '+error.message);
}
export async function resetDndCombatOverride(monsterId:string):Promise<void>{
 await requireNarrator();
 const {error}=await db.from('battle_dnd_monster_overrides')
  .delete().eq('monster_id',monsterId);
 if(error)throw Error('Não foi possível restaurar os atributos originais.');
}
