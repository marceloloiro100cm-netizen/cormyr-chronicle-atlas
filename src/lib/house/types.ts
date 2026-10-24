export const RESOURCE_KEYS = ['defense', 'influence', 'lands', 'law', 'population', 'power', 'wealth'] as const;
export type Resource = typeof RESOURCE_KEYS[number];
export type Resources = Record<Resource, number>;
export const RESOURCE_NAMES: Record<Resource, string> = { defense: 'Defesa', influence: 'Influência', lands: 'Terras', law: 'Lei', population: 'População', power: 'Poder', wealth: 'Riqueza' };
export const zeroResources = (): Resources => ({ defense: 0, influence: 0, lands: 0, law: 0, population: 0, power: 0, wealth: 0 });
export type Cost = { resource: Resource; amount: number; mode: 'allocation' | 'permanent' };
export type Requirement = { kind: 'terrain' | 'feature' | 'community' | 'parent' | 'resource' | 'water' | 'fortification'; values?: string[] | undefined; minimum?: number | undefined; resource?: Resource | undefined };
export type Effect = { kind: 'fortune' | 'gain' | 'mitigation' | 'discount' | 'defensive' | 'action' | 'conversion'; amount?: number | undefined; resource?: Resource | undefined; target?: string | undefined; description: string };
export type CatalogItem = {
  id: string; name: string; original: string; category: 'terrain' | 'feature' | 'community' | 'fortification' | 'estate' | 'lifestyle' | 'personage' | 'settlement' | 'improvement' | 'equipment' | 'vassal';
  description: string; costs: Cost[]; requirements: Requirement[]; effects: Effect[];
  duration: { months: number; dice?: number | undefined; sides?: number | undefined };
  source: string; section: string; version: string; repeatable: boolean;
  pending?: string | undefined; parent?: string | undefined; capacity?: number | undefined; custom?: boolean | undefined;
};
export type Domain = { id: string; name: string; terrain: string; features: string[]; community?: string | undefined; notes: string; image?: string | undefined };
export type Holding = { id: string; itemId: string; name: string; domainId: string; parentId?: string | undefined; costs: Cost[]; effects: Effect[]; ruleVersion: string; source: string; status: 'active' | 'building' | 'destroyed' | 'abandoned' | 'sold' | 'cancelled'; lostAllocation?: boolean | undefined };
export type Project = { id: string; holdingId: string; name: string; start: number; duration: number; dice: number[]; status: 'building' | 'completed' | 'cancelled'; modifier: number };
export const SKILLS = ['agility', 'athletics', 'awareness', 'endurance', 'fighting', 'marksmanship', 'stealth', 'cunning', 'healing', 'animalHandling', 'warfare', 'survival'] as const;
export type Skill = typeof SKILLS[number];
export const SKILL_NAMES: Record<Skill, string> = { agility: 'Agilidade', athletics: 'Atletismo', awareness: 'Percepção', endurance: 'Vigor', fighting: 'Luta', marksmanship: 'Pontaria', stealth: 'Furtividade', cunning: 'Astúcia', healing:'Cura',animalHandling:'Lidar com animais',warfare:'Guerra',survival:'Sobrevivência' };
export type Unit = { id: string; name: string; types: string[]; training: string; commanderId?: string | undefined; origin: string; domainId: string; skills: Record<Skill, number>; xp: number; costs: Cost[]; armor: number; armorPenalty: number; health: number; casualties: number; strength: number; disciplineModifier: number; equipment: string[]; situation: string; notes: string };
export type CourtMember = { id: string; npcId?: string | undefined; name: string; role: string; notes: string };
export type Fortune = { month: number; mode: 'roll' | 'alternative'; dice: number[]; bonusDice: number[]; modifier: number; result: number; outcome: string; resource: Resource; changes: Partial<Resources>; source: string };
export type HouseState = {
  schemaVersion: 1; houseId: string; phase: 'draft' | 'review' | 'active'; creationStep: number;
  identity: { region: string; motto: string; foundation?: number | undefined; history: string[]; notes: string };
  method: 'budget' | 'roll' | 'import'; budget: number | null; base: Resources; permanent: Resources;
  regionalApplied: boolean; rolls: number[][]; domains: Domain[]; holdings: Holding[]; units: Unit[]; projects: Project[]; court: CourtMember[];
  month: number; treasury: number; fortunes: Fortune[]; actions: { month: number; type: string; notes: string }[];
  pending: string[]; importSources: string[];
};
export type Ledger = { id: string; action: string; explanation: string; campaignMonth: number; before: Resources; after: Resources; rule: string; key: string; createdAt?: string | undefined; actor?: string | undefined };
export type HouseDocument = { state: HouseState; version: number; ledger: Ledger[]; syncState: string };
export function newHouseState(houseId: string, region = ''): HouseState {
  return { schemaVersion: 1, houseId, phase: 'draft', creationStep: 0, identity: { region, motto: '', history: [], notes: '' }, method: 'budget', budget: null, base: zeroResources(), permanent: zeroResources(), regionalApplied: false, rolls: [], domains: [], holdings: [], units: [], projects: [], court: [], month: 1522 * 12, treasury: 0, fortunes: [], actions: [], pending: [], importSources: [] };
}