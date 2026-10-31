import { balances, activeHoldings } from './engine';
export type EquipmentRow={id:string;initial:{armor:number;penalty:number;bulk:number;fighting:string;marksmanship:string};improved:{armor:number;penalty:number;bulk:number;fighting:string;marksmanship:string}};
const rows:[string,number,number,number,string,string,number,number,number,string,string][]=[
 ['support',0,0,0,'Atletismo−1','—',2,1,0,'Atletismo','—'],['archers',2,1,0,'Atletismo−1','Agilidade+2 · longo',3,2,0,'Atletismo','Agilidade+3 · longo'],['scouts',2,1,0,'Atletismo','Agilidade · longo',3,2,0,'Atletismo+1','Agilidade+1 · longo'],['cavalry',5,3,2,'Lidar com animais+3','—',9,5,3,'Lidar com animais+5','—'],['criminals',1,0,0,'Atletismo+1','—',4,2,1,'Atletismo+2','—'],['engineers',2,1,0,'Atletismo−1','—',5,3,2,'Atletismo','—'],['special',2,1,0,'Atletismo','Agilidade · variável',6,3,2,'Atletismo+1','Agilidade+1 · variável'],['personal-guard',6,3,2,'Atletismo+1','—',10,6,3,'Atletismo+2','—'],['garrison',3,2,0,'Atletismo+1','—',5,3,2,'Atletismo+2','—'],['guerrillas',1,0,0,'Atletismo','Agilidade+1 · curto',3,2,0,'Atletismo+1','Agilidade+2 · curto'],['infantry',3,2,0,'Atletismo+1','—',4,2,1,'Atletismo+2','—'],['crusaders',3,2,0,'Atletismo+1','—',4,2,1,'Atletismo+2','—'],['sailors',0,0,0,'Atletismo+1','—',2,1,0,'Atletismo+2','—'],['mercenaries',4,2,1,'Atletismo+1','—',5,3,2,'Atletismo+3','—'],['warships',5,0,0,'Atletismo+1','Agilidade+1 · longo',10,0,0,'Atletismo+4','Agilidade+3 · longo'],['levies',0,0,0,'Atletismo−1','Atletismo−1 · curto',2,1,0,'Atletismo','Atletismo · curto'],['raiders',2,1,0,'Atletismo+1','—',5,2,2,'Atletismo+2','—'],
];
export const UNIT_EQUIPMENT:EquipmentRow[]=rows.map(([id,a,p,b,f,m,ia,ip,ib,ifight,im])=>({id,initial:{armor:a,penalty:p,bulk:b,fighting:f,marksmanship:m},improved:{armor:ia,penalty:ip,bulk:ib,fighting:ifight,marksmanship:im}}));
export function houseWeaponBonuses(state:import('./types').HouseState) {
 const specialists=activeHoldings(state).filter(h=>h.itemId==='pros-bowyer-fletcher-or-weaponsmith');
 return {fighting:specialists.some(h=>h.weaponSpecialty==='fighting')?1:0,marksmanship:specialists.some(h=>h.weaponSpecialty==='marksmanship')?1:0,unconfigured:specialists.some(h=>!h.weaponSpecialty)};
}
export const EQUIPMENT_SOURCE='Guerra dos Tronos RPG · tabelas 10-1/10-2, pp. 219–220; melhora p. 223';
export function improveEquipment(state:import('./types').HouseState,unitId:string,category:'armor'|'fighting'|'marksmanship'):import('./types').HouseState {
 const next=structuredClone(state),unit=next.units.find(u=>u.id===unitId);
  if(!unit||unit.destroyed)throw new Error('Unidade indisponível.');
 const selected=unit.equipmentTypeId??(unit.types.length===1?unit.types[0]:undefined);
 if(!selected||!unit.types.includes(selected))throw new Error('Selecione o conjunto de equipamento da unidade.');
 const row=UNIT_EQUIPMENT.find(r=>r.id===selected);if(!row)throw new Error('Equipamento não identificado.');
 if(unit.equipment.includes(category))throw new Error('Esta categoria já foi melhorada.');
 if(category==='marksmanship'&&row.improved.marksmanship==='—')throw new Error('Esta unidade não tem ataque de Pontaria.');
 // A permanent expense is separate from allocations and must not erase casualty state.
 const free=unit.equipment.length===0&&activeHoldings(state).some(h=>h.itemId==='pros-master-of-arms');
 if(!free&&balances(state).available.wealth<1)throw new Error('Riqueza insuficiente.');
 if(!free){unit.costs.push({resource:'wealth',amount:1,mode:'permanent'});next.permanent.wealth-=1;}
 unit.equipment.push(category);
 if(category==='armor'){unit.armor=row.improved.armor;unit.armorPenalty=row.improved.penalty;unit.bulk=row.improved.bulk;}
 return next;
}