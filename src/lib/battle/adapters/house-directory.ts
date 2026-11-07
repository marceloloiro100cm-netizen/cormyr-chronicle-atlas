import {REGIONS,regionId} from '@/lib/house/regions';

export type BattleHouseDirectoryRow=Readonly<{id:string;name:string;region:string}>;
export type BattleHouseRegion=Readonly<{id:string;name:string;houseCount:number}>;

/** Canonical regions shared with the campaign. Unknown regions remain searchable. */
export function battleRegionId(value:string):string{
 const cleaned=value.trim();
 if(cleaned.toLowerCase()==='crownland')return 'crownlands';
 if(cleaned.toLowerCase()==='swordmark')return 'swordmark';
 return regionId(cleaned)||'unclassified';
}

/** Preserve reviewed catalog houses; campaign rows override names only when valid. */
export function battleHouseDirectory(
 catalog:readonly BattleHouseDirectoryRow[],
 campaign:readonly BattleHouseDirectoryRow[],
):BattleHouseDirectoryRow[]{
 const merged=new Map<string,BattleHouseDirectoryRow>();
 const valid=(r:BattleHouseDirectoryRow)=>r.id.trim()&&r.name.trim();
 for(const row of catalog){
  if(!valid(row))continue;
  merged.set(row.id,{id:row.id,name:row.name.trim(),region:battleRegionId(row.region)});
 }
 for(const row of campaign){
  if(!valid(row))continue;
  const prior=merged.get(row.id);
  const campaignRegion=battleRegionId(row.region);
  merged.set(row.id,{id:row.id,name:row.name.trim(),
   region:campaignRegion!=='unclassified'?campaignRegion:prior?.region??'unclassified'});
 }
 return [...merged.values()].sort((a,b)=>
  a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
}
export function battleHouseRegions(houses:readonly BattleHouseDirectoryRow[]):BattleHouseRegion[]{
 const counts=new Map<string,number>();
 for(const house of houses)counts.set(house.region,(counts.get(house.region)??0)+1);
 return [...counts.entries()].map(([id,houseCount])=>({
  id,name:REGIONS[id]?.name??'Sem região classificada',houseCount,
 })).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
export type BattleRosterPreview=Readonly<{
 id:string;name:string;types:readonly string[];training:string;
 strength:number;casualties:number;destroyed:boolean;sourceStatus?:string;
}>;
/** A roster is only selectable when it is valid for land combat and has men. */
export function battleRosterEligible(unit:BattleRosterPreview):boolean{
 return !unit.destroyed&&Number.isFinite(unit.strength)&&
  Number.isFinite(unit.casualties)&&unit.strength-unit.casualties>0&&
  !unit.types.includes('warships');
}
