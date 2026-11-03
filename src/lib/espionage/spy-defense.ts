/**
 * Defensive difficulty for hostile infiltration/detection, as quoted by the
 * authoritative Prosperity catalog's Spy Network.
 *
 *  House espionage difficulty: convert OWN effective Law into a test DC.
 *  Law <=30: DC 6; +3 per five COMPLETE Law above 30.
 *  THEN add applicable holdings. Law points are NEVER the DC itself.
 *  Do not add regional Law bonuses to a House with its own sheet.
 *  Guard Dogs: +3 against infiltrators across the House's domains
 *  Bailiffs Investigative Training: +3 in their designated domain
 *  Secret Police: +6 across the House's territory
 *  Ear in the Underworld: +3 vs subversive agents against the House
 *
 * These are check difficulties, NOT %-success, intrigue defense, or an
 * increase to the House's Law resource. Other benefits remain separate.
 * A building is active only if all its parent holdings are active.
 */
import {balances,activeHoldings} from '@/lib/house/engine';
import type {HouseState,Holding} from '@/lib/house/types';
import {spyLawDifficulty} from './spy-law-difficulty';

export const SPY_HOLDING_IDS=[
 'pros-spy-network','pros-spy-network--expanded-network',
 'pros-spy-network--expert-spies','pros-spy-network--plausible-deniability',
 'pros-secret-police','pros-secret-police--special-detachment',
 'pros-bailiffs','pros-bailiffs--investigative-training',
 'pros-dog-kennels','pros-dog-kennels--guard-dogs',
 'pros-black-market','pros-black-market--ear-in-the-underworld',
 'pros-street-gangs','pros-street-gangs--eyes-everywhere',
] as const;
export const SPY_HOLDING_ID_SET=new Set<string>(SPY_HOLDING_IDS);

export type SpyDefenseSource={
 itemId:string;holdingId:string;name:string;domainId:string|null;
 bonus:number;description:string;
};
export type SpyDefenseDomain={
 domainId:string;name:string;difficulty:number;localBonuses:number;
 sources:SpyDefenseSource[];
};
export type SpyDefenseProfile={
 law:number;baseDifficulty:number;globalBonuses:number;
 spyCellDiscoveryDifficulty:number;
 globalSources:SpyDefenseSource[];
 domains:SpyDefenseDomain[];
 otherEffects:{name:string;description:string}[];
};

const bonusRules:Record<string,{bonus:number;description:string;scope:'house'|'domain'}>={
 'pros-dog-kennels--guard-dogs':{
  bonus:3,description:'Cães de Guarda: dificuldade de Astúcia de espiões +3 em todos os domínios',scope:'house',
 },
 'pros-bailiffs--investigative-training':{
  bonus:3,description:'Treinamento Investigativo: dificuldade de Astúcia de agentes inimigos +3 na área',scope:'domain',
 },
 'pros-secret-police':{
  bonus:6,description:'Polícia Secreta: dificuldade de Astúcia de agentes hostis +6 nos domínios da Casa',scope:'house',
 },
 'pros-black-market--ear-in-the-underworld':{
  bonus:3,description:'Ouvido no Submundo: dificuldade de Astúcia de agentes subversivos +3 contra a Casa',scope:'house',
 },
};
const otherEffects={
 'pros-spy-network--expert-spies':'-1D em testes de Astúcia de inimigos para detectar os espiões da Casa; não aumenta a dificuldade de infiltrar esta Casa.',
 'pros-spy-network--plausible-deniability':'Falha de seus agentes não expõe a Casa nem reduz Influência; não modifica a dificuldade de espioná-la.',
 'pros-secret-police':'Além do bônus de dificuldade +6 já contado, concede Contatos em todos os domínios da Casa e reduz em 1 a penalidade de Sorte da Casa causada por População muito alta ou baixa. Não aumenta o atributo Lei.',
} as const;

/** Historical name retained for existing consumers of the discovery test. */
export function spyDiscoveryBaseDifficulty(law:number):number{
 return spyLawDifficulty(law);
}

function defenseSources(holdings:Holding[]){
 const seen=new Set<string>();
 const result:SpyDefenseSource[]=[];
 for(const h of holdings){
  const rule=bonusRules[h.itemId];if(!rule)continue;
  const key=rule.scope==='house'?h.itemId:h.itemId+':'+h.domainId;
  if(seen.has(key))continue;
  seen.add(key);
  result.push({itemId:h.itemId,holdingId:h.id,name:h.name,
   domainId:rule.scope==='house'?null:h.domainId,bonus:rule.bonus,description:rule.description});
 }
 return result;
}

/** The caller must use the own-house, authorized sheet; never pass a target
 * House sheet to a player who does not have access to it.
 */
export function calculateSpyDefense(state:HouseState):SpyDefenseProfile{
 const law=balances(state).total.law;
 // Convert the target's own Law into the book's test DC before bonuses.
 // Regional Law is only applicable to regional reconnaissance without a House.
 const baseDifficulty=spyLawDifficulty(law);
 const active=activeHoldings(state);
 const sources=defenseSources(active);
 const globalSources=sources.filter(source=>source.domainId===null);
 const globalBonuses=globalSources.reduce((sum,item)=>sum+item.bonus,0);
 const domains=state.domains.map(domain=>{
  const local=sources.filter(source=>source.domainId===domain.id);
  const localBonuses=local.reduce((sum,item)=>sum+item.bonus,0);
  return {domainId:domain.id,name:domain.name,
   difficulty:baseDifficulty+globalBonuses+localBonuses,
   localBonuses,sources:local,
  };
 });
 const other=active.filter(h=>h.itemId in otherEffects).map(h=>({
  name:h.name,description:otherEffects[h.itemId as keyof typeof otherEffects],
 }));
 return {law,baseDifficulty,globalBonuses,globalSources,
  spyCellDiscoveryDifficulty:spyDiscoveryBaseDifficulty(law),
  domains,otherEffects:other};
}
