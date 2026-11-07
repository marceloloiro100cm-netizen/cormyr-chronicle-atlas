/** CRZ-1.0 · contrato experimental do manual 03 §§0–2.
 * Pacote puro isolado: não importar o motor PTE, React, Supabase ou relógio.
 * Valores 🔧 do manual são propostas e exigem calibração no documento 07.
 */
import {z} from 'zod';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';

export const CRZ_RULES_VERSION='CRZ-1.0' as const;
export const CRZ_SCHEMA_VERSION=1 as const;
export const crzPresetIdSchema=z.enum(['CRZ-5E','CRZ-WOTR','PTE-2.0-compat']);
export type CrzPresetId=z.infer<typeof crzPresetIdSchema>;
const nonnegative=z.number().int().min(0).max(1000000);
const positive=z.number().int().min(1).max(1000000);
const size=z.enum(['T','S','M','L','H','G']);
const sizeLimits=z.record(size,positive);
const cover=z.object({forest:nonnegative,hill:nonnegative}).strict();
export const crzRulesetSchema=z.object({
 id:crzPresetIdSchema,rulesVersion:z.literal(CRZ_RULES_VERSION),
 schemaVersion:z.literal(CRZ_SCHEMA_VERSION),
 grid:z.object({kind:z.enum(['hex','square']),sizes:z.array(z.tuple([positive,positive])).length(2)}).strict(),
 army:z.object({maxStacks:positive}).strict(),
 stack:z.object({maxCount:positive,maxCountBySize:sizeLimits}).strict(),
 battle:z.object({maxRounds:positive,stalemateRounds:positive}).strict(),
 initiative:z.object({
  formula:z.enum(['crz-dex','pte']),tiebreak:z.enum(['crz-dex','pte']),
 }).strict(),
 wait:z.object({order:z.enum(['reverse-initiative','fifo']),maxPerRound:positive}).strict(),
 defend:z.object({acBonus:nonnegative}).strict(),
 extraTurn:z.object({maxPerRound:nonnegative}).strict(),
 movement:z.object({feetPerHex:positive,maxBudget:positive,zocEnabled:z.boolean(),
  forestCost:positive,hillCost:positive,rockBlocks:z.boolean()}).strict(),
 ranged:z.object({engaged:z.enum(['penalty','forbidden']),engagedPenalty:nonnegative,
  longRangePenalty:nonnegative}).strict(),
 hit:z.object({model:z.enum(['d20','wotr-linear','pte-linear']),
  pMinBP:nonnegative,pMaxBP:z.union([nonnegative,z.null()]),
  critEnabled:z.boolean(),critBP:nonnegative,flankBonus:nonnegative,
  coverAcBonus:cover,coverDamageBP:cover}).strict(),
 damage:z.object({
  resolution:z.enum(['hybrid','rolled','expected','wotr']),
  hybridThreshold:positive,overkill:z.enum(['cap','carry','waste']),
  rounding:z.literal('floor'),mitigation:z.enum(['damage-type','flat-dr','armor-bp']),
  frontage:z.enum(['off','sqrt']),frontageRanks:positive,
  armorReductionStepBP:nonnegative,armorReductionMaxBP:nonnegative,
 }).strict(),
 training:z.record(z.enum(['green','trained','veteran','elite']),
  z.object({attack:z.number().int(),ac:z.number().int(),
   morale:z.number().int(),initiative:z.number().int()}).strict()),
 morale:z.object({numeric:z.boolean(),skipChance:z.boolean(),extraChance:z.boolean(),
  routByCasualties:z.boolean(),shakenPenalty:nonnegative,
  expectedIgnoresNumeric:z.boolean()}).strict(),
 leader:z.object({castsPerRound:nonnegative,regenPerRound:nonnegative,
  actsOnlyOnAlliedActivation:z.boolean()}).strict(),
 infirmary:z.object({enabled:z.boolean()}).strict(),
 ability:z.object({rechargeUsesPerBattle:nonnegative}).strict(),
}).strict();
export type CrzRuleset=z.infer<typeof crzRulesetSchema>;

const all1000={T:1000,S:1000,M:1000,L:1000,H:1000,G:1000};
const training={
 green:{attack:-1,ac:0,morale:-10,initiative:0},
 trained:{attack:0,ac:0,morale:0,initiative:0},
 veteran:{attack:1,ac:0,morale:10,initiative:1},
 elite:{attack:2,ac:1,morale:20,initiative:2},
};
const common={
 rulesVersion:CRZ_RULES_VERSION,schemaVersion:CRZ_SCHEMA_VERSION,
 grid:{kind:'hex',sizes:[[11,9],[15,11]]},
 stack:{maxCount:1000,maxCountBySize:{...all1000}},
 battle:{maxRounds:20,stalemateRounds:2},
 movement:{feetPerHex:10,maxBudget:6,zocEnabled:true,forestCost:2,
  hillCost:2,rockBlocks:true},
 wait:{order:'reverse-initiative',maxPerRound:1},
 extraTurn:{maxPerRound:1},
 ranged:{engaged:'penalty',engagedPenalty:4,longRangePenalty:4},
 hit:{model:'d20',pMinBP:500,pMaxBP:9500,critEnabled:true,critBP:500,
  flankBonus:2,coverAcBonus:{forest:2,hill:1},coverDamageBP:{forest:10000,hill:10000}},
 damage:{resolution:'hybrid',hybridThreshold:10,overkill:'cap',rounding:'floor',
  mitigation:'damage-type',frontage:'off',frontageRanks:2,
  armorReductionStepBP:0,armorReductionMaxBP:0},
 training,initiative:{formula:'crz-dex',tiebreak:'crz-dex'},
 morale:{numeric:true,skipChance:true,extraChance:true,
  routByCasualties:true,shakenPenalty:2,expectedIgnoresNumeric:true},
 leader:{castsPerRound:1,regenPerRound:0,actsOnlyOnAlliedActivation:true},
 infirmary:{enabled:false},ability:{rechargeUsesPerBattle:2},defend:{acBonus:4},
 army:{maxStacks:7},
};
function rawPreset(id:CrzPresetId,grid:'hex'|'square'='hex'):unknown{
 if(id==='CRZ-5E')return {...common,grid:{...common.grid,kind:grid},id,
  stack:{maxCount:1000,maxCountBySize:{T:1000,S:1000,M:1000,L:400,H:100,G:25}},
 };
 if(id==='CRZ-WOTR')return {...common,grid:{...common.grid,kind:grid},id,
  battle:{maxRounds:40,stalemateRounds:2},
  hit:{...common.hit,model:'wotr-linear',pMaxBP:null,critEnabled:false,critBP:0},
  damage:{...common.damage,resolution:'wotr',overkill:'carry',mitigation:'flat-dr'},
  morale:{...common.morale,routByCasualties:false},infirmary:{enabled:true},
 };
 return {...common,grid:{...common.grid,kind:grid},id,
  army:{maxStacks:5},initiative:{formula:'pte',tiebreak:'pte'},
  wait:{order:'fifo',maxPerRound:1},defend:{acBonus:2},
  extraTurn:{maxPerRound:0},
  ranged:{engaged:'forbidden',engagedPenalty:0,longRangePenalty:0},
  hit:{model:'pte-linear',pMinBP:6000,pMaxBP:14000,
   critEnabled:false,critBP:0,flankBonus:0,
   coverAcBonus:{forest:0,hill:0},coverDamageBP:{forest:8000,hill:9000}},
  damage:{...common.damage,resolution:'expected',overkill:'carry',
   mitigation:'armor-bp',armorReductionStepBP:400,armorReductionMaxBP:5000},
  morale:{numeric:false,skipChance:false,extraChance:false,
   routByCasualties:true,shakenPenalty:1,expectedIgnoresNumeric:true},
  leader:{castsPerRound:0,regenPerRound:0,actsOnlyOnAlliedActivation:true},
  ability:{rechargeUsesPerBattle:0},
 };
}
/** Entrada imutável na fronteira; não expõe um preset mutável compartilhado. */
export function crzPreset(id:CrzPresetId,grid:'hex'|'square'='hex'):CrzRuleset{
 return crzRulesetSchema.parse(rawPreset(id,grid));
}
function canonical(value:unknown):string{
 if(value===null)return 'null';
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value))throw new Error('E_OVERFLOW: número não inteiro/seguro.');
  return JSON.stringify(value);
 }
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(typeof value==='object'){
  return '{'+Object.entries(value as Record<string,unknown>)
   .filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)
   .map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 }
 throw new Error('Ruleset contém valor não serializável.');
}
export const crzCanonical=(value:unknown)=>canonical(value);
export const crzHash=(value:unknown)=>bytesToHex(sha256(utf8ToBytes(canonical(value))));
export const crzRulesetHash=(value:unknown):string=>crzHash(crzRulesetSchema.parse(value));
export const CRZ_PRESET_IDS=crzPresetIdSchema.options;
export const CRZ_APPROVED_HASHES=Object.freeze(
 Object.fromEntries(CRZ_PRESET_IDS.map(id=>[id,crzRulesetHash(crzPreset(id))]))
) as Readonly<Record<CrzPresetId,string>>;
/** Presets antigos conservam exatamente seus hashes; novos hashes square
 * são aceitos sem regravar replays ou alterar a identificação histórica.
 */
export const CRZ_SQUARE_HASHES=Object.freeze(
 Object.fromEntries(CRZ_PRESET_IDS.map(id=>[id,crzRulesetHash(crzPreset(id,'square'))]))
) as Readonly<Record<CrzPresetId,string>>;
export function crzRequireKnownRuleset(id:CrzPresetId,hash:string):CrzRuleset{
 const grid=hash===CRZ_APPROVED_HASHES[id]?'hex':
  hash===CRZ_SQUARE_HASHES[id]?'square':null;
 if(!grid)throw new Error('E_SETUP_RULESET: rulesetHash desconhecido.');
 return crzPreset(id,grid);
}
