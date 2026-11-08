/** Dados-fonte recuperados do ZIP 5etools fornecido pelo Narrador.
 * Os 300 registros originais permanecem imutáveis. A tabela com estatísticas
 * verificadas é privada, RLS permite leitura somente ao Narrador ativo.
 * Ordem de precedência: fonte revisada < ajuste manual do Narrador.
 */
import {supabase} from '@/integrations/supabase/client';
import {applyDndCombatOverrides,dndCombatOverrideSchema,
 type DndCormyrCatalog,type DndCombatOverrideEntry} from './dnd-cormyr-300';

/** Revalida dados não confiáveis da consulta sem confiar no objeto recebido. */
export function applyDndVerifiedRows(catalog:DndCormyrCatalog,
 data:readonly unknown[]):DndCormyrCatalog{
 if(data.length!==300)throw Error('Revisão D&D incompleta: 300 fichas-fonte são esperadas.');
 const known=new Set(catalog.monsters.map(m=>m.id));
 const seen=new Set<string>();
 const patches:DndCombatOverrideEntry[]=data.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw Error('Revisão D&D contém registro inválido.');
  const entry=raw as Record<string,unknown>;
  const monsterId=String(entry['monster_id']);
  if(!known.has(monsterId)||seen.has(monsterId))
   throw Error('Revisão D&D contém ID desconhecido ou duplicado.');
  seen.add(monsterId);
  return {monsterId,patch:dndCombatOverrideSchema.parse(entry['combat_defaults'])};
 });
 // Não alterar os 300 de origem: somente compor fichas de uso tático.
 return applyDndCombatOverrides(catalog,patches);
}
export async function loadDndVerifiedSources(
 catalog:DndCormyrCatalog):Promise<DndCormyrCatalog>{
 const db=supabase as unknown as {
  from:(table:string)=>any;
 };
 // A fonte complementar é opcional em homologação; problemas de
 // conectividade não podem bloquear o catálogo principal de 300.
 const {data,error}=await db.from('battle_dnd_verified_sources')
  .select('monster_id,combat_defaults').order('monster_id').limit(301);
 if(error||!Array.isArray(data))return catalog;
 return applyDndVerifiedRows(catalog,data);
}
