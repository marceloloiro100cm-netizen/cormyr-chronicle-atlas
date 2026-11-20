export function houseCharacterAges(input:{
 uid:string;raw:Record<string,unknown>;houseId:string;year:number;
 characters:Record<string,any>[];links:Record<string,any>[];
 records:Record<string,any>[];
}):Array<{
 record_id:string;character_id:string;as_of_year:number;
 status:string;age:number|null;death_year:number|null;
}>;
