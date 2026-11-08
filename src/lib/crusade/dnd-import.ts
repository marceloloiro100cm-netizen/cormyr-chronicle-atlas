import {z} from 'zod';
import {crzSealCreature,type CrzCreature,type CrzAttackProfile} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';
import {DND_MILITARY_CREATURES} from './dnd-military';

export const DND_MONSTER_FILE_MAX_BYTES=1_000_000;
export const DND_MONSTER_TABLE_MAX_ROWS=200;
export const DND_MONSTER_CSV_HEADERS=[
 'id','name','size','type','hp','ac','initiative','speedFt',
 'meleeAttack','meleeDamage','rangedAttack','rangedDamage','rangeFt',
 'count','side','source','license','attribution','permissionEvidence',
] as const;
export const DND_MONSTER_CSV_EXAMPLE=[
 DND_MONSTER_CSV_HEADERS.join(';'),
 'wolf-test;Lobo de treino;M;beast;11;13;2;40;+4;2d4+2;;;;6;defender;Criação do narrador;original-authorized;Criatura fictícia da campanha Cormyr;Autorização do próprio criador para uso privado no simulador',
].join('\n');
const integer=(value:unknown,label:string,min:number,max:number)=>{
 const raw=String(value??'').trim();
 if(!/^[+-]?\d+$/.test(raw))throw new Error('Tabela D&D: '+label+' exige inteiro.');
 const num=Number(raw);
 if(!Number.isSafeInteger(num)||num<min||num>max)
  throw new Error('Tabela D&D: '+label+' fora do intervalo '+min+' a '+max+'.');
 return num;
};
const natural=(input:unknown,label:string,max=120)=>{
 const value=String(input??'').trim();
 if(!value||value.length>max)throw new Error('Tabela D&D: '+label+' obrigatório (máximo '+max+').');
 return value;
};
const damage=(raw:unknown)=>{
 const value=natural(raw,'dano').replace(/\s+/g,'').toLowerCase();
 const match=/^([1-9]\d{0,2})d([1-9]\d{0,2})([+-]\d{1,3})?$/.exec(value);
 if(!match)throw new Error('Tabela D&D: dano exige formato NdM+X, por exemplo 1d8+3.');
 const dice=match[1]+'d'+match[2],mod=Number(match[3]??0);
 const avg=Math.max(0,Math.floor(Number(match[1])*(Number(match[2])+1)/2+mod));
 if(Number(match[1])*Number(match[2])>100000)
  throw new Error('Tabela D&D: dano potencial muito alto.');
 return {dice,mod,avg,type:'slashing' as const};
};
const size=(raw:unknown):'T'|'S'|'M'|'L'|'H'|'G'=> {
 const value=String(raw??'M').trim().toLowerCase();
 const sizes:Record<string,'T'|'S'|'M'|'L'|'H'|'G'>={
  t:'T',tiny:'T',miudo:'T',s:'S',small:'S',pequeno:'S',
  m:'M',medium:'M',medio:'M',l:'L',large:'L',grande:'L',
  h:'H',huge:'H',enorme:'H',g:'G',gargantuan:'G',colossal:'G',
 };
 const result=sizes[value];
 if(!result)throw new Error('Tabela D&D: tamanho não reconhecido: '+value+'.');
 return result;
};
const id=(raw:unknown)=>{
 const value=natural(raw,'id',56).toLowerCase();
 if(!/^[a-z0-9][a-z0-9-]{0,55}$/.test(value))
  throw new Error('Tabela D&D: id exige letras minúsculas, números e hífens.');
 return 'monster-'+value+'|user';
};
const LICENSES=['CC-BY-4.0','CC-BY-3.0','CC0-1.0','OGL-1.0a','original-authorized'] as const;
export type DndMonsterImported=Readonly<{
 creatures:readonly CrzCreature[];
 recommendedStacks:readonly Readonly<{
  templateId:string;side:'attacker'|'defender';count:number;
 }>[];
}>;
/** Proibir uploads desconhecidos passarem pelo cliente como funções/código.
 * CSV e JSON são tratados apenas como dados, sem chamada à rede ou banco.
 */
function csvRows(text:string):string[][]{
 const first=text.split(/\r?\n/,1)[0]??'';
 const sep=(first.match(/;/g)?.length??0)>(first.match(/,/g)?.length??0)?';':',';
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i]!;
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
  }else if(c===sep&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&text[i+1]==='\n')i++;
   row.push(field);field='';
   if(row.some(x=>x.trim()))rows.push(row);
   row=[];
  }else{field+=c;}
 }
 if(quoted)throw new Error('Tabela D&D: aspas de CSV não encerradas.');
 row.push(field);
 if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
const ALIASES:Readonly<Record<string,string>>={
 nome:'name',tamanho:'size',tipo:'type',pv:'hp',pontosdevida:'hp',
 classearmadura:'ac',ca:'ac',iniciativa:'initiative',deslocamento:'speedFt',
 deslocamentopes:'speedFt',ataquecorpoacorpo:'meleeAttack',
 danoCorpoACorpo:'meleeDamage',danocorpoacorpo:'meleeDamage',
 ataquedistancia:'rangedAttack',danodistancia:'rangedDamage',
 alcance:'rangeFt',quantidade:'count',lado:'side',fonte:'source',
 licenca:'license',atribuicao:'attribution',comprovante:'permissionEvidence',
 };
const canonicalHeader=(h:string)=>{
 const key=h.trim().replace(/^\uFEFF/,'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
 const aliases:Record<string,string>={
  ...Object.fromEntries(DND_MONSTER_CSV_HEADERS.map(h=>[
   h.toLowerCase().replace(/[^a-z0-9]/g,''),h])),
  ...Object.fromEntries(Object.entries(ALIASES).map(([k,v])=>[k.toLowerCase(),v])),
 };
 return aliases[key]??h.trim();
};
function rowsFromCsv(text:string):Record<string,unknown>[]{
 const records=csvRows(text);
 if(records.length<2)throw new Error('Tabela D&D: CSV precisa de cabeçalho e monstros.');
 const header=records[0]!.map(canonicalHeader);
 if(new Set(header).size!==header.length)throw new Error('Tabela D&D: colunas repetidas.');
 for(const required of ['id','name','hp','ac','initiative','speedFt','source','license','attribution','permissionEvidence'])
  if(!header.includes(required))throw new Error('Tabela D&D: coluna obrigatória ausente: '+required+'.');
 return records.slice(1).map((row,index)=>{
  if(row.length!==header.length)throw new Error('Tabela D&D: linha '+(index+2)+' tem colunas inconsistentes.');
  return Object.fromEntries(header.map((key,col)=>[key,row[col]?.trim()??'']));
 });
}
function parsePayload(text:string):Record<string,unknown>[]{
 if(text.length>DND_MONSTER_FILE_MAX_BYTES||!text.trim())
  throw new Error('Tabela D&D: arquivo vazio ou maior que 1 MB.');
 if(!/^\s*[\[{]/.test(text))return rowsFromCsv(text);
 let payload:unknown;
 try{payload=JSON.parse(text);}catch{throw new Error('Tabela D&D: JSON inválido.');}
 const rows=Array.isArray(payload)?payload:
  payload&&typeof payload==='object'&&'monsters' in payload?
   (payload as {monsters:unknown}).monsters:null;
 if(!Array.isArray(rows))throw new Error('Tabela D&D: JSON precisa de array ou chave monsters.');
 if(!rows.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))
  throw new Error('Tabela D&D: cada monstro exige um objeto simples.');
 return rows as Record<string,unknown>[];
}
export function parseDndMonsterTable(text:string):DndMonsterImported{
 const rows=parsePayload(text);
 if(rows.length===0||rows.length>DND_MONSTER_TABLE_MAX_ROWS)
  throw new Error('Tabela D&D: máximo de 200 monstros por arquivo.');
 const seen=new Set<string>(),creatures:CrzCreature[]=[];
 const recommendedStacks:DndMonsterImported['recommendedStacks'][number][]=[];
 for(const [index,row] of rows.entries()){
  try{
   const templateId=id(row['id']);
   if(seen.has(templateId))throw new Error('ID duplicado: '+templateId+'.');
   seen.add(templateId);
   const creatureName=natural(row['name'],'name');
   const hp=integer(row['hp'],'hp',1,100000),ac=integer(row['ac'],'ac',1,40);
   const initiative=integer(row['initiative'],'initiative',-10,30);
   const speed=integer(row['speedFt'],'speedFt',0,1000);
   const melee=String(row['meleeAttack']??'').trim(),ranged=String(row['rangedAttack']??'').trim();
   if(!melee&&!ranged)throw new Error('informar ataque corpo a corpo ou à distância.');
   const attacks:CrzAttackProfile[]=[];
   if(melee)attacks.push({id:'melee',name:'Corpo a corpo',kind:'melee',
    toHit:integer(melee,'meleeAttack',-30,60),reachFt:5,
    damage:[damage(row['meleeDamage'])]});
   if(ranged)attacks.push({id:'ranged',name:'À distância',kind:'ranged',
    toHit:integer(ranged,'rangedAttack',-30,60),
    rangeFt:{normal:integer(row['rangeFt'],'rangeFt',1,100000)},
    damage:[{...damage(row['rangedDamage']),type:'piercing'}]});
   const license=natural(row['license'],'license',40);
   if(!LICENSES.includes(license as typeof LICENSES[number]))
    throw new Error('licença não reconhecida.');
   const count=row['count']===undefined||String(row['count']).trim()===''?1:
    integer(row['count'],'count',1,1000);
   const side=String(row['side']??'defender').trim().toLowerCase();
   if(side!=='attacker'&&side!=='defender')
    throw new Error('lado deve ser attacker ou defender.');
   const kind=size(row['size']),creature=crzSealCreature({
    schemaVersion:1,id:templateId,name:creatureName,
    source:natural(row['source'],'source'),
    size:kind,creatureType:String(row['type']??'monstros').trim()||'monster',
    tags:['user-import','dnd'],cr:0.25,xp:50,proficiencyBonus:2,
    abilityMods:{str:1,dex:initiative,con:1,int:0,wis:0,cha:0},
    hp:{average:hp},ac,speedFt:{walk:speed},
    attacks,multiattack:{origin:'fallback',steps:[]},
    damageMods:{resist:[],immune:[],vulnerable:[]},conditionImmunities:[],
    traits:[],flags:{flying:false,ranged:Boolean(ranged),
     caster:false,legendary:false,swarm:false},
    provenance:{origin:'manual',srd:false,license,
     attribution:natural(row['attribution'],'attribution',1000),
     permissionEvidence:natural(row['permissionEvidence'],'permissionEvidence',2000)},
    warnings:['Ficha importada apenas para combate básico d20. Habilidades especiais, magias, testes de resistência e ações lendárias não foram convertidos.'],
   });
   creatures.push(creature);
   recommendedStacks.push({templateId,side,count});
  }catch(error){throw new Error('Tabela D&D: linha '+(index+2)+': '+
   (error instanceof Error?error.message:'valor inválido'));}
 }
 // Exige catálogo válido antes de expor as fichas para uso em combate.
 crzBuildCatalog([...DND_MILITARY_CREATURES,...creatures]);
 return {creatures,recommendedStacks};
}
