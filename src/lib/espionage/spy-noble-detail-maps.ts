/** Read-only, cartographic placement of noble banners printed on the
 * Narrator-supplied detailed maps. Coordinates are IMAGE pixels, not
 * geographic coordinates or travel-cost rules. Unlabelled banners in
 * Volkumburgh deliberately have no invented house identity.
 *
 * Corresponding static assets:
 * public/maps/espionage/dragoncoast.webp (1709 x 920)
 * public/maps/espionage/horselands.webp (1024 x 1536)
 * public/maps/espionage/volkumburgh.webp (1536 x 1024)
 */
export type NobleMapPoint={x:number;y:number};
export type NobleDetailMap={
 name:string;src:string;width:number;height:number;
 houses:Readonly<Record<string,NobleMapPoint>>;
};
export function nobleMapKey(value:string):string{
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]/g,'');
}
const dragonCoast:Record<string,NobleMapPoint>={
 morler:{x:115,y:240},hardcastle:{x:354,y:278},
 indimber:{x:562,y:291},goldfin:{x:769,y:253},
 hinniven:{x:947,y:331},burnig:{x:1312,y:287},
 greenhorns:{x:1457,y:310},grandragon:{x:511,y:420},
 fewmerry:{x:1162,y:411},blacksilver:{x:1316,y:435},
 grantass:{x:845,y:495},ashkar:{x:749,y:597},
 qazir:{x:1156,y:604},nathlekh:{x:1590,y:620},
 mareforte:{x:1227,y:179},
};
const horselands:Record<string,NobleMapPoint>={
 vaeren:{x:395,y:187},bryarn:{x:303,y:276},
 gretgaunt:{x:691,y:205},mantlepard:{x:568,y:292},
 mistwind:{x:752,y:289},haelbroke:{x:221,y:359},
 everet:{x:420,y:320},stormserpent:{x:203,y:475},
 dragonwood:{x:416,y:488},harcourt:{x:243,y:578},
 handragon:{x:516,y:574},crakehall:{x:826,y:600},
 eveningspire:{x:568,y:455},yellander:{x:747,y:420},
 hartalan:{x:859,y:480},erdenor:{x:682,y:532},
 silversky:{x:299,y:678},everlost:{x:100,y:720},
};
// Only alternate spellings already encountered in the campaign.
// Do not infer a location for an unknown house or from its region alone.
const aliases:Record<string,string>={
 marefote:'mareforte',marefort:'mareforte',
 hardcourt:'harcourt',hardcourtcastle:'hardcastle',
 gregtaunt:'gretgaunt',gretgaunt:'gretgaunt',
 silversky:'silversky',
};
export const SPY_NOBLE_DETAIL_MAPS:Readonly<Record<string,NobleDetailMap>>={
 dragoncoast:{
  name:'Costa do Dragão',src:'/maps/espionage/dragoncoast.webp',
  width:1709,height:920,houses:dragonCoast,
 },
 horselands:{
  name:'Horselands',src:'/maps/espionage/horselands.webp',
  width:1024,height:1536,houses:horselands,
 },
 volkumburgh:{
  name:'Volkumburgh',src:'/maps/espionage/volkumburgh.webp',
  width:1536,height:1024,houses:{},
 },
};
export function spyHouseMapPoint(
 regionId:string,houseName:string,houseId?:string
):NobleMapPoint|null{
 const mapped=SPY_NOBLE_DETAIL_MAPS[regionId];
 if(!mapped)return null;
 for(const candidate of [houseName,houseId??'']){
  const key=nobleMapKey(candidate);
  const point=mapped.houses[aliases[key]??key];
  if(point)return point;
 }
 return null;
}
