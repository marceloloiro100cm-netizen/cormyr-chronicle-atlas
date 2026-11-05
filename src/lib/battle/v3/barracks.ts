import type {Side,Training} from '../domain/types';
import {LAND_PROFILES,tacticalProfile} from '../domain/profiles-v2';
import {modelHouse} from './model-houses';

/** Finanças e suprimentos de brinquedo; não têm relação com o orçamento das casas. */
export const V3_TRAINING_BUDGET=7000;
export const V3_TRAINING_SUPPLIES=1200;
export const V3_MAX_FIELD_STACKS=5;
export const V3_MAX_ROSTER_STACKS=10;
const BASE_COST:Readonly<Record<string,number>>={
 support:3,archers:5,scouts:6,cavalry:17,criminals:2,crusaders:9,
 engineers:8,special:9,'personal-guard':11,garrison:6,guerrillas:5,
 infantry:6,sailors:5,mercenaries:8,levies:2,raiders:7,
};
const TRAINING_MULTIPLIER:Readonly<Record<Training,number>>={
 green:1,trained:1.25,veteran:1.5,elite:1.75,
};
export const V3_RECRUITMENT_TYPES=LAND_PROFILES.map(p=>({id:p.id,name:p.name}));
export type V3BarracksStack=Readonly<{
 id:string;typeId:string;name:string;training:Training;count:number;
 placement:'field'|'reserve';
}>;
export type V3BarracksArmy=readonly V3BarracksStack[];
export type V3Deployed=Readonly<{typeId:string;name:string;training:Training;count:number}>;
export type V3BarracksSummary=Readonly<{
 fieldStacks:number;reserveStacks:number;totalSoldiers:number;
 cost:number;supplies:number;ready:boolean;issues:readonly string[];
}>;
const ensureCount=(count:number)=>{
 if(!Number.isSafeInteger(count)||count<1||count>1000)
  throw new Error('Cada pilha precisa conter de 1 a 1000 soldados.');
 return count;
};
const newId=(army:V3BarracksArmy)=>{
 let index=1;
 while(army.some(s=>s.id==='quartel-'+index))index++;
 return 'quartel-'+index;
};
export function v3BarracksFromHouse(houseId:string):V3BarracksArmy{
 return modelHouse(houseId).units.map((u,i)=>({
  id:'quartel-'+(i+1),name:u.name,typeId:u.typeId,training:u.training,
  count:u.count,placement:'field' as const,
 }));
}
export function v3BarracksSummary(army:V3BarracksArmy):V3BarracksSummary{
 const issues:string[]=[];
 if(army.length>V3_MAX_ROSTER_STACKS)issues.push('Máximo de 10 pilhas incluindo a reserva.');
 const fieldStacks=army.filter(s=>s.placement==='field').length;
 if(fieldStacks<1||fieldStacks>V3_MAX_FIELD_STACKS)issues.push('Implante de 1 a 5 pilhas.');
 const seen=new Set<string>();
 let cost=0,supplies=0,totalSoldiers=0;
 for(const unit of army){
  if(seen.has(unit.id))issues.push('Identificador de tropa duplicado.');
  seen.add(unit.id);
  if(unit.placement!=='field'&&unit.placement!=='reserve')issues.push('Posição de tropa inválida.');
  if(!Number.isSafeInteger(unit.count)||unit.count<1||unit.count>1000){
   issues.push('Efetivo deve estar entre 1 e 1000.');continue;
  }
  if(!BASE_COST[unit.typeId]||!TRAINING_MULTIPLIER[unit.training]){
   issues.push('Perfil militar ou treinamento desconhecido.');continue;
  }
  totalSoldiers+=unit.count;
  cost+=Math.ceil(unit.count*BASE_COST[unit.typeId]*TRAINING_MULTIPLIER[unit.training]);
  supplies+=unit.count*(unit.typeId==='cavalry'?3:unit.typeId==='engineers'?2:1);
 }
 if(cost>V3_TRAINING_BUDGET)issues.push('Orçamento fictício insuficiente.');
 if(supplies>V3_TRAINING_SUPPLIES)issues.push('Suprimentos fictícios insuficientes.');
 return {fieldStacks,reserveStacks:army.length-fieldStacks,totalSoldiers,
  cost,supplies,ready:issues.length===0,issues};
}
export function v3BarracksDeploy(army:V3BarracksArmy):readonly V3Deployed[]{
 const summary=v3BarracksSummary(army);
 if(!summary.ready)throw new Error(summary.issues.join(' '));
 return army.filter(s=>s.placement==='field').map(({typeId,name,training,count})=>({
  typeId,name,training,count,
 }));
}
export function v3BarracksRecruit(army:V3BarracksArmy,typeId:string,
 training:Training='trained',count=20):V3BarracksArmy{
 ensureCount(count);
 const type=tacticalProfile(typeId);
 if(!TRAINING_MULTIPLIER[training])throw new Error('Treinamento desconhecido.');
 if(army.length>=V3_MAX_ROSTER_STACKS)throw new Error('O quartel atingiu o limite de pilhas.');
 const next=[...army,{id:newId(army),name:type.name+' recrutados',
  typeId:type.id,training,count,placement:'reserve' as const}];
 const check=v3BarracksSummary(next);
 if(check.cost>V3_TRAINING_BUDGET||check.supplies>V3_TRAINING_SUPPLIES)
  throw new Error('Sem orçamento ou suprimentos fictícios para recrutar.');
 return next;
}
export function v3BarracksChangeCount(army:V3BarracksArmy,id:string,count:number):V3BarracksArmy{
 ensureCount(count);
 if(!army.some(s=>s.id===id))throw new Error('Pilha desconhecida.');
 const next=army.map(s=>s.id===id?{...s,count}:s);
 const check=v3BarracksSummary(next);
 if(check.cost>V3_TRAINING_BUDGET||check.supplies>V3_TRAINING_SUPPLIES)
  throw new Error('Ajuste excede o orçamento ou os suprimentos do treino.');
 return next;
}
export function v3BarracksSetPlacement(army:V3BarracksArmy,id:string,
 placement:'field'|'reserve'):V3BarracksArmy{
 if(!army.some(s=>s.id===id))throw new Error('Pilha desconhecida.');
 const next=army.map(s=>s.id===id?{...s,placement}:s);
 if(next.filter(s=>s.placement==='field').length>V3_MAX_FIELD_STACKS)
  throw new Error('O campo permite somente cinco pilhas.');
 return next;
}
export function v3BarracksSplit(army:V3BarracksArmy,id:string,count:number):V3BarracksArmy{
 const source=army.find(s=>s.id===id);
 if(!source)throw new Error('Pilha desconhecida.');
 if(!Number.isSafeInteger(count)||count<1||count>=source.count)
  throw new Error('O destacamento deve ser menor que a pilha de origem.');
 if(army.length>=V3_MAX_ROSTER_STACKS)throw new Error('O quartel atingiu o limite de pilhas.');
 return [...army.map(s=>s.id===id?{...s,count:s.count-count}:s),
  {...source,id:newId(army),name:source.name+' · Destacamento',count,placement:'reserve'}];
}
export function v3BarracksMerge(army:V3BarracksArmy,sourceId:string,targetId:string):V3BarracksArmy{
 if(sourceId===targetId)throw new Error('Selecione duas pilhas distintas.');
 const source=army.find(s=>s.id===sourceId),target=army.find(s=>s.id===targetId);
 if(!source||!target)throw new Error('Pilha desconhecida.');
 if(source.typeId!==target.typeId||source.training!==target.training)
  throw new Error('Somente tropas do mesmo tipo e treinamento podem ser reunidas.');
 ensureCount(source.count+target.count);
 return army.filter(s=>s.id!==sourceId).map(s=>s.id===targetId?
  {...s,count:s.count+source.count}:s);
}
export function v3BarracksRemove(army:V3BarracksArmy,id:string):V3BarracksArmy{
 if(!army.some(s=>s.id===id))throw new Error('Pilha desconhecida.');
 return army.filter(s=>s.id!==id);
}
export function v3BarracksBySide(attacker:string,defender:string):Record<Side,V3BarracksArmy>{
 return {attacker:v3BarracksFromHouse(attacker),defender:v3BarracksFromHouse(defender)};
}
