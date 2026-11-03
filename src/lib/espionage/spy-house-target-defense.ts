/** Resolves the defense of a noble HOUSE, not a region.
 *
 * Rules approved by the Narrator (2026-11-03):
 *   - sheet exists -> effective Law of that house + applicable active holdings;
 *   - no sheet exists -> official region's Law bonus + fixed 10 NPC baseline;
 *   - a simple regional recon -> region Law alone (public-strategy.ts).
 *
 * "No sheet" must be established by an authorized server-side existence query.
 * NEVER convert permission errors, malformed sheets or draft/review phases into
 * NPC fallback. This module does NOT return defense to an attacking player.
 */
import {regionBonus,regionId} from '@/lib/house/regions';
import type {HouseState} from '@/lib/house/types';
import {calculateSpyDefense} from './spy-defense';

export const UNFICHED_NOBLE_HOUSE_LAW_BONUS=10;

export type SpyHouseDefenseRequest=
 |{kind:'with_sheet';state:HouseState;region:string;domainId?:string}
 |{kind:'without_sheet';region:string};

export type SpyHouseDefenseResolution={
 source:'own_house_sheet'|'regional_npc_fallback';
 law:number;
 regionalLaw:number|null;
 baseDifficulty:number;
 constructionBonus:number;
 difficulty:number;
 domainId:string|null;
 sources:{name:string;bonus:number;description:string}[];
};

export function resolveSpyHouseDefense(input:SpyHouseDefenseRequest):SpyHouseDefenseResolution{
 const id=regionId(input.region);
 if(!id)throw new Error('A Casa não tem região oficial reconhecida. O Narrador deve revisar o cadastro.');
 if(input.kind==='without_sheet'){
  const regionalLaw=regionBonus(id).law;
  if(!Number.isFinite(regionalLaw)||regionalLaw<0)
   throw new Error('Lei regional ausente ou inválida.');
  const law=regionalLaw+UNFICHED_NOBLE_HOUSE_LAW_BONUS;
  return {source:'regional_npc_fallback',law,regionalLaw,
   baseDifficulty:law,constructionBonus:0,difficulty:law,
   domainId:null,sources:[]};
 }
 if(!input.state||typeof input.state!=='object')
  throw new Error('Ficha declarada mas não carregada: não utilizar defesa NPC.');
 const profile=calculateSpyDefense(input.state);
 const local=input.domainId===undefined?null:profile.domains.find(d=>d.domainId===input.domainId);
 if(input.domainId!==undefined&&!local)
  throw new Error('Domínio não encontrado na ficha da Casa.');
 const sources=[...profile.globalSources,...(local?.sources??[])].map(x=>({
  name:x.name,bonus:x.bonus,description:x.description,
 }));
 const constructionBonus=profile.globalBonuses+(local?.localBonuses??0);
 return {source:'own_house_sheet',law:profile.law,regionalLaw:null,
  baseDifficulty:profile.law,constructionBonus,
  difficulty:profile.law+constructionBonus,
  domainId:input.domainId??null,sources};
}
