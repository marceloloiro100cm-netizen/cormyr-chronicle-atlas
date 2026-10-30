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
/** Tabela 6-4: aplicação por recurso conforme o relatório da auditoria. */
export const HISTORY_EFFECTS: Readonly<Record<number,string>> = {
 3:'−2d6 em todos os sete recursos.',
 4:'−1d6 em Defesa, Influência, Poder, População, Riqueza e Terras.',
 5:'−1d6 em Lei, Poder, População e Riqueza.',
 6:'+6 −2d6 em todos os sete recursos.',
 7:'−2d6 em Lei; −1d6 em Poder, População e Riqueza.',
 8:'−1d6 em Influência, Poder, Riqueza e Terras.',
 9:'−1d6 em Influência e Lei; +1d6 em Poder.',
 10:'−1d6 em Influência, Poder, Riqueza e Terras.',
 11:'+1d6 em dois recursos diferentes escolhidos pelo jogador.',
 12:'+1d6 em Influência, Terras, Poder e Riqueza.',
 13:'+1d6 em Influência, Terras, Lei e Poder.',
 14:'+1d6 em Defesa, Influência e Poder.',
 15:'+1d6 em Influência e Poder; −1d6 em Lei e População.',
 16:'+1d6 em Defesa, Influência, Lei e Poder.',
 17:'−1d6 em Influência, Lei e População; +1d6 em Defesa, Terras, Poder e Riqueza.',
 18:'+2d6 em Riqueza; +1d6 em Defesa, Influência, Terras, Lei e População.',
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

/** Each linked player can contribute a single audited 1d6 to one resource. */
export function memberBonusAdjustments(state:HouseState):Resources {
  const result=zeroResources();
  if(state.creationBonusesApplied||state.method==='import'||state.importSources.length)return result;
  for(const bonus of state.creationBonuses??[])result[bonus.resource]+=bonus.die;
  return result;
}
/** Compute historic modifiers in order, applying the zero floor after each event.
 * Never mutate original rolls, historical imports, or permanent resources here. */
export function historyAdjustments(state:HouseState):Resources {
  const result=zeroResources(),history=state.creationHistory;
  if(!history||history.applied||state.method==='import'||state.importSources.length)return result;
  const regional=state.regionalApplied?regionBonus(state.identity.region):zeroResources();
  const memberBonus=memberBonusAdjustments(state);
  const current=zeroResources();
  for(const resource of RESOURCE_KEYS)current[resource]=state.base[resource]+state.permanent[resource]+regional[resource]+memberBonus[resource];
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
