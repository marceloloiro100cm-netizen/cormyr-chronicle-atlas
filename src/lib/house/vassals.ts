import {newHouseState,RESOURCE_KEYS,zeroResources,type HouseState,type Resource,type Vassal,type VassalSheet} from './types';
import {proposeVassal,approveVassal} from './military';
export function attachVassal(state:HouseState,input:{id:string;houseId:string;name:string;notes:string;npcIds?:string[]}){
 return approveVassal(proposeVassal(state,input),input.id,0);
}
export function createVassal(state:HouseState,input:{id:string;name:string;region:string;motto:string;lordName:string},rolls:Record<Resource,number[]>){
 for(const r of RESOURCE_KEYS)if(rolls[r]?.length!==5||rolls[r].some(d=>!Number.isInteger(d)||d<1||d>6))throw new Error('Cada recurso exige cinco dados de seis faces.');
 const next=attachVassal(state,{id:input.id,houseId:'vassal-'+input.id,name:input.name,notes:''});
 const sheet:VassalSheet={region:input.region,motto:input.motto,lordName:input.lordName,rolls:structuredClone(rolls),base:Object.fromEntries(RESOURCE_KEYS.map(r=>[r,rolls[r].reduce((a,b)=>a+b,0)])) as VassalSheet['base'],permanent:zeroResources(),holdings:[],domains:[]};
 next.vassals!.find(v=>v.id===input.id)!.sheet=sheet;return next;
}
export function vassalState(parent:HouseState,vassal:Vassal):HouseState{
 const s=vassal.sheet;if(!s)throw new Error('Esta vassala não possui mini-ficha.');
 const result=newHouseState(vassal.houseId,s.region);
 // Initial vassal holdings use creation costs; no regional bonus or fortune is added.
 return {...result,method:'import',regionalApplied:false,base:s.base,permanent:s.permanent,holdings:s.holdings,domains:s.domains,month:parent.month};
}
