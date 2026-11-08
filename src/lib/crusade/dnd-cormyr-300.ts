/** Importa o catálogo Cormyr 300 a partir do arquivo privado do Narrador.
 * Nenhuma entrada é publicada no código, no banco de dados ou enviada à rede.
 * Metadados, ND, PV, CA, movimento e ataques básicos exclusivamente.
 */
import {z} from 'zod';
import {crzSealCreature,crzDamageTypeSchema,type CrzAttackProfile,type CrzCreature} from './creatures';

/** Velocidade apenas operacional para fichas que trouxeram 0 pés terrestres
 * e perderam o modo de voo na seleção simplificada. NÃO é dado oficial.
 * A origem não é modificada; revisar a velocidade real no segundo lote.
 */
export const DND_PROVISIONAL_FLY_SPEED_FT=30 as const;
const groups=['Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos'] as const;
export type DndCormyrGroup=(typeof groups)[number];
export const DND_CORMYR_300_STORAGE_KEY='cormyr-dnd-catalog-300-v1';
export const DND_CORMYR_300_MAX_BYTES=600_000;
const attack=z.object({bonus:z.number().int().min(-30).max(60),
 damage:z.string().regex(/^[1-9]\d{0,2}d[1-9]\d{0,3}(?:[+-]\d{1,3})?$/),
 name:z.string().trim().min(1).max(100),
 range_ft:z.number().int().min(1).max(100000).nullable().optional(),
 damage_type:crzDamageTypeSchema.optional(),
}).strict();
const row=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,55}$/),
 name:z.string().trim().min(1).max(120),
 group:z.enum(groups),
 source:z.string().trim().min(1).max(45),
 challenge_rating:z.number().finite().min(0).max(30),
 hp:z.number().int().min(1).max(100000),
 ac:z.number().int().min(1).max(40),
 size:z.enum(['T','S','M','L','H','G']),
 speed_ft:z.number().int().min(0).max(1000),
 /** Ajuste privado opcional do Narrador; não modifica o dado original. */
 fly_ft:z.number().int().min(0).max(1000).optional(),
 dex_mod:z.number().int().min(-10).max(30).optional(),
 review_source:z.string().trim().min(4).max(240).optional(),
 melee:attack.nullable(),ranged:attack.nullable(),
 special_abilities:z.array(z.string().max(500)).optional(),
 review:z.string().max(500).optional(),
}).strict().refine(x=>x.melee!==null||x.ranged!==null,
 {message:'Criatura precisa de ataque básico.'});
/** Validar ficha individual antes de inserir no catálogo privado V2. */
export function parseDndCustomMonster(input:unknown):DndCormyrMonster{
 return row.parse(input);
}
/** Ajustes por cima da fonte privada: o registro original nunca é sobrescrito. */
export const dndCombatOverrideSchema=z.object({
 hp:z.number().int().min(1).max(100000).optional(),
 ac:z.number().int().min(1).max(40).optional(),
 speed_ft:z.number().int().min(0).max(1000).optional(),
 fly_ft:z.number().int().min(0).max(1000).optional(),
 melee_bonus:z.number().int().min(-30).max(60).optional(),
 melee_damage:attack.shape.damage.optional(),
 ranged_bonus:z.number().int().min(-30).max(60).optional(),
 ranged_damage:attack.shape.damage.optional(),
 melee_damage_type:crzDamageTypeSchema.optional(),
 ranged_damage_type:crzDamageTypeSchema.optional(),
 dex_mod:z.number().int().min(-10).max(30).optional(),
 review_source:z.string().trim().min(4).max(240).optional(),
 review_note:z.string().trim().max(500).optional(),
}).strict();
export type DndCombatOverride=z.infer<typeof dndCombatOverrideSchema>;
export type DndCombatOverrideEntry=Readonly<{monsterId:string;patch:DndCombatOverride}>;

export function applyDndCombatOverrides(catalog:DndCormyrCatalog,
 patches:readonly DndCombatOverrideEntry[]):DndCormyrCatalog{
 const byId=new Map(patches.map(entry=>[
  entry.monsterId,dndCombatOverrideSchema.parse(entry.patch),
 ]));
 const monsters=catalog.monsters.map(m=>{
  const patch=byId.get(m.id);
  if(!patch)return m;
  const melee=m.melee?{...m.melee,
   bonus:patch.melee_bonus??m.melee.bonus,
   damage:patch.melee_damage??m.melee.damage,
   ...(patch.melee_damage_type?{damage_type:patch.melee_damage_type}:{})}:null;
  const ranged=m.ranged?{...m.ranged,
   bonus:patch.ranged_bonus??m.ranged.bonus,
   damage:patch.ranged_damage??m.ranged.damage,
   ...(patch.ranged_damage_type?{damage_type:patch.ranged_damage_type}:{})}:null;
  return {...m,hp:patch.hp??m.hp,ac:patch.ac??m.ac,
   speed_ft:patch.speed_ft??m.speed_ft,
   ...(patch.fly_ft!==undefined?{fly_ft:patch.fly_ft}:{}),
   ...(patch.dex_mod!==undefined?{dex_mod:patch.dex_mod}:{}),
   ...(patch.review_note?{review:patch.review_note}:{}),
   ...(patch.review_source?{review_source:patch.review_source}:{}),
   melee,ranged};
 });
 return parseDndCormyr300(JSON.stringify({metadata:catalog.metadata,monsters}));
}

const root=z.object({
 metadata:z.object({
  catalog:z.string().min(1).max(200),
  version:z.union([z.literal(1),z.literal(2)]),
  count:z.number().int().min(1).max(500),
  groups:z.record(z.string(),z.number().int()).optional(),
 }).passthrough(),
 monsters:z.array(row).min(1).max(500),
}).strict().superRefine((data,ctx)=>{
 if(data.metadata.count!==data.monsters.length)
  ctx.addIssue({code:'custom',message:'Contagem declarada e catálogo divergentes.'});
 if(data.metadata.version===1&&data.monsters.length!==300)
  ctx.addIssue({code:'custom',message:'Catálogo legado V1 requer exatamente 300 criaturas.'});
});
export type DndCormyrMonster=z.infer<typeof row>;
export type DndCormyrCatalog=Readonly<{
 metadata:{catalog:string;count:number;version:1|2};
 monsters:readonly DndCormyrMonster[];
}>;
export type DndCormyrOptions=Readonly<{
 search:string;group:string;type:string;size:string;source:string;
 minCr:number;maxCr:number;order:'name'|'cr-asc'|'cr-desc';
}>;
export const DND_CORMYR_DEFAULT_FILTERS:DndCormyrOptions={
 search:'',group:'all',type:'all',size:'all',source:'all',
 minCr:0,maxCr:30,order:'name',
};
export function parseDndCormyr300(text:string):DndCormyrCatalog{
 if(typeof text!=='string'||text.length>DND_CORMYR_300_MAX_BYTES||!text.trim())
  throw Error('Catálogo Cormyr: selecione um JSON de até 600 KB.');
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw Error('Catálogo Cormyr: JSON inválido.');}
 const data=root.parse(raw);
 const seen=new Set<string>();
 const counted:Record<string,number>={};
 for(const monster of data.monsters){
  const id=monster.id.toLowerCase();
  if(seen.has(id))throw Error('Catálogo Cormyr: monstro duplicado '+monster.id);
  seen.add(id);
  counted[monster.group]=(counted[monster.group]??0)+1;
  if(monster.melee)validateDice(monster.melee.damage);
  if(monster.ranged)validateDice(monster.ranged.damage);
 }
 if(Object.keys(data.metadata.groups??{}).length)
  for(const group of groups)
   if(data.metadata.groups?.[group]!==counted[group])
    throw Error('Catálogo Cormyr: contagem do grupo '+group+' inconsistente.');
 return {metadata:{catalog:data.metadata.catalog,count:data.metadata.count,version:data.metadata.version},
  monsters:data.monsters};
}
function validateDice(raw:string){
 const match=/^([1-9]\d{0,2})d([1-9]\d{0,3})([+-]\d{1,3})?$/.exec(raw);
 if(!match||Number(match[1])*Number(match[2])>100000)
  throw Error('Catálogo Cormyr: dano excede limites do motor D&D.');
}
function damage(raw:string){
 const match=/^([1-9]\d{0,2})d([1-9]\d{0,3})([+-]\d{1,3})?$/.exec(raw);
 if(!match)throw Error('Dano inválido.');
 const dice=match[1]+'d'+match[2],mod=Number(match[3]??0);
 return {dice,mod,avg:Math.max(0,Math.floor(Number(match[1])*(Number(match[2])+1)/2+mod))};
}
const groupType:Record<DndCormyrGroup,string>={
 'Dragões':'dragon','Goblinoides':'humanoid',
 'Humanoides':'humanoid','Constructos':'construct','Mortos-vivos':'undead',
};
export const dndCormyrTemplateId=(m:DndCormyrMonster)=>
 'cy-'+m.id+'|local';
/** Alcance não é limitado por pés no modo D&D simplificado de Cormyr.
 * O token de alcance mínimo serve somente para validar o esquema genérico:
 * o motor D&D ignora distância máxima, mantendo a linha de visão.
 */
export function dndCormyrCreature(m:DndCormyrMonster):CrzCreature{
 const attacks:CrzAttackProfile[]=[];
 if(m.melee){
  const a=m.melee;
  attacks.push({id:'melee',name:a.name,kind:'melee',toHit:a.bonus,
   reachFt:5,damage:[{...damage(a.damage),type:a.damage_type??'bludgeoning'}]});
 }
 if(m.ranged){
  const a=m.ranged;
  attacks.push({id:'ranged',name:a.name,kind:'ranged',toHit:a.bonus,
   rangeFt:{normal:a.range_ft??1},
   damage:[{...damage(a.damage),type:a.damage_type??'bludgeoning'}]});
 }
 // Um efeito de alcance desconhecido NÃO pode virar golpe corpo a corpo
 // preservando dano/bônus do disparo. Para o combate simplificado, usar
 // somente um ataque provisório explicitamente não derivado da fonte.
 if(attacks.length===0){
  attacks.push({id:'basic',name:'Ataque básico provisório',kind:'melee',
   toHit:0,reachFt:5,damage:[{dice:'1d4',mod:0,avg:2,type:'bludgeoning'}]});
 }
 const provisionalFlight=m.speed_ft===0&&m.fly_ft===undefined;
 const flySpeed=m.fly_ft??(provisionalFlight?DND_PROVISIONAL_FLY_SPEED_FT:0);
 return crzSealCreature({
  schemaVersion:1,id:dndCormyrTemplateId(m),name:m.name,
  source:'5etools · '+m.source,size:m.size,
  creatureType:groupType[m.group],
  tags:['cormyr-300',m.group,m.source,
   ...(provisionalFlight?['provisional-flight']:[]),
   ...(m.speed_ft===0&&flySpeed===0?['immobile']:[]),
   ...(attacks[0]?.id==='basic'?['provisional-attack']:[]),
   ...(m.ranged?['dnd-ranged-unbounded']:[])],
  cr:m.challenge_rating,xp:0,proficiencyBonus:2,
  // O catálogo não traz DES: não inferir iniciativa de ND, dano ou CA.
  abilityMods:{str:0,dex:m.dex_mod??0,con:0,int:0,wis:0,cha:0},
  hp:{average:m.hp},ac:m.ac,speedFt:{walk:m.speed_ft,
   ...(flySpeed>0?{fly:flySpeed}:{})},
  attacks,multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[],
  flags:{flying:flySpeed>0,ranged:attacks.some(a=>a.kind==='ranged'),
   caster:false,legendary:false,swarm:false},
  provenance:{origin:'5etools',srd:false,license:'local-unverified',
   attribution:'Seleção Cormyr 300 de arquivos 5etools fornecidos pelo Narrador. Fonte '+m.source+'.'},
  warnings:[
   'Conteúdo de uso local do Narrador; licença de redistribuição não verificada.',
   'Importação simplificada: sem habilidades, multiataques especiais e magias.',
   ...(m.dex_mod===undefined?['DES não registrada na fonte resumida; iniciativa usa 0 provisório.']:[]),
   ...(m.melee&&!m.melee.damage_type?['Tipo de dano corpo a corpo não verificado; concussão neutra provisória.']:[]),
   ...(m.ranged&&!m.ranged.damage_type?['Tipo de dano à distância não verificado; concussão neutra provisória.']:[]),
   ...(m.ranged?['Ataque à distância sem limite de alcance no tabuleiro D&D; exige linha de visão.']:[]),
   ...(m.review_source?['Revisão da ficha: '+m.review_source]:[]),
   ...(provisionalFlight?['Deslocamento terrestre 0 na fonte: voo TÁTICO PROVISÓRIO de '+
     DND_PROVISIONAL_FLY_SPEED_FT+' pés. Valor não é oficial; revisar velocidade e tipo de voo.']:[]),
  ],
 });
}
export function filterDndCormyr300(
 list:readonly DndCormyrMonster[],filter:DndCormyrOptions):DndCormyrMonster[]{
 const text=filter.search.trim().toLocaleLowerCase('pt-BR');
 const result=list.filter(m=>
  (!text||[m.name,m.id,m.group,m.source].some(v=>
    v.toLocaleLowerCase('pt-BR').includes(text)))&&
  (filter.group==='all'||m.group===filter.group)&&
  (filter.type==='all'||groupType[m.group]===filter.type)&&
  (filter.size==='all'||m.size===filter.size)&&
  (filter.source==='all'||m.source===filter.source)&&
  m.challenge_rating>=filter.minCr&&m.challenge_rating<=filter.maxCr);
 return result.sort((a,b)=>{
  const byName=a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id,'en');
  if(filter.order==='cr-asc')return a.challenge_rating-b.challenge_rating||byName;
  if(filter.order==='cr-desc')return b.challenge_rating-a.challenge_rating||byName;
  return byName;
 });
}
export function saveDndCormyr300Local(catalog:DndCormyrCatalog):void{
 if(typeof window==='undefined')return;
 // A cópia fica apenas no navegador deste dispositivo, nunca nos serviços do Cormyr.
 window.localStorage.setItem(DND_CORMYR_300_STORAGE_KEY,
  JSON.stringify(catalog));
}
export function readDndCormyr300Local():DndCormyrCatalog|null{
 if(typeof window==='undefined')return null;
 const raw=window.localStorage.getItem(DND_CORMYR_300_STORAGE_KEY);
 if(!raw)return null;
 try{
  const input=JSON.parse(raw) as DndCormyrCatalog;
  return parseDndCormyr300(JSON.stringify({
   metadata:input.metadata,monsters:input.monsters,
  }));
 }catch{
  window.localStorage.removeItem(DND_CORMYR_300_STORAGE_KEY);
  return null;
 }
}
