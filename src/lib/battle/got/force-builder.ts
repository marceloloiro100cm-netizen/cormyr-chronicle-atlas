import {TRAINING,UNIT_TYPES} from '@/lib/house/engine';
import type {WarModelUnitTypeId} from './models';
import type {WarUnit} from './types';

/** Monta uma força-modelo a partir do recurso Poder de uma Casa.
 * Custos do livro (cap. 6): tipo da unidade + treinamento. O resultado é
 * apenas uma sugestão de simulação: nunca lê nem grava fichas oficiais.
 */
export type WarForceUnit=Readonly<{typeId:WarModelUnitTypeId;training:WarUnit['training'];cost:number}>;
export type WarForce=Readonly<{
 power:number;spent:number;warfare:number;units:readonly WarForceUnit[];
}>;
export const WAR_FORCE_MAX_UNITS=14;
/** Sequência equilibrada: linha de frente, tiro, choque e reserva. */
const PATTERN:readonly WarModelUnitTypeId[]=[
 'infantry','archers','infantry','cavalry','garrison','archers','infantry',
 'scouts','cavalry','infantry','archers','mercenaries','personal-guard','infantry',
];
const TRAININGS:readonly WarUnit['training'][]=['green','trained','veteran','elite'];
const typeCost=(typeId:string):number=>UNIT_TYPES.find(t=>t.id===typeId)?.cost??0;
export const warUnitPowerCost=(typeId:string,training:WarUnit['training']):number=>
 typeCost(typeId)+TRAINING[training].power;
/** Guerra sugerida ao comandante-modelo conforme o porte militar da Casa. */
export const suggestedWarfare=(power:number):number=>power>=60?5:power>=35?4:power>=18?3:2;

export function buildWarForce(power:number):WarForce{
 if(!Number.isFinite(power)||power<0)throw new Error('Poder inválido.');
 const budget=Math.min(200,Math.floor(power));
 // Mais Poder significa mais unidades E melhor treinamento: cerca de 8 pontos por unidade
 // (uma infantaria treinada custa 7; uma veterana, 9).
 const wanted=Math.max(2,Math.min(WAR_FORCE_MAX_UNITS,Math.round(budget/8)));
 let count=wanted;
 const baseCost=(n:number,training:WarUnit['training'])=>
  PATTERN.slice(0,n).reduce((sum,id)=>sum+warUnitPowerCost(id,training),0);
 // O simulador exige ao menos duas unidades por lado: uma Casa sem Poder
 // suficiente entra com recrutas verdes (o gasto pode exceder o orçamento).
 while(count>2&&baseCost(count,'green')>budget)count--;
 let level=0;
 while(level<3&&baseCost(count,TRAININGS[level+1]!)<=budget)level++;
 const units=PATTERN.slice(0,count).map(typeId=>({typeId,training:TRAININGS[level]!}));
 let spent=baseCost(count,TRAININGS[level]!);
 // Sobras promovem unidades uma a uma, começando pela vanguarda.
 for(let i=0;i<units.length;i++){
  const current=units[i]!;
  const index=TRAININGS.indexOf(current.training);
  if(index>=3)continue;
  const next=TRAININGS[index+1]!;
  const extra=TRAINING[next].power-TRAINING[current.training].power;
  if(spent+extra>budget)continue;
  units[i]={typeId:current.typeId,training:next};
  spent+=extra;
 }
 return {power:budget,spent,warfare:suggestedWarfare(budget),
  units:units.map(u=>({...u,cost:warUnitPowerCost(u.typeId,u.training)}))};
}
/** Portes de referência para comparar Casas de tamanhos diferentes. */
export const WAR_FORCE_TIERS=[
 {id:'minor',label:'Casa menor',power:20,hint:'Terceiro nível: poucas tropas, pouco treino.'},
 {id:'vassal',label:'Casa vassala',power:38,hint:'Vassala direta: força equilibrada.'},
 {id:'strong',label:'Casa poderosa',power:55,hint:'Vassala militarizada ou casa em ascensão.'},
 {id:'major',label:'Grande Casa',power:75,hint:'Casa maior: muitas unidades veteranas.'},
] as const;
export type WarForceTierId=typeof WAR_FORCE_TIERS[number]['id'];
