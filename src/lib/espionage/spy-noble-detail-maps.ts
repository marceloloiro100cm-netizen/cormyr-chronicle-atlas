/** Read-only, cartographic placement of noble banners printed on the
 * Narrator-supplied detailed maps. Coordinates are IMAGE pixels, not
 * geographic coordinates or travel-cost rules. Unlabelled banners in
 * Volkumburgh deliberately have no invented house identity.
 *
 * Corresponding static assets:
 * public/maps/espionage/dragoncoast.webp (1709 x 920)
 * public/maps/espionage/horselands.webp (1024 x 1536)
 * public/maps/espionage/volkumburgh.webp (1536 x 1024)
 * public/maps/espionage/crownlands.webp (1536 x 1024)
 * public/maps/espionage/helmlands.webp (1536 x 1024)
 * public/maps/espionage/shieldmark.webp (1536 x 1024)
 * public/maps/espionage/ferlin.webp (1183 x 1329)
 * public/maps/espionage/stonelands.webp (1536 x 1024)
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
const crownlands:Record<string,NobleMapPoint>={
 farrowbrace:{x:352,y:246},
 torchwinter:{x:592,y:229},
 cordallar:{x:675,y:230},
 ebonhawk:{x:789,y:243},
 alsevir:{x:943,y:271},
 wyvernspur:{x:1153,y:222},
 immerdusk:{x:228,y:381},
 torith:{x:402,y:415},
 bleyshar:{x:656,y:376},
 paertrover:{x:846,y:415},
 vonderharten:{x:166,y:518},
 scatterstars:{x:356,y:543},
 illance:{x:546,y:546},
 silversword:{x:764,y:524},
 barelder:{x:914,y:526},
 stonecastle:{x:1096,y:507},
 thorntower:{x:1229,y:546},
 ravenhill:{x:1409,y:550},
 calantar:{x:235,y:655},
 monthor:{x:599,y:641},
 buckfast:{x:154,y:771},
 phelles:{x:437,y:750},
 crownsilver:{x:803,y:741},
 lornsar:{x:1057,y:751}
};
const helmlands:Record<string,NobleMapPoint>={
 fiddlemantle:{x:223,y:205},
 ambruar:{x:417,y:264},
 blackwinter:{x:673,y:232},
 oldbridle:{x:902,y:233},
 emmarask:{x:1112,y:205},
 longbrooke:{x:1251,y:138},
 huntingdown:{x:1339,y:250},
 erdusking:{x:211,y:406},
 staghunt:{x:526,y:359},
 wyrvar:{x:711,y:366},
 staglar:{x:927,y:373},
 axehand:{x:1137,y:362},
 skatterhawk:{x:486,y:473},
 darendaal:{x:677,y:476},
 evenhand:{x:993,y:475},
 redbow:{x:1143,y:485},
 grandwillow:{x:275,y:586},
 loround:{x:903,y:665},
 darstan:{x:1190,y:627},
 dracohorn:{x:285,y:730},
 brassfinger:{x:588,y:744},
 stonetower:{x:1278,y:725},
 torchmore:{x:174,y:835},
 eldroon:{x:489,y:876},
 aunkspear:{x:908,y:856}
};
const shieldmark:Record<string,NobleMapPoint>={
 rallyhorn:{x:262,y:202},
 battlebar:{x:482,y:158},
 orthwood:{x:693,y:140},
 thawnfaer:{x:871,y:148},
 battlestar:{x:1050,y:140},
 wintercoats:{x:1292,y:155},
 hawklin:{x:1155,y:216},
 muscalian:{x:1360,y:275},
 dawningdown:{x:226,y:306},
 hlombur:{x:405,y:321},
 hiloar:{x:568,y:319},
 belorgan:{x:739,y:320},
 crownrood:{x:934,y:311},
 indulshields:{x:1076,y:380},
 wintersun:{x:1342,y:405},
 huntcrown:{x:205,y:427},
 kallowsar:{x:448,y:430},
 halvaeron:{x:679,y:437},
 valwater:{x:877,y:437},
 blackgate:{x:1018,y:455},
 briarbroke:{x:1202,y:455},
 gyrlond:{x:694,y:538},
 ambrival:{x:365,y:573},
 blackwyrm:{x:1122,y:594},
 summertree:{x:616,y:631},
 hardivyper:{x:1248,y:652},
 hethemer:{x:1429,y:683},
 wavegallant:{x:261,y:698},
 dauntinghorn:{x:979,y:699},
 mareforte:{x:1179,y:846}
};

const ferlin:Record<string,NobleMapPoint>={
 huntinghorn:{x:583,y:872},dawninghunt:{x:1017,y:518},
 jabari:{x:380,y:382},alamber:{x:683,y:383},
 mountwyrm:{x:212,y:530},gauntweather:{x:913,y:274},
 torchtower:{x:634,y:185},silverhorn:{x:567,y:603},
 naerinth:{x:994,y:882},imbranneth:{x:329,y:1013},
};
const stonelands:Record<string,NobleMapPoint>={
 sorndrake:{x:418,y:263},helstallion:{x:732,y:207},
 rowanmantle:{x:1109,y:161},braelbane:{x:267,y:550},
 downshield:{x:574,y:579},misrim:{x:940,y:462},
 hammerfalling:{x:1278,y:479},indesm:{x:1105,y:735},
};

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
 ferlin:{
  name:'Ferlin',src:'/maps/espionage/ferlin.webp',
  width:1183,height:1329,houses:ferlin,
 },
 stonelands:{
  name:'Stonelands',src:'/maps/espionage/stonelands.webp',
  width:1536,height:1024,houses:stonelands,
 },
 crownlands:{
  name:'Terras da Coroa',src:'/maps/espionage/crownlands.webp',
  width:1536,height:1024,houses:crownlands,
 },
 helmlands:{
  name:'Helmlands',src:'/maps/espionage/helmlands.webp',
  width:1536,height:1024,houses:helmlands,
 },
 shieldmark:{
  name:'Marca do Escudo',src:'/maps/espionage/shieldmark.webp',
  width:1536,height:1024,houses:shieldmark,
 },
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
