export type NobleHouseTimeImpactStatus='advance'|'aligned'|'historical'|'ahead'|'draft'|'invalid';
export type NobleHouseTimeImpactEntry={
 house_id:string;version:number;month:number|null;
 status:NobleHouseTimeImpactStatus;project_candidates:number;
};
export type NobleHouseTimeImpact={
 calendar_version:number;base_month:number;target_month:number;
 total:number;eligible:number;ahead:number;drafts:number;invalid:number;
 aligned_or_historical:number;project_candidates:number;backdated:boolean;
 houses:NobleHouseTimeImpactEntry[];
};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const positiveInt=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const statuses=new Set<NobleHouseTimeImpactStatus>(['advance','aligned','historical','ahead','draft','invalid']);
export function validateHouseTimeImpact(v:unknown,version:number,target:number):NobleHouseTimeImpact{
 if(!object(v)||!Array.isArray(v['houses'])||
   v['calendar_version']!==version||v['target_month']!==target||
   !positiveInt(v['base_month'])||typeof v['backdated']!=='boolean')
  throw new Error('Prévia de posses indisponível ou de outra versão do calendário.');
 for(const key of ['total','eligible','ahead','drafts','invalid','aligned_or_historical','project_candidates']){
  if(!positiveInt(v[key]))throw new Error('Contagens de posses inconsistentes.');
 }
 if(v['houses'].length!==v['total']||
   Number(v['eligible'])+Number(v['ahead'])+Number(v['drafts'])+Number(v['invalid'])+Number(v['aligned_or_historical'])!==v['total'])
   throw new Error('O resumo de posses não corresponde à lista.');
 const seen=new Set<string>();let candidateSum=0;
 for(const item of v['houses']){
  if(!object(item)||typeof item['house_id']!=='string'||seen.has(item['house_id'])||
    !positiveInt(item['version'])||
    (item['month']!==null&&!positiveInt(item['month']))||
    !statuses.has(item['status'] as NobleHouseTimeImpactStatus)||
    !positiveInt(item['project_candidates']))
    throw new Error('Casa ou projeto inválido na prévia.');
  seen.add(item['house_id']);candidateSum+=Number(item['project_candidates']);
 }
 if(candidateSum!==v['project_candidates'])throw new Error('Prévia de projetos inconsistente.');
 return v as unknown as NobleHouseTimeImpact;
}
export function monthFromHarptosDate(date:{year:number;month:number}):number{
 if(!Number.isInteger(date.year)||date.year<1||date.year>9999||
  !Number.isInteger(date.month)||date.month<0||date.month>11)
  throw new Error('Data de Harptos inválida para o processamento de posses.');
 return date.year*12+date.month;
}
/** Read-only estimate. A building may have an unresolved parent,
 * so it must NOT be labeled completed until server approval/commit. */
export function projectTemporalNotice(project:{
 status:string;start:number;duration:number;modifier:number;
},houseMonth:number,officialMonth:number):'historical'|'in_progress'|'due_for_review'|'completed'|'cancelled'{
 if(project.status==='completed')return 'completed';
 if(project.status==='cancelled')return 'cancelled';
 if(project.status!=='building')return 'historical';
 const deadline=project.start+project.duration+project.modifier;
 if(!Number.isSafeInteger(deadline)||!Number.isSafeInteger(houseMonth)||
   !Number.isSafeInteger(officialMonth))return 'due_for_review';
 if(houseMonth>=deadline)return 'due_for_review';
 return officialMonth>=deadline?'due_for_review':'in_progress';
}
