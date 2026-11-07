import { z } from 'zod';
import type { BattleMap, BattleStack, BattleState, Control, Hex, Side, Training } from './types';
import { tacticalProfile, TRAINING_BONUS } from './profiles-v2';
import { BATTLE_RULES } from './rulebook-v2';
import { validateBattleMap } from '../geometry/map-validation';
import { hexKey } from '../geometry/hex';

const hexSchema=z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict();
const sideSchema=z.enum(['attacker','defender']);
const terrainSchema=z.enum(['plain','forest','hill','rock']);
const trainingSchema=z.enum(['green','trained','veteran','elite']);
const sourceSchema=z.object({kind:z.literal('fictional')}).strict();
const officialSourceSchema=z.object({
 kind:z.literal('house-readonly'),
 houseId:z.string().min(1).max(100),unitId:z.string().min(1).max(90),
 sourceVersion:z.number().int().min(0),
 sourceCapturedAt:z.string().datetime(),
 officialHealth:z.number().int().min(0),officialMaxHealth:z.number().int().min(1),
 warnings:z.array(z.string().max(600)).max(35),
}).strict();
const tileSchema=hexSchema.extend({terrain:terrainSchema});
export const battleMapSchema=z.object({
  id:z.string().min(1).max(80),schemaVersion:z.literal(2),width:z.union([z.literal(11),z.literal(15)]),
  height:z.union([z.literal(9),z.literal(11)]),
  grid:z.literal('square').optional(),
  label:z.string().min(1).max(120),
  tiles:z.array(tileSchema).max(165),
  deployment:z.object({attacker:z.array(hexSchema).max(165),defender:z.array(hexSchema).max(165)}).strict(),
}).strict();
export const fictionalStackSchema=z.object({
  id:z.string().min(1).max(80),side:sideSchema,name:z.string().trim().min(1).max(120),
  primaryTypeId:z.string().min(1),originalTypeIds:z.array(z.string()).min(1).max(1),
  training:trainingSchema,source:sourceSchema,
  initialCount:z.number().int().min(1).max(BATTLE_RULES.maxCountPerStack),
  currentHp:z.number().int().min(1).max(100000),hpPerSoldier:z.number().int().min(1).max(100),
  damagePerSoldier:z.number().int().min(1),attack:z.number().int().min(0).max(15),
  defense:z.number().int().min(0).max(15),armor:z.number().int().min(0).max(10),
  movementHex:z.number().int().min(1).max(6),rangeHex:z.number().int().min(1).max(6),
  moraleTypeModifier:z.number().int().min(-10).max(10),moraleState:z.literal('steady'),
  position:hexSchema,movedThisActivation:z.literal(false),attackedThisActivation:z.literal(false),
  waitedThisRound:z.literal(false),defenseGuard:z.literal(false),retaliationUsedRound:z.null(),
  appliedEffectIds:z.array(z.string()).length(0),
}).strict();
export const officialStackSchema=fictionalStackSchema
 .omit({source:true,originalTypeIds:true,appliedEffectIds:true})
 .extend({
  source:officialSourceSchema,originalTypeIds:z.array(z.string()).min(1).max(17),
  appliedEffectIds:z.array(z.string()).max(100),
  profileDecisionReason:z.string().max(500).optional(),
 }).strict();
export const battleDraftSchema=z.object({
  id:z.string().min(1).max(80),name:z.string().trim().min(1).max(120),schemaVersion:z.literal(2),
  rulesVersion:z.literal('PTE-2.0'),seed:z.string().min(1).max(128),
  map:battleMapSchema,
  controls:z.object({attacker:z.enum(['human','ai']),defender:z.enum(['human','ai'])}).strict(),
  stacks:z.array(z.union([fictionalStackSchema,officialStackSchema])).min(2).max(10),
}).strict();
export type BattleDraft = z.infer<typeof battleDraftSchema>;

export function makeFictionalStack(input:{
  id:string;side:Side;name:string;typeId:string;training:Training;count:number;position:Hex;
}):BattleStack {
  if(!Number.isSafeInteger(input.count)||input.count<1||input.count>BATTLE_RULES.maxCountPerStack)
    throw new Error('Efetivo fictício deve ser inteiro de 1 até 1000.');
  const profile=tacticalProfile(input.typeId);
  const bonus=TRAINING_BONUS[input.training];
  if(bonus===undefined)throw new Error('Treinamento desconhecido.');
  const stack:BattleStack={
    id:input.id,side:input.side,name:input.name,primaryTypeId:profile.id,
    originalTypeIds:[profile.id],training:input.training,source:{kind:'fictional'},
    initialCount:input.count,currentHp:input.count*profile.hpPerSoldier,
    hpPerSoldier:profile.hpPerSoldier,damagePerSoldier:profile.damagePerSoldier,
    attack:profile.attackBase+bonus,defense:profile.defenseBase+bonus,
    armor:profile.armorBase,movementHex:profile.movementHex,rangeHex:profile.rangeHex,
    moraleTypeModifier:profile.moraleModifier,moraleState:'steady',position:input.position,
    movedThisActivation:false,attackedThisActivation:false,waitedThisRound:false,
    defenseGuard:false,retaliationUsedRound:null,appliedEffectIds:[],
  };
  fictionalStackSchema.parse(stack);
  return stack;
}
export function validateBattleDraft(draft:unknown):BattleDraft {
  const result=battleDraftSchema.parse(draft);
  const issues=validateBattleMap(result.map);
  if(issues.length)throw new Error('Mapa inválido: '+issues.join('; '));
  const ids=new Set<string>(),positions=new Set<string>();
  for(const side of ['attacker','defender'] as const){
    const army=result.stacks.filter(s=>s.side===side);
    if(army.length<1||army.length>BATTLE_RULES.maxStacksPerSide)throw new Error('Cada exército deve ter entre 1 e 5 agrupamentos.');
  }
  const origin=new Set<string>();
  for(const s of result.stacks){
    if(ids.has(s.id))throw new Error('IDs de agrupamento duplicados.');
    ids.add(s.id);
    const pos=hexKey(s.position);if(positions.has(pos))throw new Error('Agrupamentos não podem sobrepor hexágonos.');
    positions.add(pos);
    const profile=tacticalProfile(s.primaryTypeId);
    if(!s.originalTypeIds.includes(profile.id))throw new Error('Perfil e tipos incompatíveis.');
    if(s.source.kind==='house-readonly'){
      const sourceKey=s.source.houseId+':'+s.source.unitId;
      if(origin.has(sourceKey))throw new Error('A mesma unidade oficial não pode integrar duas forças.');
      origin.add(sourceKey);
      if(s.originalTypeIds.length>1&&(!('profileDecisionReason' in s)||typeof s.profileDecisionReason!=='string'||s.profileDecisionReason.trim().length<12))
        throw new Error('Tipo misto exige justificativa de perfil.');
      if(s.initialCount*s.hpPerSoldier!==s.currentHp||s.hpPerSoldier!==profile.hpPerSoldier||
        s.damagePerSoldier!==profile.damagePerSoldier||s.rangeHex!==profile.rangeHex||
        s.moraleTypeModifier!==profile.moraleModifier||s.attack>15||s.defense>15)
        throw new Error('Snapshot importado com atributos inconsistentes.');
    }
    if(s.source.kind==='fictional'&&(s.hpPerSoldier!==profile.hpPerSoldier||s.damagePerSoldier!==profile.damagePerSoldier||
       s.initialCount*profile.hpPerSoldier!==s.currentHp||
       s.attack!==profile.attackBase+TRAINING_BONUS[s.training]||
       s.defense!==profile.defenseBase+TRAINING_BONUS[s.training]||
       s.armor!==profile.armorBase||s.movementHex!==profile.movementHex||
       s.rangeHex!==profile.rangeHex||s.moraleTypeModifier!==profile.moraleModifier))
      throw new Error('Atributos fictícios incompatíveis com PTE-2.0.');
    const zone=result.map.deployment[s.side].some(h=>hexKey(h)===pos);
    if(!zone)throw new Error('Unidade fora da sua zona de implantação.');
  }
  return result;
}
export function parseBattleDraftJson(json:string):BattleDraft {
  if(json.length>250_000)throw new Error('Arquivo de simulação excede 250 KB.');
  return validateBattleDraft(JSON.parse(json) as unknown);
}
export type BattleDraftInput = Readonly<Pick<BattleState, 'id' | 'name' | 'schemaVersion' | 'rulesVersion' | 'seed' | 'map' | 'controls' | 'stacks'>>;
export function serializeBattleDraft(draft:BattleDraftInput):string {
  return JSON.stringify(validateBattleDraft(draft));
}
export function makeBattleSetup(input:{id:string;name:string;seed:string;map:BattleMap;controls:Record<Side,Control>;stacks:BattleStack[]}):BattleState {
  const draft=validateBattleDraft({...input,schemaVersion:2,rulesVersion:'PTE-2.0'});
  const stacks:BattleStack[]=draft.stacks.map(s=>{const {profileDecisionReason,...rest}=s as typeof s & {profileDecisionReason?:string};return {...rest,...(typeof profileDecisionReason==='string'?{profileDecisionReason}:{})};});
  return {...draft,stacks,phase:'ready',rngAlgorithm:'none-PTE-2.0',round:0,
    activationQueue:[],waitingQueue:[],activeUnitId:null,noProgressRounds:0,events:[],winner:null};
}
