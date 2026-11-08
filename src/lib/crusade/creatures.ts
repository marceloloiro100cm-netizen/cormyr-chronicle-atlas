/** CRZ-1.0 · Lote 3, fichas de criaturas-modelo curadas.
 * Fonte normativa: 06 §6.3.5 e 03 §§3–4,8.
 * Não inclui scraping, obras protegidas nem biblioteca 5e não fornecida.
 */
import {z} from 'zod';
import {crzHash} from './ruleset';

export const CRZ_CREATURE_SCHEMA=1 as const;
export const crzSizeSchema=z.enum(['T','S','M','L','H','G']);
export const crzTrainingSchema=z.enum(['green','trained','veteran','elite']);
export const crzAbilitySchema=z.enum(['str','dex','con','int','wis','cha']);
export const crzDamageTypeSchema=z.enum([
 'acid','bludgeoning','cold','fire','force','lightning','necrotic',
 'piercing','poison','psychic','radiant','slashing','thunder',
]);
const integer=z.number().int().safe();
const nonnegative=integer.min(0);
const bounded=nonnegative.max(1_000_000);
const label=z.string().trim().min(1).max(120);
const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const creatureId=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}\|[a-z0-9][a-z0-9-]{0,39}$/);
const abilityMods=z.object({
 str:integer.min(-10).max(30),dex:integer.min(-10).max(30),
 con:integer.min(-10).max(30),int:integer.min(-10).max(30),
 wis:integer.min(-10).max(30),cha:integer.min(-10).max(30),
}).strict();
const damagePart=z.object({
 dice:z.string().regex(/^[1-9][0-9]{0,2}d[1-9][0-9]{0,3}$/),
 mod:integer.min(-1000).max(1000),avg:nonnegative.max(100_000),
 type:crzDamageTypeSchema,
}).strict();
export const crzAttackProfileSchema=z.object({
 id,name:label,kind:z.enum(['melee','ranged','save','area']),
 toHit:integer.min(-30).max(60).optional(),
 reachFt:bounded.optional(),
 rangeFt:z.object({normal:bounded.min(1),long:bounded.optional()}).strict().optional(),
 damage:z.array(damagePart).min(1).max(8),
 save:z.object({ability:crzAbilitySchema,dc:integer.min(1).max(50),
  onSave:z.enum(['half','none'])}).strict().optional(),
 area:z.object({shape:z.enum(['cone','line','sphere','cube']),
  sizeFt:bounded.min(1)}).strict().optional(),
 usage:z.object({kind:z.enum(['at-will','recharge','per-day']),
  value:nonnegative.max(100).optional()}).strict().optional(),
}).strict().superRefine((value,ctx)=>{
 if((value.kind==='melee'||value.kind==='ranged')&&value.toHit===undefined)
  ctx.addIssue({code:'custom',message:'Ataque precisa de toHit.'});
 if(value.kind==='melee'&&value.reachFt===undefined)
  ctx.addIssue({code:'custom',message:'Ataque corpo a corpo precisa de reachFt.'});
 if(value.kind==='ranged'&&!value.rangeFt)
  ctx.addIssue({code:'custom',message:'Ataque à distância precisa de rangeFt.'});
 if((value.kind==='save'||value.kind==='area')&&!value.save)
  ctx.addIssue({code:'custom',message:'Habilidade requer salvaguarda explícita.'});
 if(value.kind==='area'&&!value.area)
  ctx.addIssue({code:'custom',message:'Habilidade em área precisa de geometria.'});
 if(value.rangeFt?.long!==undefined&&value.rangeFt.long<value.rangeFt.normal)
  ctx.addIssue({code:'custom',message:'Alcance longo menor que alcance normal.'});
 if(value.usage?.kind!=='at-will'&&value.usage?.kind!==undefined&&
    value.usage.value===undefined)
  ctx.addIssue({code:'custom',message:'Uso limitado requer quantidade ou recarga.'});
});
export type CrzAttackProfile=z.infer<typeof crzAttackProfileSchema>;
export const crzProvenanceSchema=z.object({
 origin:z.enum(['5etools','open5e','srd','manual']),
 srd:z.boolean(),
 /** Licença explícita do conteúdo que se pretende usar, não licença da plataforma de origem. */
 license:z.enum(['CC-BY-4.0','CC-BY-3.0','CC0-1.0','OGL-1.0a','original-authorized','local-unverified']),
 attribution:z.string().trim().min(6).max(1000),
 /** Obrigatório para material não-SRD ou autorização direta. */
 permissionEvidence:z.string().trim().min(12).max(2000).optional(),
}).strict().superRefine((p,ctx)=>{
 if(p.origin==='srd'&&!p.srd)
  ctx.addIssue({code:'custom',message:'Origem SRD deve declarar SRD.'});
 if(!p.srd&&!p.permissionEvidence&&p.license!=='local-unverified')
  ctx.addIssue({code:'custom',message:'Conteúdo não-SRD requer evidência de uso.'});
 // O arquivo do Narrador pode ser consultado localmente. Este marcador NÃO
 // declara licença, autorização de publicação ou direito de redistribuição.
 if(p.license==='local-unverified'&&(p.origin!=='5etools'||p.srd))
  ctx.addIssue({code:'custom',message:'Importação privada exige origem 5etools e direitos não verificados.'});
 if(p.license==='original-authorized'&&!p.permissionEvidence)
  ctx.addIssue({code:'custom',message:'Autorização original requer evidência.'});
});
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const body=z.object({
 schemaVersion:z.literal(CRZ_CREATURE_SCHEMA),
 id:creatureId,name:label,source:label,page:integer.min(1).max(100000).optional(),
 size:crzSizeSchema,creatureType:label,
 tags:z.array(label).max(30),cr:z.number().finite().min(0).max(30),
 xp:bounded,proficiencyBonus:integer.min(1).max(12),abilityMods,
 hp:z.object({average:integer.min(1).max(100_000),
  formula:z.string().trim().min(1).max(80).optional()}).strict(),
 ac:integer.min(1).max(40),
 speedFt:z.object({walk:nonnegative.max(1000),
  fly:nonnegative.max(1000).optional(),swim:nonnegative.max(1000).optional(),
  climb:nonnegative.max(1000).optional(),
  burrow:nonnegative.max(1000).optional()}).strict(),
 attacks:z.array(crzAttackProfileSchema).max(40),
 multiattack:z.object({
  steps:z.array(z.object({attackId:id,count:integer.min(1).max(10)}).strict()).max(10),
  origin:z.enum(['parsed','override','fallback']),
 }).strict(),
 damageMods:z.object({resist:z.array(crzDamageTypeSchema),
  immune:z.array(crzDamageTypeSchema),
  vulnerable:z.array(crzDamageTypeSchema)}).strict(),
 conditionImmunities:z.array(label).max(100),
 traits:z.array(z.enum([
  'pack-tactics','regeneration','charge','frightful-presence',
  'magic-resistance','nimble-escape','flyby',
 ])).max(40),
 flags:z.object({flying:z.boolean(),ranged:z.boolean(),caster:z.boolean(),
  legendary:z.boolean(),swarm:z.boolean()}).strict(),
 provenance:crzProvenanceSchema,
 warnings:z.array(z.string().trim().min(1).max(600)).max(100),
}).strict().superRefine((c,ctx)=>{
 const names=new Set(c.attacks.map(a=>a.id));
 if(names.size!==c.attacks.length)
  ctx.addIssue({code:'custom',message:'IDs duplicados nos ataques.'});
 for(const step of c.multiattack.steps)
  if(!names.has(step.attackId))
   ctx.addIssue({code:'custom',message:'Multiattack referencia ataque ausente: '+step.attackId});
 if(c.multiattack.origin!=='fallback'&&c.multiattack.steps.length===0)
  ctx.addIssue({code:'custom',message:'Multiattack declarado sem passos.'});
 if(c.speedFt.walk===0&&(!c.flags.flying||!c.speedFt.fly))
  ctx.addIssue({code:'custom',message:'Criatura sem deslocamento caminhável/voador.'});
 if(c.flags.flying&&!c.speedFt.fly)
  ctx.addIssue({code:'custom',message:'Criatura voadora precisa de velocidade de voo.'});
 const groups=[c.damageMods.resist,c.damageMods.immune,c.damageMods.vulnerable];
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)
  for(const item of groups[i]!)
   if(groups[j]!.includes(item))
    ctx.addIssue({code:'custom',message:'Mitigação contraditória: '+item});
});
export const crzCreatureSchema=body.safeExtend({
 provenance:crzProvenanceSchema.safeExtend({contentHash:hash}),
});
export type CrzCreature=z.infer<typeof crzCreatureSchema>;
export type CrzCreatureBody=z.input<typeof body>;
/** O hash canônico do ruleset aceita apenas inteiros. ND fracionário 5e
 * fica explicitamente codificado em string neste domínio, sem alterar o ND da ficha.
 */
function creatureDigest(value:CrzCreatureBody):string{
 return crzHash({...value,cr:String(value.cr)});
}
export function crzSealCreature(untrusted:unknown):CrzCreature{
 const parsed=body.parse(untrusted);
 const sealed={...parsed,provenance:{
  ...parsed.provenance,contentHash:creatureDigest(parsed),
 }};
 return crzReadCreature(sealed);
}
export function crzReadCreature(untrusted:unknown):CrzCreature{
 const creature=crzCreatureSchema.parse(untrusted);
 const {contentHash,...provenance}=creature.provenance;
 const actual=creatureDigest({...creature,provenance});
 if(actual!==contentHash)throw new Error('E_SETUP_TEMPLATE: contentHash adulterado.');
 return creature;
}
export function crzCreaturePlayable(creature:CrzCreature):boolean{
 return creature.attacks.some(a=>a.kind==='melee'||a.kind==='ranged');
}
