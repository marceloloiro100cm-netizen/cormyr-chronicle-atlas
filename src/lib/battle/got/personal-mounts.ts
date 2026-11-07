/** Montarias de combate individual, capítulo 9. Equipamento/modelos são locais e não persistidos. */
export type WarPersonalMount=Readonly<{
 id:string;name:string;athletics:number;movement:number;
 health:number;maxHealth:number;trainedForWar:boolean;
}>;
export function makeModelWarMount(input:{
 id:string;name:string;trainedForWar?:boolean;athletics?:number;movement?:number;
}):WarPersonalMount{
 if(!input.id.trim()||!input.name.trim())throw new Error('Montaria sem identificação.');
 const athletics=input.athletics??4,movement=input.movement??8;
 if(!Number.isInteger(athletics)||athletics<1||athletics>15||
  !Number.isInteger(movement)||movement<1||movement>30)
  throw new Error('Atletismo ou Movimento da montaria inválido.');
 return {id:input.id,name:input.name,athletics,movement,
  health:athletics*3,maxHealth:athletics*3,
  trainedForWar:input.trainedForWar??true};
}
