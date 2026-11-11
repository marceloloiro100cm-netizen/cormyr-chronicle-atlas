import {z} from 'zod';
import type {ModelHouse} from './v3/model-houses';

export const LEONARDO_PRIVATE_HOUSE_ID='leonardo-private-house-model';
const STORAGE_PREFIX='cormyr-leonardo-private-model-house-v1:';
export const SIM_UNIT_TYPES=[
 ['infantry','Infantaria'],['archers','Arqueiros'],['cavalry','Cavalaria'],
 ['scouts','Batedores'],['garrison','Guarnição'],['engineers','Engenheiros'],
 ['mercenaries','Mercenários'],['raiders','Saqueadores'],['crusaders','Cruzados'],
 ['guerrillas','Guerrilheiros'],
] as const;
export const SIM_TRAINING=[
 ['green','Verde'],['trained','Treinada'],['veteran','Veterana'],['elite','Elite'],
] as const;
const types=SIM_UNIT_TYPES.map(([id])=>id);
const trainings=SIM_TRAINING.map(([id])=>id);
const unit=z.object({
 typeId:z.string().refine(v=>types.includes(v as typeof types[number])),
 name:z.string().trim().min(1).max(80),
 count:z.number().int().min(1).max(1000),
 training:z.enum(['green','trained','veteran','elite']),
}).strict();
export const privateHouseSchema=z.object({
 name:z.string().trim().min(2).max(80),
 region:z.string().trim().min(2).max(80),
 motto:z.string().trim().max(120),
 description:z.string().trim().max(500),
 units:z.tuple([unit,unit,unit,unit]),
}).strict();
export type PrivateHouse=z.infer<typeof privateHouseSchema>;
export const DEFAULT_PRIVATE_HOUSE:PrivateHouse={
 name:'',region:'',motto:'',description:'',
 units:[
  {typeId:'infantry',name:'Lanceiros',count:100,training:'trained'},
  {typeId:'archers',name:'Arqueiros',count:70,training:'trained'},
  {typeId:'cavalry',name:'Cavaleiros',count:20,training:'veteran'},
  {typeId:'scouts',name:'Batedores',count:50,training:'trained'},
 ],
};

export function privateHouseAsModel(house:PrivateHouse):ModelHouse{
 const clean=privateHouseSchema.parse(house);
 return {
  id:LEONARDO_PRIVATE_HOUSE_ID,
  name:clean.name+' · Simulação',region:clean.region,
  subtitle:(clean.motto||'Hoste de '+clean.name).slice(0,50),
  description:clean.description||'Exército particular de treinamento sem vínculo com a campanha.',
  units:clean.units,
 };
}
export function privateHouseStorageKey(userId:string):string{
 if(!/^[0-9a-f-]{16,50}$/i.test(userId))throw new Error('Usuário inválido.');
 return STORAGE_PREFIX+userId;
}
export function loadPrivateHouse(storage:Pick<Storage,'getItem'>,userId:string):PrivateHouse|null{
 try{
  const raw=storage.getItem(privateHouseStorageKey(userId));
  if(!raw||raw.length>6000)return null;
  const result=privateHouseSchema.safeParse(JSON.parse(raw));
  return result.success?result.data:null;
 }catch{return null;}
}
export function savePrivateHouse(storage:Pick<Storage,'setItem'>,userId:string,input:PrivateHouse):PrivateHouse{
 const data=privateHouseSchema.parse(input);
 storage.setItem(privateHouseStorageKey(userId),JSON.stringify(data));
 return data;
}
export function deletePrivateHouse(storage:Pick<Storage,'removeItem'>,userId:string):void{
 storage.removeItem(privateHouseStorageKey(userId));
}
