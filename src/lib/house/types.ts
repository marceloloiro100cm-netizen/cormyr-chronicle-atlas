import type { CreationHistory } from './creation-history';
import type { InfluenceBenefit } from './resource-transactions';
export const RESOURCE_KEYS = ['defense', 'influence', 'lands', 'law', 'population', 'power', 'wealth'] as const;
export type Resource = typeof RESOURCE_KEYS[number];
export type Resources = Record<Resource, number>;
export const RESOURCE_NAMES: Record<Resource, string> = { defense: 'Defesa', influence: 'Influência', lands: 'Terras', law: 'Lei', population: 'População', power: 'Poder', wealth: 'Riqueza' };
export const zeroResources = (): Resources => ({ defense: 0, influence: 0, lands: 0, law: 0, population: 0, power: 0, wealth: 0 });
export type Cost = { resource: Resource; amount: number; mode: 'allocation' | 'permanent' };
export type Requirement = {
 kind: 'terrain' | 'feature' | 'community' | 'parent' | 'resource' | 'water' | 'fortification'
  | 'max_community' | 'max_resource' | 'forbidden_feature' | 'holding' | 'forbidden_season' | 'any_of';
 values?: string[] | undefined; minimum?: number | undefined; maximum?: number | undefined;
 resource?: Resource | undefined;
 alternatives?: {kind:'terrain'|'feature'|'community'|'fortification'|'holding'|'water';values?:string[]|undefined}[] | undefined;
};
export type Effect = { kind: 'fortune' | 'gain' | 'mitigation' | 'discount' | 'defensive' | 'action' | 'conversion'; amount?: number | undefined; resource?: Resource | undefined; target?: string | undefined; description: string; seasons?: ('spring' | 'summer' | 'autumn' | 'winter')[] | undefined; maxResource?: {resource:Resource;maximum:number}|undefined };
export type CatalogItem = {
  id: string; name: string; original: string; category: 'terrain' | 'feature' | 'community' | 'fortification' | 'estate' | 'lifestyle' | 'personage' | 'settlement' | 'improvement' | 'equipment' | 'vassal';
  description: string; costs: Cost[]; requirements: Requirement[]; effects: Effect[];
  duration: { months: number; dice?: number | undefined; sides?: number | undefined };
  source: string; section: string; version: string; repeatable: boolean;
  pending?: string | undefined; parent?: string | undefined; capacity?: number | undefined; custom?: boolean | undefined; coexists?: boolean | undefined;
};
export type Domain = { id: string; name: string; terrain: string; features: string[]; community?: string | undefined; notes: string; image?: string | undefined };
export type Holding = { id: string; itemId: string; name: string; domainId: string; parentId?: string | undefined; supportId?: string | undefined; coexists?: boolean | undefined; costs: Cost[]; effects: Effect[]; ruleVersion: string; source: string; status: 'active' | 'building' | 'destroyed' | 'abandoned' | 'sold' | 'cancelled'; lostAllocation?: boolean | undefined; category?: CatalogItem['category'] | undefined; weaponSpecialty?: 'fighting'|'marksmanship'|undefined; originalCosts?: Cost[] | undefined; discounts?: {source:string;resource:Resource;amount:number}[] | undefined; allocatedCosts?: Partial<Record<Resource, number>> | undefined };
export type Project = { id: string; holdingId: string; name: string; start: number; duration: number; dice: number[]; status: 'building' | 'completed' | 'cancelled'; modifier: number };
export const SKILLS = ['agility', 'athletics', 'awareness', 'endurance', 'fighting', 'marksmanship', 'stealth', 'cunning', 'healing', 'animalHandling', 'warfare', 'survival'] as const;
export type Skill = typeof SKILLS[number];
export const SKILL_NAMES: Record<Skill, string> = { agility: 'Agilidade', athletics: 'Atletismo', awareness: 'Percepção', endurance: 'Vigor', fighting: 'Luta', marksmanship: 'Pontaria', stealth: 'Furtividade', cunning: 'Astúcia', healing:'Cura',animalHandling:'Lidar com animais',warfare:'Guerra',survival:'Sobrevivência' };
/** The army used the 12 mass-combat abilities; preserve them in legacy saves
 * and expose the other eight Chronicle abilities as optional extended stats. */
export const EXTRA_UNIT_SKILLS=['brawling','knowledge','deception','language','thievery','persuasion','status','will'] as const;
export type ExtraUnitSkill=typeof EXTRA_UNIT_SKILLS[number];
export const UNIT_SKILLS=[...SKILLS,...EXTRA_UNIT_SKILLS] as const;
export type UnitSkill=typeof UNIT_SKILLS[number];
export const UNIT_SKILL_NAMES:Record<UnitSkill,string>={
 ...SKILL_NAMES,brawling:'Briga',knowledge:'Conhecimento',deception:'Enganação',
 language:'Idioma',thievery:'Ladinagem',persuasion:'Persuasão',status:'Status',will:'Vontade'
};
export type ExtraUnitSkills=Partial<Record<ExtraUnitSkill,number>>;
export type MountProfile={name:string;athletics:number;endurance:number;source:string};
export type MixedRule={allowedSkills:UnitSkill[];disciplineModifier:number;justification:string};
export type Unit = { id: string; name: string; types: string[]; training: string; commanderId?: string | undefined; commanderName?:string|undefined; origin: string; domainId: string; skills: Record<Skill, number>; extraSkills?:ExtraUnitSkills|undefined; xp: number; costs: Cost[]; armor: number; armorPenalty: number; health: number; casualties: number; strength: number; disciplineModifier: number; equipment: string[]; situation: string; notes: string; bulk?:number|undefined; equipmentTypeId?:string|undefined; mount?:MountProfile|undefined; mounted?:boolean|undefined; atHome?:boolean|undefined; destroyed?:boolean|undefined; evolution?:{id:string;month:number;roll:number;condition:string;disorganizations:number;steps:number;before:string;after:string;justification:string}[]|undefined; bonusRanks?:number|undefined; bonusXp?:number|undefined; xpEvents?:{id:string;month:number;delta:number;reason:string;kind:'award'|'training'}[]|undefined; mixedRule?:MixedRule|undefined; allocatedCosts?: Partial<Record<Resource, number>> | undefined };
export type VassalSheet={region:string;motto?:string|undefined;lordName?:string|undefined;rolls:Record<Resource,number[]>;base:Resources;permanent:Resources;holdings:Holding[];domains:Domain[]};
export type Vassal={sheet?:VassalSheet|undefined;id:string;houseId:string;name:string;status:'proposed'|'approved'|'ended';loyalty?:'loyal'|'neutral'|'rebellious'|'broken'|undefined;cost:number;influencePenalty:number;notes:string;approvedMonth?:number|undefined;npcIds?:string[]|undefined;approvalNote?:string|undefined;approvedBy?:string|undefined};
export type CourtMember = { id: string; npcId?: string | undefined; name: string; role: string; notes: string };
export type Fortune = { month: number; mode: 'roll' | 'alternative'; dice: number[]; bonusDice: number[]; modifier: number; result: number; outcome: string; resource: Resource; changes: Partial<Resources>; source: string };
export type HouseState = {
  schemaVersion: 1; houseId: string; phase: 'draft' | 'review' | 'active'; creationStep: number;
  identity: { region: string; motto: string; foundation?: number | undefined; history: string[]; notes: string; crestPath?: string | undefined };
  method: 'budget' | 'roll' | 'import'; budget: number | null; base: Resources; permanent: Resources;
  regionalApplied: boolean; rolls: number[][]; domains: Domain[]; holdings: Holding[]; units: Unit[]; projects: Project[]; court: CourtMember[];
  month: number; treasury: number; fortunes: Fortune[]; actions: { month: number; type: string; notes: string }[];
  pending: string[]; importSources: string[]; vassals?:Vassal[]|undefined;
  creationHistory?: CreationHistory | undefined;
  creationBonuses?: { playerId: string; resource: Resource; die: number }[] | undefined;
  creationBonusesApplied?: boolean | undefined;
  influenceBenefits?: InfluenceBenefit[] | undefined;
};
export type Ledger = { id: string; action: string; explanation: string; campaignMonth: number; before: Resources; after: Resources; rule: string; key: string; createdAt?: string | undefined; actor?: string | undefined };
export type HouseDocument = { state: HouseState; version: number; ledger: Ledger[]; syncState: string };
export function newHouseState(houseId: string, region = ''): HouseState {
  return { schemaVersion: 1, houseId, phase: 'draft', creationStep: 0, identity: { region, motto: '', history: [], notes: '' }, method: 'budget', budget: null, base: zeroResources(), permanent: zeroResources(), regionalApplied: false, rolls: [], domains: [], holdings: [], units: [], projects: [], court: [], month: 1522 * 12, treasury: 0, fortunes: [], actions: [], pending: [], importSources: [] };
}
