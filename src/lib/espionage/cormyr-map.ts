/** Cartografia fornecida pelo Narrador em 03/11/2026.
 * A imagem original contém 11 regiões jogáveis. Os contornos abaixo foram
 * simplificados da silhueta colorida dessa imagem (1628×888), e não são GPS,
 * rotas de estrada ou evidência de portos.
 *
 * Em modo de visualização, cruzar UMA fronteira por terra custa UMA désdia.
 * As TRÊS regiões costeiras do Dragonmere (Crownlands, Shieldmark e
 * Dragon Coast) possuem uma ligação marítima direta entre cada par,
 * com UMA désdia de viagem por autorização expressa do Narrador.
 * A criação de missões continua bloqueada e exige as RPCs de aprovação.
 */
import type {SpyRegionalConnection} from './region-turns';
export const CORMYR_MAP_SOURCE='Mapa Politico de Cormyr.png · enviado pelo Narrador em 03/11/2026';
export const CORMYR_MAP_VIEWBOX='0 0 1628 888';
export type CormyrMappedRegion={
 name:string;fill:string;path:string;labelX:number;labelY:number;centerX:number;centerY:number;
 labelRotation?:number;
};
export const CORMYR_MAPPED_REGIONS:Record<string,CormyrMappedRegion>={
 veilstone:{name:'Veilstone',fill:'#ccd1d4',labelX:498,labelY:271,centerX:498,centerY:271,
  path:'M762,202 740,161 707,161 552,197 546,206 560,206 559,229 439,268 416,253 420,240 471,229 481,240 491,222 397,241 318,239 299,247 284,283 302,332 372,363 392,351 514,332 545,336 575,320 555,313 558,302 620,309 673,281 669,258 698,239 709,242 708,254 758,256 762,244 749,228Z'},
 ferlin:{name:'Ferlin',fill:'#b5bdea',labelX:410,labelY:455,centerX:398,centerY:455,
  path:'M146,382 143,400 160,407 149,437 257,529 296,541 294,570 348,638 355,656 347,668 363,704 417,713 468,704 471,692 511,681 522,695 498,708 541,712 571,692 613,705 625,695 607,680 603,660 588,672 543,667 550,654 590,656 578,621 523,590 531,501 511,450 527,416 520,407 497,407 492,396 527,392 522,374 543,349 512,334 367,363 311,334 280,333 255,356 214,353 164,365Z'},
 helmlands:{name:'Helmlands',fill:'#e7e0b4',labelX:802,labelY:337,centerX:800,centerY:337,
  path:'M1174,227 1145,210 1131,216 1134,225 1116,246 1151,246 1157,256 1149,262 1101,262 1086,239 1036,227 971,238 966,244 990,254 982,264 929,260 915,250 817,256 817,271 768,272 756,259 705,253 678,268 672,282 625,302 639,319 637,345 654,354 641,372 665,401 677,454 704,446 773,459 793,436 820,435 839,458 871,453 898,461 937,447 958,464 977,463 1004,433 1024,439 1041,420 1060,420 1059,400 1079,391 1100,340 1118,325 1117,312 1137,305 1159,278 1156,267 1176,247Z'},
 swordmark:{name:'Swordmarch',fill:'#a1eef0',labelX:588,labelY:487,centerX:594,centerY:474,labelRotation:-82,
  path:'M624,309 556,327 527,383 530,392 564,392 574,404 573,447 601,557 583,562 567,542 536,407 526,409 532,425 513,449 526,466 533,513 525,578 598,643 656,591 665,548 671,429 656,392 620,360 624,349 639,348 639,321Z'},
 crownlands:{name:'Crownlands',fill:'#a5b9fa',labelX:803,labelY:526,centerX:805,centerY:526,
  path:'M591,645 611,671 645,673 689,626 718,611 720,599 788,606 813,593 815,580 856,568 860,583 817,595 826,606 848,605 850,622 886,614 901,621 909,608 948,649 980,648 983,633 1005,626 1008,585 1020,578 1007,527 1011,498 977,499 975,487 936,491 923,475 955,465 943,447 917,448 897,463 870,453 802,464 706,445 683,456 671,447 658,590 631,608 627,629Z'},
 horselands:{name:'Horselands',fill:'#d3b1df',labelX:370,labelY:780,centerX:380,centerY:780,
  path:'M644,873 624,825 622,724 549,719 557,707 612,708 576,694 539,711 470,704 394,716 367,709 359,718 264,717 171,738 128,776 104,821 109,853 143,887 642,887Z'},
 dragoncoast:{name:'Dragon Coast',fill:'#d2f4bf',labelX:1016,labelY:828,centerX:1010,centerY:826,
  path:'M614,707 648,713 644,723 623,726 625,827 643,869 710,877 792,876 819,887 1040,887 1048,876 1083,875 1179,828 1250,806 1268,776 1259,744 1236,735 1227,743 1203,734 1167,756 1136,750 1109,771 1053,761 1042,771 1007,766 992,782 954,782 938,765 901,751 874,781 854,781 857,795 889,793 889,807 838,812 830,800 845,794 809,774 798,785 768,786 730,754 708,749 708,714 685,718 639,684Z'},
 shieldmark:{name:'Shieldmark',fill:'#efbac7',labelX:1248,labelY:622,centerX:1220,centerY:609,
  path:'M1347,450 1310,429 1282,448 1250,449 1243,432 1178,443 1160,465 1137,455 1129,463 1072,457 1041,467 1048,508 1037,518 1047,542 1014,557 1021,578 996,653 1069,673 1088,699 1116,688 1127,708 1165,700 1171,717 1176,696 1166,673 1197,664 1244,705 1281,694 1304,727 1339,728 1346,705 1369,704 1367,665 1389,642 1364,620 1374,600 1358,574 1366,536 1345,505 1355,487Z'},
 elfhold:{name:'Elfhold',fill:'#efd6b4',labelX:1200,labelY:367,centerX:1215,centerY:359,
  path:'M1334,217 1286,189 1238,206 1215,190 1205,205 1168,216 1177,240 1167,272 1099,343 1087,371 1093,408 1069,425 1095,440 1146,423 1155,442 1174,447 1252,424 1277,425 1286,441 1342,419 1324,418 1318,407 1335,397 1334,341 1347,307 1341,248 1303,240 1311,230 1339,232Z'},
 volkumburgh:{name:'Volkumburgh',fill:'#f0c9b7',labelX:1438,labelY:311,centerX:1438,centerY:332,
  path:'M1374,236 1339,257 1348,311 1335,368 1376,361 1396,381 1343,387 1334,380 1336,397 1348,398 1354,413 1330,424 1375,429 1347,453 1361,524 1394,540 1429,539 1475,504 1499,457 1483,416 1499,393 1503,360 1472,365 1444,344 1501,340 1507,323 1483,286 1471,239Z M1447,87 1427,78 1392,82 1344,127 1323,176 1324,206 1339,230 1357,232 1346,218 1355,198 1382,211 1459,209 1451,154 1461,124Z'},
 stonelands:{name:'Stonelands',fill:'#f0c6b9',labelX:1110,labelY:115,centerX:1090,centerY:159,
  path:'M1370,71 1349,60 1346,35 1323,34 1322,21 1295,0 1255,10 1182,0 1083,51 991,69 967,92 928,161 790,171 771,157 743,155 762,203 751,233 761,254 886,257 1026,225 1103,223 1143,209 1182,216 1194,209 1195,194 1218,189 1251,203 1278,188 1323,203 1324,164 1342,128 1372,98Z'},
};

/** Only borders VISUALLY continuous on the narrator-supplied political map.
 * Shared corners, water-separated shores, and external regions do not count.
 * These links are suitable for strategic PREVIEW, not for mission execution.
 */
export const CORMYR_CARTOGRAPHIC_BORDERS=[
 ['veilstone','ferlin'],
 ['veilstone','helmlands'],
 ['veilstone','stonelands'],
 ['veilstone','swordmark'],
 ['ferlin','swordmark'],
 ['ferlin','horselands'],
 ['swordmark','helmlands'],
 ['swordmark','crownlands'],
 ['swordmark','horselands'],
 ['helmlands','stonelands'],
 ['helmlands','elfhold'],
 ['helmlands','crownlands'],
 ['stonelands','elfhold'],
 ['stonelands','volkumburgh'],
 ['elfhold','volkumburgh'],
 ['elfhold','shieldmark'],
 ['crownlands','shieldmark'],
 ['shieldmark','volkumburgh'],
 ['horselands','dragoncoast'],
] as const;

export const CORMYR_CARTOGRAPHIC_LAND_LINKS:readonly SpyRegionalConnection[]=
 CORMYR_CARTOGRAPHIC_BORDERS.map(([fromRegion,toRegion],i)=>({
  id:`${String(i+1).padStart(8,'0')}-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  fromRegion,toRegion,passage:'land_neighbor' as const,bidirectional:true,version:1,
 }));

/** Regra confirmada pelo Narrador em 03/11/2026:
 * TODAS as regiões com COSTA CONTÍNUA no Dragonmere compartilham uma
 * passagem marítima direta de UMA désdia, em ambos os sentidos.
 *
 * Inspeção da imagem política original: Crownlands (norte/oeste),
 * Shieldmark (nordeste) e Dragon Coast (sul) fazem margem ao lago.
 * Horselands e Swordmarch chegam perto da ponta oeste, mas não possuem
 * uma frente costeira contínua no mapa; não são incluídas por um
 * encontro de limites num único ponto. Sembia é externa ao jogo.
 *
 * Cada par é incluído UMA vez, totalizando três conexões possíveis.
 * Os links abaixo são homologação CARTOGRÁFICA de prévia; para executar
 * missões reais, a RPC protegida precisa registrar/validar a rota.
 */
export const CORMYR_DRAGONMERE_COASTAL_REGIONS=[
 'crownlands','shieldmark','dragoncoast',
] as const;

export const CORMYR_NARRATOR_APPROVED_SEA_LINKS:readonly SpyRegionalConnection[]=[
 {id:'99d28001-318a-477b-813e-4b6b7e263c31',fromRegion:'dragoncoast',
  toRegion:'crownlands',passage:'sea_passage',bidirectional:true,version:1},
 {id:'c603627b-6413-42f6-833a-650df479d118',fromRegion:'dragoncoast',
  toRegion:'shieldmark',passage:'sea_passage',bidirectional:true,version:1},
 {id:'07effb30-0d2b-4e16-88e5-ae1b51969881',fromRegion:'crownlands',
  toRegion:'shieldmark',passage:'sea_passage',bidirectional:true,version:1},
];

/** Preview combines borders from the picture, the Narrator-confirmed
 * three Dragonmere coastal crossings and the owner's RLS-filtered approved links.
 * No additional maritime edge is inferred from coastline proximity.
 * Actual operations MUST revalidate on the server separately.
 */
export function cormyrPreviewLinks(approved:readonly SpyRegionalConnection[]=[]):SpyRegionalConnection[]{
 const answer=[...CORMYR_CARTOGRAPHIC_LAND_LINKS,...CORMYR_NARRATOR_APPROVED_SEA_LINKS];
 for(const link of approved){
  const matching=answer.findIndex(a=>a.passage===link.passage&&
   ((a.fromRegion===link.fromRegion&&a.toRegion===link.toRegion)||
   (a.bidirectional&&link.bidirectional&&a.fromRegion===link.toRegion&&a.toRegion===link.fromRegion)));
  if(matching>=0)answer[matching]=link;
  else answer.push(link);
 }
 return answer;
}
