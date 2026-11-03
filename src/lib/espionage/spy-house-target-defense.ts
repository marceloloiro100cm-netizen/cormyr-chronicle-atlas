/** Resolves the defense of a noble HOUSE, not a region.
 *
 * Rules approved by the Narrator (2026-11-03):
 *   - sheet exists -> convert effective Law to test DC + applicable active holdings;
 *   - no operational sheet -> convert imported official Law to test DC;
 *   - neither source -> regional Law +10 (fallback attribute), THEN convert to DC;
 *   - a simple regional recon -> region Law alone (public-strategy.ts).
 *
 * The presence of an imported authoritative record must be checked by a narrator-only RPC.
 * "No sheet" must be established by an authorized server-side existence query.
 * NEVER convert permission errors, malformed sheets or draft/review phases into
 * NPC fallback. This module does NOT return defense to an attacking player.
 */
import {regionBonus,regionId} from '@/lib/house/regions';
import type {HouseState} from '@/lib/house/types';
import {calculateSpyDefense} from './spy-defense';
import {spyLawDifficulty} from './spy-law-difficulty';

export const UNFICHED_NOBLE_HOUSE_LAW_BONUS=10;

export type SpyHouseDefenseRequest=
 |{kind:'with_sheet';state:HouseState;region:string;domainId?:string}
 |{kind:'with_imported_stats';region:string;importedLaw:number;sourceRow:number}
 |{kind:'without_sheet';region:string};

export type SpyHouseDefenseResolution={
 source:'own_house_sheet'|'imported_noble_sheet'|'regional_npc_fallback';
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
 if(input.kind==='with_imported_stats'){
  if(!Number.isSafeInteger(input.importedLaw)||input.importedLaw<0||
     input.importedLaw>100000||!Number.isInteger(input.sourceRow)||input.sourceRow<2)
   throw new Error('Lei importada inválida ou sem proveniência de linha da planilha.');
  return {source:'imported_noble_sheet',law:input.importedLaw,
   regionalLaw:null,baseDifficulty:spyLawDifficulty(input.importedLaw),constructionBonus:0,
   difficulty:spyLawDifficulty(input.importedLaw),domainId:null,sources:[]};
 }
 if(input.kind==='without_sheet'){
  const regionalLaw=regionBonus(id).law;
  if(!Number.isFinite(regionalLaw)||regionalLaw<0)
   throw new Error('Lei regional ausente ou inválida.');
  const law=regionalLaw+UNFICHED_NOBLE_HOUSE_LAW_BONUS;
  return {source:'regional_npc_fallback',law,regionalLaw,
   baseDifficulty:spyLawDifficulty(law),constructionBonus:0,difficulty:spyLawDifficulty(law),
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
  baseDifficulty:profile.baseDifficulty,constructionBonus,
  difficulty:profile.baseDifficulty+constructionBonus,
  domainId:input.domainId??null,sources};
}
