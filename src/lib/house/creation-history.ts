import { RESOURCE_KEYS, zeroResources, type Resource, type Resources, type HouseState } from './types';
import { FOUNDATIONS, regionBonus } from './regions';

export type HistoricalRoll = {
  id: string;
  dice: number[];
  result: number;
  name: string;
  changes: Partial<Resources>;
  modifierDice: Partial<Record<Resource, number[]>>;
};
export type CreationHistory = {
  foundationDice: [number, number];
  foundationRoll: number;
  eventCountRoll: number;
  limit: number;
  events: HistoricalRoll[];
  applied: boolean;
};
export const HISTORY_TABLE: Readonly<Record<number, string>> = {
  3:'Derrocada', 4:'Derrota', 5:'Catástrofe', 6:'Loucura',
  7:'Invasão/Revolta', 8:'Escândalo', 9:'Traição', 10:'Declínio',
  11:'Infraestrutura', 12:'Ascensão', 13:'Favorecimento', 14:'Vitória',
  15:'Vilão', 16:'Glória', 17:'Conquista', 18:'Ventura',
};
const all=[...RESOURCE_KEYS];
const minus:Partial<Record<number, Resource[]>>={
  4:['defense','influence','power','population','wealth','lands'],
  5:['law','power','population','wealth'],
  8:['influence','power','wealth','lands'],
  10:['influence','power','wealth','lands'],
};
const plus:Partial<Record<number, Resource[]>>={
  12:['influence','lands','power','wealth'],
  13:['influence','lands','law','power'],
  14:['defense','influence','power'],
  16:['defense','influence','law','power'],
};
function die(roll:()=>number):number {
  const result=roll();
  if(!Number.isInteger(result)||result<1||result>6)throw new Error('RNG 1d6 inválido.');
  return result;
}
export function rollFoundation(roll:()=>number):CreationHistory {
  const foundationRoll=die(roll),eventCountRoll=die(roll);
  const offset=[3,2,1,0,-1,-2][foundationRoll-1]??0;
  return {
    foundationDice:[foundationRoll,eventCountRoll],
    foundationRoll,eventCountRoll,
    limit:Math.max(1,eventCountRoll+offset),
    events:[],applied:false,
  };
}
export function rollHistoricalEvent(roll:()=>number,choices:[Resource,Resource],id:string):HistoricalRoll {
  const dice=[die(roll),die(roll),die(roll)];
  const result=dice.reduce((n,v)=>n+v,0);
  const changes:Partial<Resources>={},modifierDice:Partial<Record<Resource,number[]>>={};
  const add=(resources:Resource[],count:number,sign:1|-1)=>{
    for(const resource of resources){
      const rolled=Array.from({length:count},()=>die(roll));
      modifierDice[resource]=rolled;
      changes[resource]=(changes[resource]??0)+rolled.reduce((sum,v)=>sum+v,0)*sign;
    }
  };
  if(result===3)add(all,2,-1);
  if(minus[result])add(minus[result],1,-1);
  if(result===6){
    for(const resource of all){
      const rolled=[die(roll),die(roll)];modifierDice[resource]=rolled;
      changes[resource]=6-rolled.reduce((sum,v)=>sum+v,0);
    }
  }
  if(result===7){add(['law'],2,-1);add(['power','population','wealth'],1,-1);}
  if(result===9){add(['influence','law'],1,-1);add(['power'],1,1);}
  if(result===11){
    if(choices[0]===choices[1]||!all.includes(choices[0])||!all.includes(choices[1]))
      throw new Error('Infraestrutura exige dois recursos diferentes.');
    add(choices,1,1);
  }
  if(plus[result])add(plus[result],1,1);
  if(result===15){add(['influence','power'],1,1);add(['law','population'],1,-1);}
  if(result===17){add(['influence','law','population'],1,-1);add(['defense','lands','power','wealth'],1,1);}
  if(result===18){add(['wealth'],2,1);add(['defense','influence','lands','law','population'],1,1);}
  return {id,dice,result,name:HISTORY_TABLE[result]??'Desconhecido',changes,modifierDice};
}

/** Compute historic modifiers in order, applying the zero floor after each event.
 * Never mutate original rolls, historical imports, or permanent resources here. */
export function historyAdjustments(state:HouseState):Resources {
  const result=zeroResources(),history=state.creationHistory;
  if(!history||history.applied||state.method==='import'||state.importSources.length)return result;
  const regional=state.regionalApplied?regionBonus(state.identity.region):zeroResources();
  const current=zeroResources();
  for(const resource of RESOURCE_KEYS)current[resource]=state.base[resource]+state.permanent[resource]+regional[resource];
  for(const event of history.events){
    for(const resource of RESOURCE_KEYS){
      const previous=current[resource],change=event.changes[resource]??0;
      current[resource]=Math.max(0,previous+change);
      result[resource]+=current[resource]-previous;
    }
  }
  return result;
}

export function historicalFoundationYear(roll:number):number|undefined {
  return FOUNDATIONS[roll-1]?.year;
}
