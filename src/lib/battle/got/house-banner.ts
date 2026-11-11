import type {WarBanner,WarBattle,WarSide} from './types';
import type {WarForceTierId} from './force-builder';

/** Identidade visual das Casas no campo de batalha: bandeira, cores e brasão.
 * Usa apenas o cadastro PÚBLICO do arquivo de Cormyr (nome, região, cores,
 * brasão e hierarquia). Nunca lê fichas, recursos ou unidades das Casas.
 * Módulo puro: nada aqui altera regras, dados ou resultados da batalha.
 */
const HEX=/^#[0-9a-f]{6}$/i;
const plain=(text:string):string=>text.normalize('NFD').replace(/[̀-ͯ]/g,'')
 .toLowerCase().replace(/[^a-z\s-]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();
/** Nomes de cores do cadastro (sem acento) e o tom usado nas peças. */
const COLOR_WORDS:readonly (readonly [string,string])[]=[
 ['azul celeste','#5aa9e6'],['azul tempestuoso','#4a6078'],['azul acinzentado','#6f8498'],
 ['azul profundo','#17306b'],['azul noturno','#131f42'],['azul marinho','#14274f'],
 ['azul escuro','#1b2f5e'],['azul claro','#6ea8dc'],['azul medio','#3d6fb5'],
 ['azul gelo','#bcdcec'],['azul real','#2447b8'],
 ['verde escuro','#1f5130'],['verde oliva','#6b7436'],['verde musgo','#55683a'],
 ['verde claro','#7fbf6a'],['verde palido','#a9cfa0'],
 ['vermelho escuro','#7d1a16'],['vermelho queimado','#9a3a22'],
 ['cinza escuro','#4a4e54'],['cinza pedra','#8a8679'],['cinza claro','#b9bec4'],
 ['cinza aco','#7f8b96'],['inza aco','#7f8b96'],
 ['ferro escuro','#3b4046'],['roxo escuro','#44236b'],['marrom escuro','#4a2f1a'],
 ['dourado palido','#dcc87a'],['ouro opaco','#b59a45'],['amarelo queimado','#c79a1f'],
 ['areia clara','#e6d8b0'],
 ['branco','#f2efe6'],['prata','#c3c9d1'],['preto','#1c1c1f'],['vermelho','#b3261e'],
 ['verde','#2f7d3b'],['azul','#2456a6'],['dourado','#d4a82a'],['ouro','#d4a82a'],
 ['cinza','#7d838a'],['marrom','#6e4a2a'],['amarelo','#e3c11d'],['bronze','#a9743a'],
 ['laranja','#d9742a'],['ferro','#5a6068'],['roxo','#6a3d9a'],['purpura','#7b3fa0'],
 ['cobre','#b5652f'],['vinho','#6e1f33'],['bordeaux','#6e1f33'],['turquesa','#2aa6a0'],
 ['creme','#ead9b0'],['lilas','#b497d6'],['ambar','#d99a22'],['coral','#e8735a'],
 ['areia','#d6c08e'],['rosa','#d889a8'],['marfim','#efe6cf'],['aco','#7f8b96'],
];
const rgb=(hex:string):readonly [number,number,number]=>[
 parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
/** Luminância relativa aproximada (0 escuro, 1 claro). */
export const bannerLuminance=(hex:string):number=>{
 const [r,g,b]=rgb(hex);
 return (0.299*r+0.587*g+0.114*b)/255;
};
export const bannerColorDistance=(a:string,b:string):number=>{
 const [r1,g1,b1]=rgb(a),[r2,g2,b2]=rgb(b);
 return Math.sqrt((r1-r2)**2+(g1-g2)**2+(b1-b2)**2);
};
const inkFor=(hex:string):string=>bannerLuminance(hex)>0.6?'#1d1712':'#fffaf0';
/** Converte "Roxo & dourado" ou "Azul celeste, branco, dourado" em tons, na ordem escrita. */
export function parseHouseColors(text:string|null|undefined):readonly string[]{
 const found:string[]=[];
 let rest=' '+plain(text??'')+' ';
 // Procura da esquerda para a direita, preferindo sempre o nome composto mais longo.
 while(rest.trim()){
  let best:{at:number;word:string;hex:string}|null=null;
  for(const [word,hex] of COLOR_WORDS){
   const at=rest.indexOf(' '+word+' ');
   if(at<0)continue;
   if(!best||at<best.at||(at===best.at&&word.length>best.word.length))best={at,word,hex};
  }
  if(!best)break;
  if(!found.includes(best.hex))found.push(best.hex);
  rest=' '+rest.slice(best.at+best.word.length+2);
 }
 return found;
}
export type WarBannerColors=Readonly<{primary:string;secondary:string;ink:string}>;
export function bannerColors(text:string|null|undefined,fallback:WarBannerColors):WarBannerColors{
 const tones=parseHouseColors(text);
 const primary=tones[0];
 if(!primary)return fallback;
 const secondary=tones.find(t=>t!==primary&&bannerColorDistance(t,primary)>60)??
  (bannerLuminance(primary)>0.6?'#2a2420':'#e9dfc6');
 return {primary,secondary,ink:inkFor(primary)};
}
/** Lados sem Casa escolhida: o azul e o vermelho de sempre. */
export const DEFAULT_WAR_BANNERS:Readonly<Record<WarSide,WarBanner>>={
 attacker:{houseId:null,houseName:'Atacante',crest:null,
  primary:'#2f5f8f',secondary:'#e3c98a',ink:'#fffaf0'},
 defender:{houseId:null,houseName:'Defensor',crest:null,
  primary:'#9b3b30',secondary:'#d9dde2',ink:'#fffaf0'},
};
export type PublicWarHouse=Readonly<{
 id:string;name:string;region:string;crest:string|null;colorsText:string;
 symbol:string;tier:WarForceTierId;
}>;
const rec=(value:unknown):value is Record<string,unknown>=>
 Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max=120):string=>typeof value==='string'?value.trim().slice(0,max):'';
const slug=(name:string):string=>plain(name).replace(/\s+/g,'-');
/** Só brasões do acervo público do site entram no mapa. */
export function safeCrestPath(value:unknown):string|null{
 const raw=text(value,200);
 const path=raw.startsWith('assets/')?'/cormyr/'+raw:raw;
 return /^\/cormyr\/assets\/[a-z0-9._-]+\.(?:webp|png|jpe?g)$/i.test(path)?path:null;
}
/** Lê o cadastro público (`window.CORMYR_DATA`) já convertido em objeto. */
export function parsePublicWarHouses(data:unknown):readonly PublicWarHouse[]{
 if(!rec(data)||!Array.isArray(data['regions']))return [];
 const houses:PublicWarHouse[]=[],seen=new Set<string>();
 for(const region of data['regions']){
  if(!rec(region)||!Array.isArray(region['houses']))continue;
  const regionName=text(region['name'],60),major=plain(text(region['major'],80));
  for(const row of region['houses']){
   if(!rec(row))continue;
   const name=text(row['name'],80);
   const id=text(row['nobleId'],80)||slug(name);
   if(!name||!id||seen.has(id))continue;
   seen.add(id);
   const hierarchy=rec(row['hierarchy'])?row['hierarchy']:{};
   const kind=text(hierarchy['kind'],30),parent=plain(text(hierarchy['parent'],80));
   // Porte sugerido pela hierarquia pública: Coroa, Casa regente, vassala direta e terceiro nível.
   const tier:WarForceTierId=kind==='crown'?'major':
    kind==='regional'||plain(name)===major?'strong':
    kind==='documented'&&parent&&parent!==major?'minor':'vassal';
   houses.push({id,name,region:regionName,crest:safeCrestPath(row['crest']),
    colorsText:text(row['colors'],80),symbol:text(row['symbol'],80),tier});
  }
 }
 return houses.sort((a,b)=>a.region.localeCompare(b.region,'pt-BR')||
  a.name.localeCompare(b.name,'pt-BR'));
}
/** Extrai o objeto do arquivo `data.js` do site (atribuição a window.CORMYR_DATA). */
export function parsePublicWarHouseScript(source:string):readonly PublicWarHouse[]{
 const start=source.indexOf('{'),end=source.lastIndexOf('}');
 if(start<0||end<=start)return [];
 try{return parsePublicWarHouses(JSON.parse(source.slice(start,end+1)) as unknown);}
 catch{return [];}
}
/** Casas sem cores no cadastro recebem um par fixo, escolhido pelo próprio nome. */
const SPARE_COLORS:readonly (readonly [string,string])[]=[
 ['#6a3d9a','#d4a82a'],['#1f5130','#c3c9d1'],['#7d1a16','#d4a82a'],['#14274f','#c3c9d1'],
 ['#a9743a','#1c1c1f'],['#2aa6a0','#f2efe6'],['#4a4e54','#d9742a'],['#6e1f33','#ead9b0'],
];
export function houseWarBanner(house:PublicWarHouse|null,side:WarSide):WarBanner{
 if(!house)return DEFAULT_WAR_BANNERS[side];
 let hash=0;
 for(const ch of house.id)hash=(hash*31+ch.charCodeAt(0))>>>0;
 const [primary,secondary]=SPARE_COLORS[hash%SPARE_COLORS.length]!;
 return {houseId:house.id,houseName:house.name,crest:house.crest,
  ...bannerColors(house.colorsText,{primary,secondary,ink:inkFor(primary)})};
}
/** Garante que os dois exércitos não fiquem com a mesma cor no mapa. */
export function contrastWarBanners(attacker:WarBanner,defender:WarBanner):
 Readonly<Record<WarSide,WarBanner>>{
 if(bannerColorDistance(attacker.primary,defender.primary)>=90)return {attacker,defender};
 if(bannerColorDistance(attacker.primary,defender.secondary)>=90)
  return {attacker,defender:{...defender,primary:defender.secondary,
   secondary:defender.primary,ink:inkFor(defender.secondary)}};
 // Mesmas cores dos dois lados (uma Casa contra si mesma): o defensor inverte o contraste.
 const flipped=bannerLuminance(attacker.primary)>0.5?'#2a2420':'#efe6cf';
 return {attacker,defender:{...defender,primary:flipped,secondary:defender.primary,ink:inkFor(flipped)}};
}
/** Bandeiras gravadas na batalha, revalidadas (um salvamento local não é confiável). */
function cleanBanner(raw:unknown,base:WarBanner):WarBanner{
 if(!rec(raw))return base;
 const primary=text(raw['primary'],7),secondary=text(raw['secondary'],7);
 if(!HEX.test(primary)||!HEX.test(secondary))return base;
 return {houseId:text(raw['houseId'],80)||null,
  houseName:text(raw['houseName'],80)||base.houseName,
  crest:safeCrestPath(raw['crest']),primary,secondary,ink:inkFor(primary)};
}
/** Bandeira de cada tropa: a da Casa aliada que a trouxe ou a do seu lado. */
export function readUnitBanners(battle:Pick<WarBattle,'banners'|'unitBanners'|'units'>|null|undefined):
 Readonly<Record<string,WarBanner>>{
 const sides=readWarBanners(battle);
 const own:unknown=battle?.unitBanners;
 const result:Record<string,WarBanner>={};
 for(const unit of battle?.units??[])
  result[unit.id]=cleanBanner(rec(own)?own[unit.id]:null,sides[unit.side]);
 return result;
}
export function readWarBanners(battle:Pick<WarBattle,'banners'>|null|undefined):
 Readonly<Record<WarSide,WarBanner>>{
 const clean=(side:WarSide):WarBanner=>{
  const raw:unknown=battle?.banners?.[side];
  const base=DEFAULT_WAR_BANNERS[side];
  if(!rec(raw))return base;
  const primary=text(raw['primary'],7),secondary=text(raw['secondary'],7);
  if(!HEX.test(primary)||!HEX.test(secondary))return base;
  return {houseId:text(raw['houseId'],80)||null,
   houseName:text(raw['houseName'],80)||base.houseName,
   crest:safeCrestPath(raw['crest']),primary,secondary,ink:inkFor(primary)};
 };
 return {attacker:clean('attacker'),defender:clean('defender')};
}
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV'];
/** "Infantaria II de Phelles": nomes de mesa para tropas montadas pelo Poder. */
export function bannerUnitNames(rows:readonly Readonly<{id:string;side:WarSide;typeLabel:string;
 /** Bandeira própria da tropa, quando veio de uma Casa aliada. */
 banner?:WarBanner}>[],
 banners:Readonly<Record<WarSide,WarBanner>>):Readonly<Record<string,string>>{
 const sameHouse=banners.attacker.houseName===banners.defender.houseName;
 const counts=new Map<string,number>(),names:Record<string,string>={};
 for(const row of rows){
  const banner=row.banner??banners[row.side];
  const key=row.side+'|'+banner.houseName+'|'+row.typeLabel;
  const n=(counts.get(key)??0)+1;
  counts.set(key,n);
  const owner=banner.houseId&&!sameHouse?'de '+banner.houseName:
   row.side==='attacker'?'atacante':'defensor';
  names[row.id]=row.typeLabel+' '+(ROMAN[n-1]??String(n))+' '+owner;
 }
 return names;
}
