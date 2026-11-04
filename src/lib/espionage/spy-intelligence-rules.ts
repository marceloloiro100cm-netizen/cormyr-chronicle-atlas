/** Rules shared by the mission form and the future Dossier view.
 * Degrees are derived only from an adjudicated positive margin; the
 * mission engine and its difficulty remain the single source of truth.
 */
export const SPY_INTELLIGENCE_OBJECTIVES=[
 {id:'house_resources',label:'Recursos da Casa',description:'Sete atributos da Casa nobre.'},
 {id:'army',label:'Exército',description:'Unidades militares da Casa investigada.'},
 {id:'possessions',label:'Posses',description:'Construções, terras e propriedades adquiridas.'},
] as const;
export type SpyIntelligenceObjective=typeof SPY_INTELLIGENCE_OBJECTIVES[number]['id'];
export const SPY_INTELLIGENCE_RESOURCE_KEYS=[
 'defense','influence','lands','law','power','population','wealth',
] as const;
export type SpyIntelligenceResource=typeof SPY_INTELLIGENCE_RESOURCE_KEYS[number];

/** Basic success 3, plus one for each full 5 points ABOVE difficulty, max +4. */
export function spyIntelligenceCapacity(positiveMargin:number):number{
 if(!Number.isFinite(positiveMargin)||positiveMargin<0)
  throw new Error('Margem de sucesso inválida');
 return 3+Math.min(4,Math.floor(positiveMargin/5));
}

/** Unique discoveries first; overflow may refresh known entries.
 * Never guesses how many army units/holdings the target has.
 */
export function spyIntelligenceAllocation(
 discoveredKeys:readonly string[],availableKeys:readonly string[],capacity:number,
):{newKeys:string[];refreshKeys:string[]}{
 if(!Number.isInteger(capacity)||capacity<0||capacity>7)
  throw new Error('Capacidade de descoberta inválida');
 const known=new Set(discoveredKeys);
 const eligible=[...new Set(availableKeys)];
 const newKeys=eligible.filter(key=>!known.has(key)).slice(0,capacity);
 const refreshKeys=eligible.filter(key=>known.has(key))
  .slice(0,capacity-newKeys.length);
 return {newKeys,refreshKeys};
}
