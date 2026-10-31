import { TRAINING, UNIT_TYPES, unitStats, balances, activeHoldings } from './engine';
import { UNIT_EQUIPMENT } from './equipment';
import { SKILLS, type HouseState, type Unit } from './types';

export function equipUnit(unit:Unit):Unit {
 const id=unit.equipmentTypeId??unit.types[0],row=UNIT_EQUIPMENT.find(r=>r.id===id);
 if(!row||!id||!unit.types.includes(id))throw new Error('Conjunto de equipamento inválido.');
 return {...unit,equipmentTypeId:id,armor:row.initial.armor,armorPenalty:row.initial.penalty,bulk:row.initial.bulk,strength:unit.types.includes('warships')?5:unit.types.includes('cavalry')?20:100};
}
export const SURVIVOR_CONDITIONS=['unharmed','damaged','disorganized','routed','destroyed'] as const;
export type SurvivorCondition=typeof SURVIVOR_CONDITIONS[number];
// Table10-6, row0..6, columns Sem Dano,Dano,Desorganizada,Debandada,Destruída.
const TABLE:(number|'destroyed')[][]=[[-2,-3,'destroyed','destroyed','destroyed'],[-1,-2,-3,'destroyed','destroyed'],[0,-1,-2,-3,'destroyed'],[0,0,-1,-2,-3],[0,0,0,-1,-2],[1,0,0,0,-1],[2,1,0,0,0]];
export function survivorResult(roll:number,condition:SurvivorCondition,disorganizations:number,bonus=0) {
 if(!Number.isInteger(roll)||roll<1||roll>6||!Number.isInteger(disorganizations)||disorganizations<0||!SURVIVOR_CONDITIONS.includes(condition))throw new Error('Dados de sobreviventes inválidos.');
 if(!Number.isInteger(bonus)||bonus<0||bonus>2)throw new Error('Bônus de sobreviventes inválido.');
 const adjusted=Math.min(6,Math.max(0,roll+bonus-Math.max(0,disorganizations-1)));
 return {adjusted,steps:TABLE[adjusted]?.[SURVIVOR_CONDITIONS.indexOf(condition)]??'destroyed'};
}
export function resolveSurvivors(state:HouseState,input:{id:string;unitId:string;roll:number;condition:SurvivorCondition;disorganizations:number;skills:Unit['skills'];justification:string}):HouseState {
 const next=structuredClone(state),unit=next.units.find(u=>u.id===input.unitId);
 if(!unit||unit.destroyed)throw new Error('Unidade indisponível.');
 if(unit.evolution?.some(e=>e.id===input.id))return state;
 if(!input.justification.trim())throw new Error('Registre o conflito e a decisão.');
 const bonus=activeHoldings(state).some(h=>h.itemId==='pros-master-of-arms')?1:0;
 const result=survivorResult(input.roll,input.condition,input.disorganizations,bonus),levels=Object.keys(TRAINING) as (keyof typeof TRAINING)[],before=unit.training,index=levels.indexOf(before as keyof typeof TRAINING);
 if(index<0)throw new Error('Treinamento inválido.');
 const target=result.steps==='destroyed'?-1:index+result.steps;
 if(target<0){const invested=unit.costs.filter(c=>c.resource==='power'&&c.mode==='allocation').reduce((n,c)=>n+c.amount,0);next.permanent.power-=invested;unit.destroyed=true;unit.health=0;unit.situation='Destruída';}
 else {
  const training=levels[Math.min(3,target)];if(!training)throw new Error('Treinamento inválido.');
  const extra=(unit.bonusRanks??0)+Math.max(0,target-3);
  const allowed=new Set(unit.mixedRule?.allowedSkills??unit.types.flatMap(id=>UNIT_TYPES.find(t=>t.id===id)?.skills??[]));
  for(const skill of SKILLS){const value=input.skills[skill];if(!Number.isInteger(value)||value<2||value>12)throw new Error('Graduação inválida.');if(value>2&&!allowed.has(skill))throw new Error('Habilidade não permitida para esta unidade.');}
  const spent=SKILLS.reduce((n,s)=>n+(input.skills[s]-2)*20,0),budget=TRAINING[training].xp+extra*20;
  if(spent>budget)throw new Error('Redistribua habilidades: XP excede o treinamento resultante.');
  const delta=TRAINING[training].power-TRAINING[before as keyof typeof TRAINING].power;
  if(delta!==0){
    const cost=unit.costs.find(c=>c.resource==='power'&&c.mode==='allocation');
    if(cost)cost.amount=Math.max(0,cost.amount+delta);
    else if(delta>0)unit.costs.push({resource:'power',amount:delta,mode:'allocation'});
    const updated=unit.costs.filter(c=>c.resource==='power'&&c.mode==='allocation').reduce((n,c)=>n+c.amount,0);
    unit.allocatedCosts??={};unit.allocatedCosts.power=updated;
  }
  unit.training=training;unit.skills=input.skills;unit.xp=budget-spent;unit.bonusRanks=extra;
  // Intact result explicitly heals damage; numeric casualty count is retained, not recreated.
  unit.health=result.steps===0?unitStats(unit).maxHealth:Math.min(unit.health,unitStats(unit).maxHealth);unit.situation='Sobrevivente';
 }
 unit.evolution??=[];unit.evolution.push({id:input.id,month:state.month,roll:input.roll,condition:input.condition,disorganizations:input.disorganizations,steps:result.steps==='destroyed'?-99:result.steps,before,after:unit.destroyed?'destroyed':unit.training,justification:input.justification+(bonus?' · Mestre de Armas +1 na tabela 10-6':'')});
 return next;
}
export function changeUnitState(state:HouseState,input:{unitId:string;mounted:boolean;atHome:boolean;health:number;casualties:number;situation:string;commanderName?:string|undefined;domainId?:string|undefined;disband?:boolean|undefined}):HouseState {
 const next=structuredClone(state),u=next.units.find(u=>u.id===input.unitId);if(!u||u.destroyed)throw new Error('Unidade indisponível.');
 if(!Number.isInteger(input.casualties)||input.casualties<0||input.casualties>u.strength||!Number.isFinite(input.health)||input.health<0)throw new Error('Saúde ou baixas inválidas.');
 if(input.domainId!==undefined){if(!state.domains.some(d=>d.id===input.domainId))throw new Error('Domínio de destino não pertence à Casa.');u.domainId=input.domainId;}
 if(input.commanderName!==undefined){u.commanderName=input.commanderName.trim();if(!u.commanderName)delete u.commanderId;}
 if(input.disband){u.destroyed=true;u.situation='Desmobilizada; custos permanentes não são restituídos';return next;}
 u.mounted=input.mounted;u.atHome=input.atHome;u.casualties=input.casualties;u.situation=input.situation;
 if(input.health>unitStats(u).maxHealth)throw new Error('Saúde excede o máximo na condição selecionada.');u.health=input.health;return next;
}
export function proposeVassal(state:HouseState,input:{id:string;houseId:string;name:string;notes:string;npcIds?:string[]}):HouseState {
 if(input.houseId===state.houseId)throw new Error('Uma casa não pode ser vassala de si mesma.');
 if(state.vassals?.some(v=>v.houseId===input.houseId&&v.status!=='ended'))throw new Error('Vínculo já registrado.');
 if(state.vassals?.some(v=>v.id===input.id)||state.holdings.some(h=>h.id===input.id))throw new Error('Identificador de vínculo já utilizado.');
 const next=structuredClone(state);next.vassals??=[];next.vassals.push({...input,npcIds:[...new Set(input.npcIds??[])],status:'proposed',cost:0,influencePenalty:0});return next;
}
export function approveVassal(state:HouseState,id:string,influencePenalty:number):HouseState {
 const next=structuredClone(state),v=next.vassals?.find(v=>v.id===id);if(!v||v.status!=='proposed')throw new Error('Proposta não disponível.');
 if(!Number.isInteger(influencePenalty)||influencePenalty<0)throw new Error('Ajuste de Influência inválido.');
 const count=(state.vassals??[]).filter(v=>v.status==='approved').length,cost=count===0?20:count===1?10:5;
 if(balances(state).available.power<cost)throw new Error('Poder insuficiente.');
 v.status='approved';v.cost=cost;v.influencePenalty=influencePenalty;v.approvedMonth=state.month;
 next.holdings.push({id:v.id,itemId:'vassal-'+Math.min(3,count+1),category:'vassal',name:v.name,domainId:'',costs:[{resource:'power',amount:cost,mode:'allocation'}],effects:[],source:'Livro básico · Brasões vassalos; aprovação narrativa',ruleVersion:'2026-10-24',status:'active'});
 return next;
}

/** Campaign training, confirmed by Narrator: one level at a time, paying extra allocated Power.
 * Equipment and permanent mercenary expenses remain unchanged. */
export function trainUnit(state:HouseState,id:string):HouseState {
 const next=structuredClone(state),unit=next.units.find(u=>u.id===id&&!u.destroyed);
 if(!unit)throw new Error('Unidade indisponível.');
 const order=['green','trained','veteran','elite'] as const;
 const current=order.indexOf(unit.training as typeof order[number]);
 if(current<0||current>=3)throw new Error('Treinamento máximo ou inválido.');
 const target=order[current+1]!;
 const delta=TRAINING[target].power-TRAINING[order[current]!].power;
 if(balances(state).available.power<delta)throw new Error('Poder insuficiente para treino.');
 const cost=unit.costs.find(c=>c.resource==='power'&&c.mode==='allocation');
 if(!cost)throw new Error('Alocação militar antiga precisa de conciliação.');
 cost.amount+=delta;
 unit.allocatedCosts??={};unit.allocatedCosts.power=unit.costs.filter(c=>c.resource==='power'&&c.mode==='allocation').reduce((n,c)=>n+c.amount,0);
 const before=unit.training;unit.training=target;
 unit.xp+=TRAINING[target].xp-TRAINING[before as keyof typeof TRAINING].xp;
 unit.evolution??=[];
 unit.evolution.push({id:crypto.randomUUID(),month:state.month,roll:0,condition:'training',disorganizations:0,steps:1,before,after:target,justification:'Treinamento em campanha autorizado pelo Narrador; custo de Poder +'+delta});
 return next;
}
