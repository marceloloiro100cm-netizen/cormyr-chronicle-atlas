import {z} from 'zod';
import type {CharacterV2,CharacterSkillId} from './schema';
import type {CharacterEquipmentSnapshot} from './derived';
import {resolveCharacterWithTraits} from './trait-engine';

/** Lote 10: a Tabela 9-2/9-3 só tem efeitos se cada item for homologado. */
export const CHARACTER_EQUIPMENT_VERSION='character-gear-v1' as const;
export const VerifiedGearSchema=z.object({
 id:z.string().min(1).max(120),
 name:z.string().min(1).max(160),
 kind:z.enum(['armor','shield','weapon','other']),
 source:z.string().min(4),
 rulesVersion:z.string().min(1),
 narratorVerified:z.literal(true),
 armorRating:z.number().int().min(0).max(20).default(0),
 armorPenalty:z.number().int().min(0).max(20).default(0),
 shieldDefense:z.number().int().min(0).max(10).default(0),
 defensiveWeaponBonus:z.number().int().min(0).max(10).default(0),
 bulk:z.number().int().min(0).max(30).default(0),
 damage:z.object({skill:z.enum(['agility','athletics','fighting','marksmanship']),
  multiplier:z.number().int().min(0).max(5),modifier:z.number().int().min(-10).max(20)}).nullable(),
 properties:z.array(z.string().min(1).max(80)),
});
export type VerifiedGear=z.infer<typeof VerifiedGearSchema>;
export type EquipmentReview={
 snapshot:CharacterEquipmentSnapshot;
 approved:readonly VerifiedGear[];
 pending:readonly string[];
 damages:readonly {id:string;label:string;value:number;formula:string}[];
};
export function reviewCharacterEquipment(character:CharacterV2,catalog:readonly VerifiedGear[]):EquipmentReview{
 const byId=new Map<string,VerifiedGear>();
 for(const raw of catalog){
  const item=VerifiedGearSchema.parse(raw);
  if(byId.has(item.id))throw new Error('Item duplicado no catálogo de equipamento.');
  byId.set(item.id,item);
 }
 const approved:VerifiedGear[]=[],pending:string[]=[];
 const equipped=character.equipment.filter(x=>x.equipped);
 const counts={armor:0,shield:0};
 const parts={armorRating:0,armorPenalty:0,shieldDefense:0,defensiveWeaponBonus:0,bulk:0};
 for(const ref of equipped){
  const item=byId.get(ref.itemId);
  if(!item){pending.push('Equipamento sem ficha homologada: '+ref.itemId);continue;}
  if(ref.quantity!==1){pending.push('Quantidade de equipamento equipada requer revisão: '+ref.itemId);continue;}
  if(item.kind==='armor'||item.kind==='shield'){
   counts[item.kind]++;
   if(counts[item.kind]>1){pending.push('Equipamentos simultâneos conflitantes: '+item.kind);continue;}
  }
  approved.push(item);
  parts.armorRating+=item.armorRating;parts.armorPenalty+=item.armorPenalty;
  parts.shieldDefense+=item.shieldDefense;parts.defensiveWeaponBonus+=item.defensiveWeaponBonus;
  parts.bulk+=item.bulk;
 }
 // Bloqueia todo o snapshot quando há ambiguidade, não aplica bônus parciais por acidente.
 const verified=pending.length===0;
 const damages=verified?approved.filter(g=>g.damage!==null).map(g=>{
  const d=g.damage!;
  const rank=character.skillRanks[d.skill as CharacterSkillId];
  return{id:g.id,label:g.name,value:Math.max(0,rank*d.multiplier+d.modifier),
   formula:d.multiplier+'× '+d.skill+(d.modifier>=0?' + ':' − ')+Math.abs(d.modifier)};
 }):[];
 return{
  snapshot:{verified,sourceId:'equipment:'+CHARACTER_EQUIPMENT_VERSION,
   armorRating:verified?parts.armorRating:0,armorPenalty:verified?parts.armorPenalty:0,
   shieldDefense:verified?parts.shieldDefense:0,
   defensiveWeaponBonus:verified?parts.defensiveWeaponBonus:0,bulk:verified?parts.bulk:0},
  approved:verified?approved:[],pending,damages,
 };
}
/** Fonte unificada para ficha e exportação, sem conteúdo secreto do Narrador. */
export function buildCharacterResolvedReport(character:CharacterV2,
 catalog:readonly VerifiedGear[]=[]){
 const gear=reviewCharacterEquipment(character,catalog);
 const {derived,traits}=resolveCharacterWithTraits(character,{equipment:gear.snapshot});
 const values=derived.values;
 return{
  schemaVersion:1 as const,characterId:character.id,name:character.displayName,
  houseId:character.houseId,version:character.version,
  rulesVersion:character.ruleSetVersion,
  skillRanks:{...character.skillRanks},
  stats:{...values,healthCurrent:derived.healthCurrent,composureCurrent:derived.composureCurrent},
  breakdown:derived.order.map(key=>({key,value:values[key],formula:derived.nodes[key].formula,
   lines:derived.nodes[key].lines.map(line=>({...line}))})),
  weapons:gear.damages,
  pending:[...character.review.warnings,...gear.pending,...traits.pending,...traits.warnings,...derived.warnings],
  verifiedTraits:traits.applied,
  // Never serialize originalContent, record versions, narrator notes, or private economy ledger.
 };
}
