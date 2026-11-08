/** Biblioteca do 5etools carregada SOMENTE pelo Narrador no navegador.
 * Não distribui o bestiário, armazena em banco, transfere dados para servidores
 * nem presume que a licença MIT do software cubra os livros de monstros.
 * Única saída para o motor D&D: PV/CA/ND/ataques básicos; sem poderes.
 */
import {crzSealCreature,type CrzCreature} from './creatures';

export const DND_5ETOOLS_ZIP_MAX_BYTES=100_000_000;
export const DND_5ETOOLS_JSON_MAX_BYTES=4_000_000;
export const DND_5ETOOLS_MAX_MONSTERS=12_000;

export type Dnd5etoolsAttack=Readonly<{
 toHit:number;dice:string;modifier:number;average:number;rangeFt?:number;
}>;
export type Dnd5etoolsCard=Readonly<{
 key:string;name:string;source:string;cr:string;crValue:number|null;
 creatureType:string;size:'T'|'S'|'M'|'L'|'H'|'G';
 hp:number|null;ac:number|null;initiativeModifier:number|null;
 speedFt:number|null;melee:Dnd5etoolsAttack|null;ranged:Dnd5etoolsAttack|null;
 ready:boolean;warnings:readonly string[];
}>;
export type Dnd5etoolsIndex=Readonly<{
 entries:readonly Dnd5etoolsCard[];
 files:number;total:number;ready:number;warnings:readonly string[];
}>;
type RawMonster=Record<string,unknown>;
const isRecord=(x:unknown):x is RawMonster=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const cap=(x:unknown,min:number,max:number):number|null=>
 typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max?x:null;
const label=(x:unknown,limit=120):string=>
 typeof x==='string'?x.trim().slice(0,limit):'';
const identity=(name:string,source:string)=>name.toLowerCase()+'::'+source.toLowerCase();
const size=(x:unknown):Dnd5etoolsCard['size']=>
 (['T','S','M','L','H','G'].includes(
  Array.isArray(x)&&typeof x[0]==='string'?x[0]:'M')?
  (Array.isArray(x)&&typeof x[0]==='string'?x[0]:'M'):'M') as Dnd5etoolsCard['size'];
const typeName=(x:unknown):string=>{
 if(typeof x==='string')return x.slice(0,70);
 if(isRecord(x)){
  if(typeof x['type']==='string')return x['type'].slice(0,70);
  return 'misto';
 }
 return 'não informado';
};
function cr(raw:unknown):{text:string;value:number|null}{
 const str=label(isRecord(raw)?raw['cr']:raw,20);
 if(!str)return {text:'—',value:null};
 const match=/^(\d+)(?:\/(\d+))?$/.exec(str);
 if(!match)return {text:str,value:null};
 const value=Number(match[1])/(match[2]?Number(match[2]):1);
 return {text:str,value:value>=0&&value<=30?value:null};
}
const hpValue=(x:unknown):number|null=>
 isRecord(x)?cap(x['average'],1,100000):null;
const armor=(x:unknown):number|null=>{
 if(!Array.isArray(x)||!x.length)return null;
 const first=x[0];
 return cap(isRecord(first)?first['ac']:first,1,40);
};
function speed(x:unknown):number|null{
 if(!isRecord(x))return null;
 const walk=x['walk'];
 const raw=isRecord(walk)?walk['number']:walk;
 const direct=cap(raw,0,1000);
 if(direct!==null)return direct;
 const fly=isRecord(x['fly'])?x['fly']['number']:x['fly'];
 return cap(fly,1,1000);
}
function flattenEntries(x:unknown,limit=1200):string{
 if(typeof x==='string')return x.slice(0,limit);
 if(Array.isArray(x))return x.map(v=>flattenEntries(v,limit)).join(' ').slice(0,limit);
 if(isRecord(x))return flattenEntries(x['entries']??x['items']??[],limit);
 return '';
}
function parseBasicAttack(action:unknown):{kind:'melee'|'ranged';attack:Dnd5etoolsAttack}|null{
 if(!isRecord(action))return null;
 const text=flattenEntries(action['entries']);
 const tag=/(?:\{@atk\s+([a-z,]+)\}|\{@atkr\s+([a-z,]+)\})/i.exec(text);
 const tagCode=(tag?.[1]??tag?.[2]??'').toLowerCase();
 const ranged=/^(?:r|rw|rs|ranged)/.test(tagCode)||
  (tagCode==='m,r')||(!tagCode&&/\b(?:ranged (?:weapon )?attack|ranged attack roll)\b/i.test(text));
 const melee=/^(?:m|mw|ms|melee)/.test(tagCode)||
  (tagCode==='m,r')||(!tagCode&&/\b(?:melee (?:weapon )?attack|melee attack roll)\b/i.test(text));
 if(!ranged&&!melee)return null;
 const hit=/\{@hit\s*([+-]?\d{1,2})\}/i.exec(text)||
  /(?:attack roll:|to hit:)\s*\+?([+-]?\d{1,2})/i.exec(text);
 const dmg=/\{@damage\s+(\d{1,3})d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?\}/i.exec(text);
 if(!hit||!dmg)return null;
 const dice=dmg[1]+'d'+dmg[2],modifier=Number(dmg[4]??0)*(dmg[3]==='-'?-1:1);
 const toHit=Number(hit[1]);
 if(toHit< -30||toHit>60||Number(dmg[1])*Number(dmg[2])>100000||
    modifier< -1000||modifier>1000)return null;
 const kind=ranged&&!melee?'ranged':
  ranged&&melee&&/\brange\s+\d+/.test(text)?'ranged':'melee';
 const range=/\brange\s+(\d{1,5})(?:\s*\/\s*\d{1,5})?\s*ft\b/i.exec(text);
 const attack:Dnd5etoolsAttack={toHit,dice,modifier,
  average:Math.max(0,Math.floor(Number(dmg[1])*(Number(dmg[2])+1)/2+modifier)),
  ...(kind==='ranged'?{rangeFt:Math.max(5,Math.min(100000,Number(range?.[1]??80)))}:{})};
 return {kind,attack};
}
function attacks(raw:unknown):{melee:Dnd5etoolsAttack|null;ranged:Dnd5etoolsAttack|null}{
 const actions=Array.isArray(raw)?raw:[];
 let melee:Dnd5etoolsAttack|null=null,ranged:Dnd5etoolsAttack|null=null;
 for(const action of actions){
  const result=parseBasicAttack(action);
  if(result?.kind==='melee'&&!melee)melee=result.attack;
  if(result?.kind==='ranged'&&!ranged)ranged=result.attack;
  if(melee&&ranged)break;
 }
 return {melee,ranged};
}
function copyBase(monster:RawMonster,lookup:Map<string,RawMonster>,
 visited=new Set<string>()):{value:RawMonster;warnings:string[]}{
 if(!isRecord(monster['_copy']))return {value:monster,warnings:[]};
 const copy=monster['_copy'] as RawMonster;
 const source=label(copy['source'])||label(monster['source']);
 const key=identity(label(copy['name']),source);
 if(visited.has(key))return {value:monster,
  warnings:['Herança circular de estatísticas no 5etools.']};
 const base=lookup.get(key);
 if(!base)return {value:monster,
  warnings:['Ficha herdada de '+key+' não encontrada no ZIP.']};
 visited.add(key);
 const parent=copyBase(base,lookup,visited);
 const warnings=[...parent.warnings];
 const mod=copy['_mod'];
 // Não aplicar algoritmos arbitrários do 5etools. Os campos alterados
 // por templates precisam ser conferidos para não exibir estatística falsa.
 if(isRecord(mod)&&['ac','hp','cr','speed','dex'].some(x=>x in mod))
  warnings.push('Variante com ajustes numéricos não resolvidos: revisar valores.');
 let inheritedAction=parent.value['action'];
 if(isRecord(mod)&&'action' in mod){
  const actionMod=mod['action'];
  const operations=Array.isArray(actionMod)?actionMod:[actionMod];
  let updated=Array.isArray(inheritedAction)?[...inheritedAction]:[];
  let safe=true;
  for(const op of operations){
   if(!isRecord(op)||op['mode']!=='replaceArr'||!isRecord(op['items'])||
      typeof op['replace']!=='string'){safe=false;break;}
   const i=updated.findIndex(x=>isRecord(x)&&x['name']===op['replace']);
   if(i<0){safe=false;break;}
   updated[i]=op['items'];
  }
  if(safe)inheritedAction=updated;
  else warnings.push('Variante com modificadores de ataque não resolvidos: revisar.');
 }
 return {value:{...parent.value,...monster,
  // A ficha herda atributos base, mas as ações podem ter sido substituídas.
  ...(!('action' in monster)?{action:inheritedAction}:{}),
 },warnings};
}
function cardFor(row:RawMonster,lookup:Map<string,RawMonster>):Dnd5etoolsCard|null{
 const name=label(row['name']),source=label(row['source'],40);
 if(!name||!source)return null;
 const {value,warnings:inheritWarnings}=copyBase(row,lookup);
 const hp=hpValue(value['hp']),ac=armor(value['ac']);
 const challenge=cr(value['cr']);
 const dex=cap(value['dex'],1,30);
 const speedFt=speed(value['speed']);
 const parsed=attacks(value['action']);
 const warnings=[...inheritWarnings];
 if(hp===null)warnings.push('PV numéricos indisponíveis.');
 if(ac===null)warnings.push('Classe de Armadura indisponível.');
 if(dex===null)warnings.push('Destreza/iniciativa indisponível.');
 if(speedFt===null||speedFt===0)warnings.push('Deslocamento indisponível.');
 if(challenge.value===null)warnings.push('ND não numérico.');
 if(!parsed.melee&&!parsed.ranged)
  warnings.push('Sem ataque básico com bônus e dano fixos identificáveis.');
 const ready=warnings.length===0;
 return {key:identity(name,source),name,source,
  cr:challenge.text,crValue:challenge.value,
  creatureType:typeName(value['type']),size:size(value['size']),
  hp,ac,initiativeModifier:dex===null?null:Math.floor((dex-10)/2),speedFt,
  ...parsed,ready,warnings};
}
/** Os dados originais nunca são publicados. Índice local reduzido em memória. */
export function indexDnd5etoolsFiles(files:readonly Readonly<{name:string;text:string}>[]):Dnd5etoolsIndex{
 const raw:RawMonster[]=[];const warnings:string[]=[];
 for(const file of files){
  let parsed:unknown;
  try{parsed=JSON.parse(file.text);}catch{
   warnings.push(file.name+': JSON inválido');continue;
  }
  if(!isRecord(parsed)||!Array.isArray(parsed['monster'])){
   warnings.push(file.name+': não é um arquivo de bestiário 5etools');continue;
  }
  for(const row of parsed['monster']){
   if(isRecord(row))raw.push(row);
   if(raw.length>DND_5ETOOLS_MAX_MONSTERS)throw Error('Bestiário excede limite de 12 mil monstros.');
  }
 }
 const lookup=new Map<string,RawMonster>();
 for(const item of raw){
  const key=identity(label(item['name']),label(item['source'],40));
  if(!lookup.has(key))lookup.set(key,item);
 }
 const entries: Dnd5etoolsCard[]=[];
 const seen=new Set<string>();
 for(const item of raw){
  const card=cardFor(item,lookup);
  if(!card||seen.has(card.key))continue;
  seen.add(card.key);entries.push(card);
 }
 entries.sort((a,b)=>a.name.localeCompare(b.name,'en')||
  a.source.localeCompare(b.source,'en'));
 return {entries,files:files.length,total:entries.length,
  ready:entries.filter(e=>e.ready).length,warnings};
}

const u16=(b:DataView,p:number)=>b.getUint16(p,true);
const u32=(b:DataView,p:number)=>b.getUint32(p,true);
type ZipEntry=Readonly<{name:string;localOffset:number;method:number;
 compressed:number;uncompressed:number;flags:number}>;
function entriesZip(buffer:ArrayBuffer):ZipEntry[]{
 const b=new DataView(buffer),bytes=new Uint8Array(buffer);
 let eocd=-1;
 for(let p=b.byteLength-22;p>=Math.max(0,b.byteLength-65557);p--)
  if(u32(b,p)===0x06054b50){eocd=p;break;}
 if(eocd<0)throw Error('Arquivo ZIP inválido: diretório final não encontrado.');
 const total=u16(b,eocd+10),directory=u32(b,eocd+16);
 if(total===0xffff||directory===0xffffffff||total>15000)
  throw Error('ZIP64 ou arquivo ZIP grande demais para importação local.');
 const result:ZipEntry[]=[];
 let p=directory;
 for(let i=0;i<total;i++){
  if(p+46>b.byteLength||u32(b,p)!==0x02014b50)
   throw Error('Arquivo ZIP corrompido.');
  const flags=u16(b,p+8),method=u16(b,p+10),compressed=u32(b,p+20),
   uncompressed=u32(b,p+24),nameLength=u16(b,p+28),
   extra=u16(b,p+30),comment=u16(b,p+32),localOffset=u32(b,p+42);
  if(p+46+nameLength+extra+comment>b.byteLength)
   throw Error('Nome de arquivo ZIP inválido.');
  const name=new TextDecoder().decode(bytes.slice(p+46,p+46+nameLength));
  if(/(?:^|\/)data\/bestiary\/bestiary-[^/]+\.json$/i.test(name)){
   if(uncompressed>DND_5ETOOLS_JSON_MAX_BYTES||compressed>10_000_000||
      flags&1||![0,8].includes(method))
    throw Error('Arquivo de bestiário ZIP grande, criptografado ou comprimido de maneira incompatível.');
   result.push({name,method,compressed,uncompressed,localOffset,flags});
  }
  p+=46+nameLength+extra+comment;
 }
 if(result.length>300)throw Error('Arquivo ZIP contém arquivos de bestiário demais.');
 const expanded=result.reduce((n,x)=>n+x.uncompressed,0);
 if(expanded>35_000_000)throw Error('Conteúdo do bestiário excede 35 MB descompactados.');
 return result;
}
async function zipText(buffer:ArrayBuffer,entry:ZipEntry):Promise<string>{
 const b=new DataView(buffer),p=entry.localOffset;
 if(p+30>b.byteLength||u32(b,p)!==0x04034b50)
  throw Error('Cabeçalho ZIP de arquivo inválido.');
 const start=p+30+u16(b,p+26)+u16(b,p+28);
 if(start+entry.compressed>b.byteLength)throw Error('Arquivo ZIP truncado.');
 const slice=buffer.slice(start,start+entry.compressed);
 let decompressed:ArrayBuffer;
 if(entry.method===0)decompressed=slice;
 else{
  if(typeof DecompressionStream==='undefined')
   throw Error('Este navegador não suporta descompactar ZIP. Extraia a pasta data/bestiary e carregue os arquivos JSON.');
  try{
   const stream=new Blob([slice]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
   decompressed=await new Response(stream).arrayBuffer();
  }catch{
   throw Error('Não foi possível descompactar '+entry.name+'.');
  }
 }
 if(decompressed.byteLength!==entry.uncompressed)
  throw Error('Tamanho de bestiário divergente no ZIP.');
 return new TextDecoder().decode(decompressed);
}
export async function readDnd5etoolsZip(file:File,
 progress?:(done:number,total:number)=>void):Promise<Dnd5etoolsIndex>{
 if(file.size>DND_5ETOOLS_ZIP_MAX_BYTES)
  throw Error('ZIP do 5etools maior que 100 MB. Use arquivos JSON individuais.');
 const buffer=await file.arrayBuffer();
 const entries=entriesZip(buffer);
 if(!entries.length)throw Error('O ZIP não possui data/bestiary/bestiary-*.json.');
 const files:Readonly<{name:string;text:string}>[]=[];
 for(let i=0;i<entries.length;i++){
  const e=entries[i]!;
  files.push({name:e.name,text:await zipText(buffer,e)});
  progress?.(i+1,entries.length);
 }
 return indexDnd5etoolsFiles(files);
}
export async function readDnd5etoolsJsonFiles(files:readonly File[]):Promise<Dnd5etoolsIndex>{
 if(files.length<1||files.length>300)
  throw Error('Selecione entre 1 e 300 arquivos JSON de bestiário.');
 const inputs:Readonly<{name:string;text:string}>[]=[];
 let total=0;
 for(const file of files){
  if(file.size>DND_5ETOOLS_JSON_MAX_BYTES)throw Error('Arquivo JSON maior que 4 MB: '+file.name);
  total+=file.size;if(total>35_000_000)throw Error('Bestiário excede 35 MB.');
  inputs.push({name:file.name,text:await file.text()});
 }
 return indexDnd5etoolsFiles(inputs);
}
const fnv=(x:string)=>{
 let h=2166136261;
 for(let i=0;i<x.length;i++)h=Math.imul(h^x.charCodeAt(i),16777619)>>>0;
 return h.toString(36);
};
export const dnd5etoolsTemplateId=(card:Dnd5etoolsCard):string=>
 'ft-'+card.name.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')
  .replace(/^-|-$/g,'').slice(0,35)+'-'+fnv(card.key)+'|local';
const xpByCr:Record<string,number>={
 '0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,
 '4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,
 '10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,
 '16':15000,'17':18000,'18':20000,'19':22000,'20':25000,
 '21':33000,'22':41000,'23':50000,'24':62000,'25':75000,
 '26':90000,'27':105000,'28':120000,'29':135000,'30':155000,
};
/** Só as estatísticas básicas são transportadas; sem habilidades/traits/magias. */
export function dnd5etoolsCreature(card:Dnd5etoolsCard):CrzCreature{
 if(!card.ready||card.hp===null||card.ac===null||
  card.initiativeModifier===null||card.speedFt===null||card.crValue===null)
  throw Error('Criatura tem atributos pendentes: '+card.warnings.join('; '));
 const toAttack=(a:Dnd5etoolsAttack,kind:'melee'|'ranged')=>({
  id:kind,name:kind==='melee'?'Corpo a corpo':'À distância',
  kind,toHit:a.toHit,
  ...(kind==='melee'?{reachFt:5}:{rangeFt:{normal:a.rangeFt??80,long:(a.rangeFt??80)*4}}),
  damage:[{dice:a.dice,mod:a.modifier,avg:a.average,
   type:kind==='melee'?'slashing' as const:'piercing' as const}],
 });
 const attacks=[
  ...(card.melee?[toAttack(card.melee,'melee')]:[]),
  ...(card.ranged?[toAttack(card.ranged,'ranged')]:[]),
 ];
 return crzSealCreature({
  schemaVersion:1,id:dnd5etoolsTemplateId(card),name:card.name,
  source:'5etools · '+card.source,
  size:card.size,creatureType:card.creatureType,tags:['dnd','local-5etools'],
  cr:card.crValue,xp:xpByCr[card.cr]??0,proficiencyBonus:2,
  abilityMods:{str:0,dex:card.initiativeModifier,con:0,int:0,wis:0,cha:0},
  hp:{average:card.hp},ac:card.ac,speedFt:{walk:card.speedFt},
  attacks,multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},conditionImmunities:[],
  traits:[],flags:{flying:false,ranged:Boolean(card.ranged),
   caster:false,legendary:false,swarm:false},
  provenance:{origin:'5etools',srd:false,license:'local-unverified',
   attribution:'5etools · '+card.source+' · dados fornecidos localmente pelo Narrador.'},
  warnings:['Uso local do arquivo do Narrador; licença de distribuição não verificada.',
   'Versão D&D simplificada: somente PV, CA, iniciativa, deslocamento e ataque básico. Sem habilidades especiais.'],
 });
}