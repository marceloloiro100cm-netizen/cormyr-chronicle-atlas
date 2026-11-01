import {findCharacterTrait,normalizeTraitName,type CharacterTrait} from './catalog';
import {CHARACTER_SKILL_IDS,CHARACTER_SKILL_LABELS,type CharacterSkillId} from './schema';

export type ImportedTraitKind='quality'|'flaw';
export type ImportedTrait=Readonly<{
 kind:ImportedTraitKind;original:string;catalogTrait:CharacterTrait|null;
 detail:string|null;skillId:CharacterSkillId|null;
 /** Display only: not an approved mechanical modifier. */
 status:'imported_unverified';
}>;
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('pt-BR').trim();
const clean=(value:string)=>value.trim().replace(/^["“”'\s]+|["“”'\s]+$/g,'').trim();
const skillByName=new Map(CHARACTER_SKILL_IDS.map(id=>[normalize(CHARACTER_SKILL_LABELS[id]),id]));
const altNames:Record<string,string>={
 'assombrada':'Assombrado',
};
function parseEntry(rawValue:string,kind:ImportedTraitKind):ImportedTrait|null{
 const original=clean(rawValue);
 if(!original)return null;
 let canonical=original;
 let detail:string|null=null;
 let skillId:CharacterSkillId|null=null;
 const oldDefect=kind==='flaw'&&original.match(/^1\s+([^()]+)\(([^()]*)\)$/i);
 if(oldDefect){
  const lookup=skillByName.get(normalize(oldDefect[1]??''));
  if(lookup){
   canonical='Defeito';detail=clean(oldDefect[2]??'')||null;
   skillId=lookup;
  }
 }
 if(!oldDefect||!skillId){
  const colon=original.match(/^([^:]+):\s*(.+)$/);
  const parenthesis=original.match(/^([^()]+)\(([^()]*)\)\s*$/);
  if(colon){
   canonical=clean(colon[1]??original);detail=clean(colon[2]??'')||null;
  }else if(parenthesis){
   canonical=clean(parenthesis[1]??original);
   detail=clean(parenthesis[2]??'')||null;
  }
 }
 const normalized=normalize(canonical);
 const catalogTrait=findCharacterTrait(altNames[normalized]??canonical)??null;
 if(catalogTrait&&catalogTrait.kind!==(kind==='quality'?'benefit':'flaw')){
  // A misclassified column must never be interpreted as a different trait type.
  return{kind,original,catalogTrait:null,detail,skillId,status:'imported_unverified'};
 }
 if(kind==='flaw'&&catalogTrait?.id==='defeito-habilidade-parametrizada'&&!skillId&&detail){
  skillId=skillByName.get(normalize(detail))??null;
 }
 return{kind,original,catalogTrait,detail,skillId,status:'imported_unverified'};
}
/**
 * Reads the actual exported spreadsheet layout:
 * Qualidades · [empty] · Defeitos · ... followed by rows whose columns
 * 0 and 2 contain the respective entries. It does not extract unrelated
 * tables (e.g. "-4D", XP, equipment) as traits.
 */
export function readLegacyTraitColumns(content:string):ImportedTrait[]{
 const lines=content.split(/\r?\n/);
 const toCells=(line:string)=>line.split('·').map(clean);
 const index=lines.findIndex(line=>{
  const cols=toCells(line);
  return normalize(cols[0]??'')==='qualidades'&&normalize(cols[2]??'')==='defeitos';
 });
 if(index<0)return [];
 const traits:ImportedTrait[]=[];
 let blanks=0;
 for(const line of lines.slice(index+1,index+51)){
  const cols=toCells(line),quality=cols[0]??'',flaw=cols[2]??'';
  const header=normalize(quality);
  if(/^(graduacao|habilidade|atributos|informacoes|xp total)$/i.test(header))break;
  if(!quality&&!flaw){blanks++;if(blanks>=3)break;continue;}
  blanks=0;
  const q=parseEntry(quality,'quality');
  const f=parseEntry(flaw,'flaw');
  if(q)traits.push(q);
  if(f)traits.push(f);
 }
 return traits;
}
/** V1 fields are free text: split on lines/semicolons, NOT commas inside parameters. */
export function readStructuredTraitText(qualities:string,flaws:string):ImportedTrait[]{
 const parse=(source:string,kind:ImportedTraitKind)=>source.split(/\r?\n|;/)
  .map(x=>x.trim().replace(/^[-*•]\s*/,'')).filter(Boolean)
  .map(x=>parseEntry(x,kind)).filter((x):x is ImportedTrait=>x!==null);
 return [...parse(qualities,'quality'),...parse(flaws,'flaw')];
}
export function importTraitSelections(entries:readonly ImportedTrait[]){
 return entries.map((entry,index)=>({
  id:'imported-trait-'+(index+1),
  traitId:entry.catalogTrait?.id??'unmapped:'+normalizeTraitName(entry.original),
  tier:entry.catalogTrait?.tier??null,
  params:{
   original:entry.original,
   kind:entry.kind,
   ...(entry.detail?{detail:entry.detail}:{}),
   ...(entry.skillId?{skillId:entry.skillId}:{}),
  },
  acquiredAt:null,
  status:'imported_unverified' as const,
 }));
}
export function importedTraitIssues(entries:readonly ImportedTrait[]):string[]{
 const unknown=entries.filter(entry=>entry.catalogTrait===null);
 const ambiguous=entries.filter(entry=>entry.kind==='flaw'&&
  entry.catalogTrait?.id==='defeito-habilidade-parametrizada'&&!entry.skillId);
 return [
  ...(entries.length?['Qualidades e defeitos importados individualmente, ainda sem homologação e sem bônus automáticos.']:[]),
  ...unknown.map(x=>'Característica sem correspondência confirmada no catálogo: '+x.original),
  ...ambiguous.map(x=>'Defeito sem habilidade canônica confirmada: '+x.original),
 ];
}
