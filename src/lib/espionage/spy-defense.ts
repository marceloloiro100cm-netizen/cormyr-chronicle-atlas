/**
 * Defensive difficulty for hostile infiltration/detection, as quoted by the
 * authoritative Prosperity catalog's Spy Network.
 *
 *  Law <=30: difficulty 6; each COMPLETE 5 Law above 30: +3.
 *  Guard Dogs: +3 in their domain
 *  Bailiffs Investigative Training: +3 in their designated domain
 *  Ear in the Underworld: +3 vs subversive agents against the House
 *
 * These are check difficulties, NOT %-success, intrigue defense, or an
 * increase to the House's Law resource. Other benefits remain separate.
 * A building is active only if all its parent holdings are active.
 */
import {balances,activeHoldings} from '@/lib/house/engine';
import type {HouseState,Holding} from '@/lib/house/types';

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
 globalSources:SpyDefenseSource[];
 domains:SpyDefenseDomain[];
 otherEffects:{name:string;description:string}[];
};

const bonusRules:Record<string,{bonus:number;description:string;scope:'house'|'domain'}>={
 'pros-dog-kennels--guard-dogs':{
  bonus:3,description:'Cães de Guarda: dificuldade de Astúcia de espiões +3',scope:'domain',
 },
 'pros-bailiffs--investigative-training':{
  bonus:3,description:'Treinamento Investigativo: dificuldade de Astúcia de agentes inimigos +3 na área',scope:'domain',
 },
 'pros-black-market--ear-in-the-underworld':{
  bonus:3,description:'Ouvido no Submundo: dificuldade de Astúcia de agentes subversivos +3 contra a Casa',scope:'house',
 },
};
const otherEffects={
 'pros-spy-network--expert-spies':'-1D em testes de Astúcia de inimigos para detectar os espiões da Casa; não aumenta a dificuldade de infiltrar esta Casa.',
 'pros-spy-network--plausible-deniability':'Falha de seus agentes não expõe a Casa nem reduz Influência; não modifica a dificuldade de espioná-la.',
 'pros-secret-police':'Os ganhos/mitigações de Lei seguem suas próprias regras do sistema; não acrescentar o bônus novamente à Lei efetiva.',
} as const;

export function spyDiscoveryBaseDifficulty(law:number):number{
 if(!Number.isFinite(law))throw new Error('Valor de Lei inválido.');
 // A source says +3 per 5 Law above 30: use FULL groups, not a fraction.
 return 6+3*Math.floor(Math.max(0,law-30)/5);
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
 const baseDifficulty=spyDiscoveryBaseDifficulty(law);
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
  domains,otherEffects:other};
}
