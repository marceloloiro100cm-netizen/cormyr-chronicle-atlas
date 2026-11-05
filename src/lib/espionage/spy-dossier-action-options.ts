import type {SpyIntelligenceObjective} from './spy-intelligence-rules';
import type {SpyDossier} from './spy-dossier.functions';

export type SpyDossierAdminAction='reveal'|'revalidate'|'revoke';
export type SpyDossierSubjectOption={
 objective:SpyIntelligenceObjective;key:string;name:string;
};

/**
 * Official inventory options are administrative only. A known secret may be
 * revoked even after its underlying unit/holding has disappeared from the
 * active inventory; revealing/revalidating always requires a live source.
 */
export function spyDossierActionOptions(
 official:readonly SpyDossierSubjectOption[],
 findings:readonly SpyDossier['findings'][number][],
 objective:SpyIntelligenceObjective,
 action:SpyDossierAdminAction,
):SpyDossierSubjectOption[]{
 const known=findings.filter(f=>f.objective===objective);
 const knownKeys=new Set(known.map(f=>f.key));
 if(action==='revoke'){
  return known.map(f=>{
   const name=f.snapshot['name'];
   return {objective,key:f.key,name:typeof name==='string'&&name.trim()?name:f.key};
  }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 }
 const unique=new Map<string,SpyDossierSubjectOption>();
 for(const option of official){
  if(option.objective!==objective)continue;
  if((action==='reveal')===knownKeys.has(option.key))continue;
  if(!unique.has(option.key))unique.set(option.key,option);
 }
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
