import {z} from 'zod';
import {CHARACTER_CATALOG_VERSION} from './catalog';

/**
 * Lote 02 — contrato canônico de leitura; nenhuma mutação/migração é executada.
 * Os limites e custos de compra serão decididos no lote 04; validar os valores
 * importados não significa autorizar aquisição de novos graus.
 */
export const CHARACTER_SKILL_IDS = [
  'agility','athletics','cunning','knowledge','healing','deception',
  'stealth','warfare','language','thievery','animalHandling','fighting',
  'awareness','persuasion','marksmanship','survival','status','endurance','will',
] as const;
export type CharacterSkillId=typeof CHARACTER_SKILL_IDS[number];
export const CHARACTER_SKILL_LABELS:Record<CharacterSkillId,string>={
  agility:'Agilidade',athletics:'Atletismo',cunning:'Astúcia',
  knowledge:'Conhecimento',healing:'Cura',deception:'Enganação',
  stealth:'Furtividade',warfare:'Guerra',language:'Idioma',
  thievery:'Ladinagem',animalHandling:'Lidar com Animais',fighting:'Luta',
  awareness:'Percepção',persuasion:'Persuasão',marksmanship:'Pontaria',
  survival:'Sobrevivência',status:'Status',endurance:'Vigor',will:'Vontade',
};
export const CharacterSkillIdSchema=z.enum(CHARACTER_SKILL_IDS);
export const CharacterSkillRanksSchema=z.record(CharacterSkillIdSchema,z.number().int().min(1).max(10));
export const CharacterSpecialtySchema=z.object({
  id:z.string().min(1),skillId:CharacterSkillIdSchema,
  specialtyId:z.string().min(1),bonusDice:z.number().int().min(0).max(10),
  verified:z.boolean().default(false),
});
export const CharacterTraitSelectionSchema=z.object({
  id:z.string().min(1),traitId:z.string().min(1),
  tier:z.number().int().min(1).max(3).nullable(),
  params:z.record(z.string(),z.string()).default({}),
  acquiredAt:z.string().nullable().default(null),
  status:z.enum(['imported_unverified','proposed','approved','inactive']),
});
export const CharacterV2Schema=z.object({
  schemaVersion:z.literal(2),
  id:z.string().uuid(),houseId:z.string().min(1),
  playerId:z.string().nullable(),
  displayName:z.string().min(1),role:z.string(),
  portraitRef:z.string().nullable(),
  sourceRecordIds:z.array(z.string().uuid()).min(1),
  canonicalAgeRef:z.string().uuid().nullable(),
  version:z.number().int().min(0),
  ruleSetVersion:z.string().min(1).default(CHARACTER_CATALOG_VERSION),
  skillRanks:CharacterSkillRanksSchema,
  specialties:z.array(CharacterSpecialtySchema),
  traits:z.array(CharacterTraitSelectionSchema),
  equipment:z.array(z.object({itemId:z.string(),quantity:z.number().int().min(1),
    equipped:z.boolean(),params:z.record(z.string(),z.string())})),
  state:z.object({
    healthCurrent:z.number().int().min(0).nullable(),
    composureCurrent:z.number().int().min(0).nullable(),
    injuries:z.array(z.string()),wounds:z.array(z.string()),
    conditions:z.array(z.string()),
  }),
  source:z.object({
    format:z.enum(['chronicle-v1','legacy-text']),
    recordId:z.string().uuid(),recordVersion:z.number().int().min(0),
    sourceFingerprint:z.string(),
    originalContent:z.string(),
    /** Extração sem perda: trechos ainda não estruturados continuam legíveis. */
    unparsedFields:z.record(z.string(),z.string()),
  }),
  review:z.object({
    status:z.enum(['needs_review','ready_for_review','approved']),
    warnings:z.array(z.string()),
  }),
  migrationStatus:z.literal('read_only_preview'),
});
export type CharacterV2=z.infer<typeof CharacterV2Schema>;
export function emptyCharacterSkillRanks():Record<CharacterSkillId,number>{
  return Object.fromEntries(CHARACTER_SKILL_IDS.map(id=>[id,2])) as Record<CharacterSkillId,number>;
}
/** Desligado deliberadamente até migração/aceite do lote 12. */
export const CHARACTER_V2_PLAYER_UI_ENABLED=false as const;
