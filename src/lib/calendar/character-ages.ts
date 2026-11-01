export type CharacterAgeStatus='ok'|'deceased'|'not_born'|'conflict'|'pending_review'|
 'unverified'|'pending_source'|'manual_exception'|'unknown_birth'|'unknown_life'|'unknown_death';
export type CharacterAgeState={
 status:CharacterAgeStatus;age:number|null;as_of_year:number;
 life:'alive'|'deceased'|'unknown';reason:string;
 birth_year?:number|null;death_year?:number|null;
};
export type CharacterAgeEntry={
 id:string;display_name:string;house_id:string|null;
 noble_roles:string[];race:string|null;is_noble:boolean;
 visibility:string;alive_status:string;review_status:string;confidence:string;
 birth_year:number|null;death_year:number|null;
 before_age:CharacterAgeState;after_age:CharacterAgeState;
};
export type CharacterAgeDashboard={
 current_year:number;target_year:number;
 totals:{total:number;nobles:number;alive:number;deceased:number;pending:number;
  conflicts:number;unknown:number;not_born:number;aged_nobles:number};
 characters:CharacterAgeEntry[];truncated:boolean;
};
const statuses=new Set<CharacterAgeStatus>(['ok','deceased','not_born','conflict',
 'pending_review','unverified','pending_source','manual_exception','unknown_birth','unknown_life','unknown_death']);
const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const positiveInteger=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function ageState(value:unknown,year:number):CharacterAgeState{
 if(!isObject(value)||!statuses.has(value['status'] as CharacterAgeStatus)||
  value['as_of_year']!==year||typeof value['reason']!=='string'||
  !['alive','deceased','unknown'].includes(String(value['life']))||
  (value['age']!==null&&(!positiveInteger(value['age'])||Number(value['age'])>9999)))throw new Error('Idade canônica inválida.');
 if(['ok','deceased'].includes(String(value['status']))&&value['age']===null)throw new Error('Idade confirmada sem valor.');
 if(!['ok','deceased'].includes(String(value['status']))&&value['age']!==null)throw new Error('Idade pendente não pode ter valor.');
 return value as CharacterAgeState;
}
export function validateAgeDashboard(value:unknown,year:number,target:number):CharacterAgeDashboard{
 if(!isObject(value)||value['current_year']!==year||value['target_year']!==target||
  !isObject(value['totals'])||!Array.isArray(value['characters'])||typeof value['truncated']!=='boolean')
  throw new Error('Prévia anual ausente ou de outro ano.');
 for(const key of ['total','nobles','alive','deceased','pending','conflicts','unknown','not_born','aged_nobles']){
  if(!positiveInteger(value['totals'][key]))throw new Error('Contagem de idades inválida.');
 }
 const seen=new Set<string>();
 for(const c of value['characters']){
  if(!isObject(c)||typeof c['id']!=='string'||seen.has(c['id'])||
   typeof c['display_name']!=='string'||!Array.isArray(c['noble_roles'])||
   !c['noble_roles'].every((r:unknown)=>typeof r==='string'))throw new Error('Pessoa canônica inválida.');
  seen.add(c['id']);
  ageState(c['before_age'],year);ageState(c['after_age'],target);
 }
 if(value['characters'].length>Number(value['totals']['total'])||value['characters'].length>2000)
  throw new Error('Contagem de personagens inconsistente.');
 return value as unknown as CharacterAgeDashboard;
}

/** Um arquivo administrativo de resumo cronológico, não documentos de personagens.
 * Previne interpretação de comandos em Excel/Calc ao abrir CSV.
 */
export function ageDashboardCsv(data:CharacterAgeDashboard):string{
 const safe=(s:string|number|null|undefined)=>{
  const raw=String(s??'');
  const neutral=/^[\s]*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
  return '"'+neutral.replace(/"/g,'""')+'"';
 };
 const header=['ID','Pessoa','Casa','Nobre','Ano origem','Idade origem',
  'Situação origem','Ano destino','Idade destino','Situação destino','Revisão','Confiança'];
 const records=data.characters.map(c=>[
  c['id'],c['display_name'],c['house_id'],c['is_noble']?'Sim':'Não',
  data.current_year,c['before_age'].age,c['before_age'].status,
  data.target_year,c['after_age'].age,c['after_age'].status,c['review_status'],c['confidence']
 ].map(safe).join(';'));
 return [header.map(safe).join(';'),...records].join('\r\n')+'\r\n';
}
