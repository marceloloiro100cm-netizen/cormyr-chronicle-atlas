import type {SpyDossier} from './spy-dossier.functions';
import {spyDossierLastVerified,spyIntelligenceFreshness} from './spy-intelligence-freshness';

export type SpyDossierSort='recent'|'target';
export type SpyDossierProgress='all'|'incomplete'|'complete';
export type SpyDossierFreshness='all'|'recent'|'stale';
export type SpyDossierFilters={
 ownerHouseId?:string;targetSearch?:string;region?:string;
 progress?:SpyDossierProgress;sort?:SpyDossierSort;
 freshness?:SpyDossierFreshness;officialDate?:string|null;
};

export const normalizeDossierSearch=(value:string)=>
 value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR').trim();

export function filterSpyDossiers(
 dossiers:readonly SpyDossier[],
 filters:SpyDossierFilters,
):SpyDossier[]{
 const target=normalizeDossierSearch(filters.targetSearch??'');
 const region=normalizeDossierSearch(filters.region??'');
 const result=dossiers.filter(d=>{
  if(filters.ownerHouseId&&d.ownerHouseId!==filters.ownerHouseId)return false;
  if(target&&!normalizeDossierSearch(d.targetHouseName).includes(target))return false;
  if(region&&normalizeDossierSearch(d.targetRegion??'')!==region)return false;
  const knownResources=d.findings.filter(f=>f.objective==='house_resources').length;
  if(filters.progress==='complete'&&knownResources!==7)return false;
  if(filters.progress==='incomplete'&&knownResources===7)return false;
  if(filters.freshness&&filters.freshness!=='all'){
   const last=spyDossierLastVerified(d);
   if(!last)return false;
   const tier=spyIntelligenceFreshness(last,filters.officialDate??null).tier;
   if(filters.freshness==='recent'&&tier!=='recent')return false;
   if(filters.freshness==='stale'&&tier!=='review'&&tier!=='old')return false;
  }
  return true;
 });
 return result.sort((a,b)=>{
  if(filters.sort!=='target'){
   const latest=b.updatedAt.localeCompare(a.updatedAt);
   if(latest!==0)return latest;
  }
  return a.targetHouseName.localeCompare(b.targetHouseName,'pt-BR')||
   a.ownerHouseName.localeCompare(b.ownerHouseName,'pt-BR')||
   a.id.localeCompare(b.id);
 });
}

export function paginateSpyDossiers(
 dossiers:readonly SpyDossier[],page:number,perPage:number,
){
 const size=Math.max(1,Math.floor(perPage));
 const totalPages=Math.max(1,Math.ceil(dossiers.length/size));
 const safePage=Number.isFinite(page)?Math.min(totalPages,Math.max(1,Math.floor(page))):1;
 return {
  page:safePage,totalPages,total:dossiers.length,
  items:dossiers.slice((safePage-1)*size,safePage*size),
 };
}

export function spyDossierPendingHouseNames(
 ownerHouseId:string,targetHouseId:string,
 dossiers:readonly SpyDossier[],
){
 const record=dossiers.find(d=>d.ownerHouseId===ownerHouseId&&d.targetHouseId===targetHouseId);
 return {
  owner:record?.ownerHouseName??ownerHouseId,
  target:record?.targetHouseName??targetHouseId,
 };
}
