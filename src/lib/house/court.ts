import type { HouseState } from './types';
export const COURT_ROLES=['Lorde / Lady','Consorte','Herdeiro','Administrador','Herdeiro (Primogênito)','Segundo Filho / Filha','Terceiro Filho / Filha','Bastardo / Protegido','Administrador / Senescal','Comandante de Exército','Mestre de Armas','Espião-Mestre / Chefe de Inteligência','Conselheiro / Tillet','Capelão / Clérigo','Castelão','Emissário / Diplomata','Membro da Corte / Outro'] as const;
export function assignCourt(state:HouseState,input:{id:string;npcId:string;role:string;notes:string;name?:string}) {
 const next=structuredClone(state);
 if(!COURT_ROLES.includes(input.role as typeof COURT_ROLES[number])&&!/^Outro: .{1,150}$/.test(input.role))throw new Error('Cargo da Corte inválido.');
 const existing=next.court.find(m=>m.npcId===input.npcId&&m.role===input.role);
 if(existing){existing.notes=input.notes;if(input.name)existing.name=input.name;return next;}
 if(next.court.some(m=>m.id===input.id))throw new Error('Identificador da Corte já utilizado.');
 next.court.push({...input,name:input.name?.trim()||'Integrante da Corte'});return next;
}
export function validateCourtRecord(houseId:string,record:{house_id:string|null;kind:string}|null) {
 if(!record||record.house_id!==houseId||record.kind!=='character')throw new Error('Integrante da Corte não pertence a esta casa ou não está acessível.');
}
