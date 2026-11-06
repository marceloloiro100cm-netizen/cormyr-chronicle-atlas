/** CRZ-1.0 · validação de setup e implantação; manual 03 §3.
 * Exércitos oficiais continuam bloqueados pelo conversor do Lote 3.
 */
import {z} from 'zod';
import {crzPrepareArmy,crzArmySetupSchema,type CrzPreparedStack} from './convert';
import {crzMapSchema,crzValidateMap,crzHexKey,crzAxialToOffset,
 type CrzMap,type CrzHex,type CrzSide} from './geometry';
import {crzPresetIdSchema,crzRequireKnownRuleset,type CrzPresetId,type CrzRuleset} from './ruleset';
import {crzPcg32,type CrzRngState} from './rng';
import type {CrzCatalog} from './catalog';

export const crzSpellIdSchema=z.enum([
 'bless','bane','shield_of_faith','heroism','cause_fear','cure_wounds',
 'firebolt','fireball','hold','slow','shield_wall_formation','volley_order',
]);
export type CrzSpellId=z.infer<typeof crzSpellIdSchema>;
export const crzLeaderSetupSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
 name:z.string().trim().min(1).max(120),
 level:z.number().int().min(1).max(20),
 abilityMod:z.number().int().min(-5).max(15).default(0),
 attackBonus:z.number().int().min(-20).max(20).default(0),
 defenseBonus:z.number().int().min(-20).max(20).default(0),
 initBonus:z.number().int().min(-20).max(20).default(0),
 moraleAura:z.number().int().min(-100).max(100).default(0),
 spells:z.array(crzSpellIdSchema).max(12).default([]),
}).strict();
export type CrzLeaderSetup=z.input<typeof crzLeaderSetupSchema>;
export type CrzLeader=Readonly<{
 id:string;side:CrzSide;name:string;level:number;power:number;
 energy:number;energyMax:number;attackBonus:number;defenseBonus:number;
 initBonus:number;moraleAura:number;spells:readonly CrzSpellId[];
 spellsCastThisRound:number;
}>;
export const crzBattleSetupSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
 name:z.string().trim().min(1).max(120),
 seed:z.string().regex(/^[a-fA-F0-9]{1,16}$/),
 rulesetId:crzPresetIdSchema,
 rulesetHash:z.string().regex(/^[a-f0-9]{64}$/),
 resolution:z.enum(['expected','rolled','hybrid']),
 map:crzMapSchema,
 armies:z.object({
  attacker:crzArmySetupSchema,
  defender:crzArmySetupSchema,
 }).strict(),
 controls:z.object({
  attacker:z.enum(['human','ai']),
  defender:z.enum(['human','ai']),
 }).strict(),
 leaders:z.object({
  attacker:crzLeaderSetupSchema.nullable(),
  defender:crzLeaderSetupSchema.nullable(),
 }).strict().optional(),
}).strict();
export type CrzBattleSetup=z.input<typeof crzBattleSetupSchema>;
export type CrzReadyStack=CrzPreparedStack&Readonly<{position:CrzHex}>;
export type CrzReady=Readonly<{
 phase:'ready';rulesVersion:'CRZ-1.0';schemaVersion:1;
 id:string;name:string;seed:string;
 rulesetId:CrzPresetId;rulesetHash:string;
 ruleset:CrzRuleset;resolution:'expected'|'rolled'|'hybrid';
 map:CrzMap;stacks:readonly CrzReadyStack[];
 leaders:Readonly<Record<CrzSide,CrzLeader|null>>;
 controls:Readonly<Record<CrzSide,'human'|'ai'>>;
 rngState:CrzRngState;warnings:readonly string[];
}>;
function buildLeader(raw:CrzLeaderSetup|null|undefined,side:CrzSide):CrzLeader|null{
 if(!raw)return null;
 const v=crzLeaderSetupSchema.parse(raw),power=Math.max(1,v.level+v.abilityMod);
 const energyMax=10+3*v.level;
 return {id:v.id,side,name:v.name,level:v.level,power,energy:energyMax,
  energyMax,attackBonus:v.attackBonus,defenseBonus:v.defenseBonus,
  initBonus:v.initBonus,moraleAura:v.moraleAura,spells:v.spells,
  spellsCastThisRound:0};
}
function orderedZones(map:CrzMap,side:CrzSide):{
 front:readonly CrzHex[];rear:readonly CrzHex[];
}{
 const middle=Math.floor(map.height/2);
 const compare=(a:CrzHex,b:CrzHex)=>{
  const ar=crzAxialToOffset(a),br=crzAxialToOffset(b);
  return Math.abs(ar.row-middle)-Math.abs(br.row-middle)||
   ar.row-br.row||ar.column-br.column;
 };
 const zone=[...map.deployment[side]];
 zone.sort((a,b)=>{
  const aa=crzAxialToOffset(a).column,bb=crzAxialToOffset(b).column;
  return (side==='attacker'?bb-aa:aa-bb)||compare(a,b);
 });
 const pivot=side==='attacker'?1:map.width-2;
 return {front:zone.filter(h=>crzAxialToOffset(h).column===pivot).sort(compare),
  rear:zone.filter(h=>crzAxialToOffset(h).column!==pivot).sort(compare)};
}
function deploy(map:CrzMap,stacks:readonly CrzPreparedStack[]):CrzReadyStack[]{
 const occupied=new Set<string>();
 for(const stack of stacks){
  if(!stack.position)continue;
  const key=crzHexKey(stack.position);
  if(!map.deployment[stack.side].some(h=>crzHexKey(h)===key))
   throw new Error('E_SETUP_ZONE: posição fora da implantação: '+stack.id);
  if(occupied.has(key))throw new Error('E_SETUP_DUP: posição repetida: '+key);
  occupied.add(key);
 }
 const result:CrzReadyStack[]=[];
 for(const side of ['attacker','defender'] as const){
  const zone=orderedZones(map,side);
  for(const stack of stacks.filter(s=>s.side===side)){
   const candidates=stack.rangedRoutine&&!stack.meleeRoutine?
    [...zone.rear,...zone.front]:[...zone.front,...zone.rear];
   const position=stack.position??candidates.find(h=>!occupied.has(crzHexKey(h)));
   if(!position)throw new Error('E_SETUP_ZONE: implantação sem vagas.');
   occupied.add(crzHexKey(position));
   result.push({...stack,position});
  }
 }
 return result;
}
export function crzPrepareBattle(raw:unknown,catalog:CrzCatalog):CrzReady{
 const input=crzBattleSetupSchema.parse(raw),ruleset=crzRequireKnownRuleset(
  input.rulesetId,input.rulesetHash);
 if(input.armies.attacker.side!=='attacker'||input.armies.defender.side!=='defender')
  throw new Error('E_SETUP_SOURCE: lados dos exércitos inconsistentes.');
 const map=crzValidateMap(input.map);
 const leaders={
  attacker:buildLeader(input.leaders?.attacker,'attacker'),
  defender:buildLeader(input.leaders?.defender,'defender'),
 };
 const armies=(['attacker','defender'] as const).map(side=>{
  const leader=leaders[side];
  return crzPrepareArmy({catalog,ruleset,setup:{
   ...input.armies[side],
   ...(leader?{leaderModifiers:{
    attackBonus:leader.attackBonus,initBonus:leader.initBonus,
    moraleAura:leader.moraleAura,
   }}:{}),
  }});
 });
 const stacks=deploy(map,armies.flatMap(a=>a.stacks));
 const ids=new Set(stacks.map(s=>s.id));
 if(ids.size!==stacks.length)throw new Error('E_SETUP_DUP: ID global duplicado.');
 if(input.resolution==='rolled'||input.resolution==='hybrid'){
  if(input.rulesetId==='PTE-2.0-compat')
   throw new Error('E_SETUP_RULESET: PTE exige expected.');
 }
 return {phase:'ready',id:input.id,name:input.name,seed:input.seed,
  rulesVersion:'CRZ-1.0',schemaVersion:1,rulesetId:input.rulesetId,
  rulesetHash:input.rulesetHash,ruleset,resolution:input.resolution,
  map,stacks,leaders,controls:input.controls,rngState:crzPcg32(input.seed).state(),
  warnings:armies.flatMap(a=>a.warnings)};
}
