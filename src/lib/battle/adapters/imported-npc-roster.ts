import {z} from 'zod';
import type {BattleStack,Hex,Side,Training} from '../domain/types';
import {makeFictionalStack} from '../domain/setup';

/** Fonte específica de batalha. NÃO representa compra lançada, baixa oficial ou HouseState. */
export const importedNpcUnitSchema=z.object({
 source_key:z.string().min(1).max(100),
 house_id:z.string().min(1).max(100),
 unit_name:z.string().min(1).max(120),
 unit_type:z.string().min(1).max(60),
 training:z.enum(['green','trained','veteran','elite']),
 quantity:z.number().int().min(1).max(30),
 standard_unit_strength:z.number().int().min(1).max(1000),
 source_status:z.string().min(1).max(100),
 source_row:z.number().int().min(0),
}).strict();
export type ImportedNpcUnit=z.infer<typeof importedNpcUnitSchema>;
/** Antigos IDs usavam apenas source_row e colidiam entre Casas NPC. A nova
 * identidade incorpora Casa+chave de origem sem expor nomes ou conteúdo da ficha.
 * FNV-1a serve como chave determinística de UI (não é checksum de segurança).
 */
export const importedNpcId=(unit:Pick<ImportedNpcUnit,'house_id'|'source_key'|'source_row'>)=>{
 let hash=2166136261;
 for(const char of unit.house_id+'::'+unit.source_key){
  hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 }
 return 'npc-roster-'+unit.source_row+'-'+hash.toString(36);
};

/** Mantém somente tipos/quantidades da planilha, aplicando os efetivos
 * padrão já usados na criação de unidades do site, sem nivelar Casas.
 */
export function previewImportedNpc(unit:ImportedNpcUnit){
 const row=importedNpcUnitSchema.parse(unit);
 return {
  id:row.source_key,name:row.unit_name,types:[row.unit_type],
  training:row.training,strength:row.quantity*row.standard_unit_strength,
  casualties:0,destroyed:false,sourceStatus:row.source_status,
 };
}
export function importedNpcBattleStack(row:ImportedNpcUnit,side:Side,position:Hex,
 primaryTypeId:string):BattleStack{
 const unit=importedNpcUnitSchema.parse(row);
 if(unit.unit_type!==primaryTypeId)
  throw new Error('Tipo tático não corresponde à unidade documental.');
 if(unit.unit_type==='warships')
  throw new Error('Unidades navais não participam da arena terrestre.');
 return makeFictionalStack({
  id:importedNpcId(unit),side,position,name:unit.unit_name,
  typeId:unit.unit_type,training:unit.training as Training,
  count:unit.quantity*unit.standard_unit_strength,
 });
}
/** Só cópias originadas do adaptador de catálogo podem substituir modelos em
 * uma batalha de treinamento local. O estado segue inteiramente fictício.
 */
export function isBattleTrainingCopy(stack:BattleStack):boolean{
 return stack.source.kind==='house-readonly'||
  (stack.source.kind==='fictional'&&/^npc-roster-\d+(?:-[a-z0-9]+)?$/.test(stack.id));
}
export function battleTrainingSourceKey(stack:BattleStack):string{
 return stack.source.kind==='house-readonly'?
  stack.source.houseId+'::'+stack.source.unitId:'npc::'+stack.id;
}
