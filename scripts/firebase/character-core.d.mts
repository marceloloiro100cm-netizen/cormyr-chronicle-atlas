export function characterAgeState(character:Record<string,any>,year:number,sourceCount:number):{
 as_of_year:number;life:'alive'|'deceased'|'unknown';status:string;age:number|null;
 birth_year?:number;death_year?:number|null;
};
