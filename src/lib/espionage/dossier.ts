/** Lote 7 — dossiês MATERIALIZADOS; nunca fazem join com ficha adversária. */
import {z} from 'zod';
import {spyDateKeySchema,spyIdSchema,spyIntelFactSchema,spyOperationSchema,
 SPY_REQUEST_FIELDS,type SpyIntelFact,type SpyOperation} from './contracts';
import {getHarptosOrdinal} from '../calendar/temporal-engine';
import {formatDate} from '../calendar/harptos';

const reportStateSchema=z.enum(['sealed','released','archived']);
export const spyReportSchema=z.object({
 id:spyIdSchema,operationId:spyIdSchema,ownerHouseId:z.string().min(1),
 targetType:z.enum(['house','region','person']),targetId:z.string().min(1),
 code:z.string().trim().min(1).max(64),assetCodename:z.string().trim().min(1).max(160),
 locationLabel:z.string().trim().min(1).max(180),
 observedDateKey:spyDateKeySchema,requestedFields:z.array(z.enum(SPY_REQUEST_FIELDS.map(x=>x.code) as
  [typeof SPY_REQUEST_FIELDS[number]['code'],...typeof SPY_REQUEST_FIELDS[number]['code'][]])).min(1),
 facts:z.array(spyIntelFactSchema).max(200),state:reportStateSchema,version:z.number().int().min(1),
 releaseDateKey:spyDateKeySchema.optional(),releaseReason:z.string().min(10).optional(),
}).strict().superRefine((r,ctx)=>{
 if(r.state!=='sealed'&&(!r.releaseDateKey||!r.releaseReason))
  ctx.addIssue({code:'custom',message:'Carta divulgada exige data e justificativa'});
 if(new Set(r.requestedFields).size!==r.requestedFields.length)
  ctx.addIssue({code:'custom',message:'Escopo de campos duplicado'});
});
export type SpyReport=z.infer<typeof spyReportSchema>;

export type SpyDossier={
 id:string;ownerHouseId:string;targetType:SpyReport['targetType'];targetId:string;
 facts:SpyIntelFact[];reportIds:string[];version:number;
};
/** Cobertura = campos únicos permitidos e revelados / campos solicitados elegíveis. */
export function computeDisclosureCoverage(requestedFields:readonly string[],facts:readonly SpyIntelFact[]){
 const allowed=new Set(SPY_REQUEST_FIELDS.map(x=>x.code));
 const eligible=[...new Set(requestedFields)].filter(field=>allowed.has(field as never));
 const covered=new Set(facts.filter(f=>f.approvedByNarrator&&eligible.includes(f.fieldCode)).map(f=>f.fieldCode));
 return {eligibleCount:eligible.length,resolvedCount:covered.size,
  coveragePercent:eligible.length?Math.round(covered.size/eligible.length*100):0};
}
export function sealSpyReport(input:{
 id:string;operation:SpyOperation;code:string;assetCodename:string;locationLabel:string;
 observedDateKey:string;facts:readonly SpyIntelFact[];
}):SpyReport{
 const op=spyOperationSchema.parse(input.operation);
 if(!['pending_narrator_review','operating','returning','completed'].includes(op.status))
  throw new Error('Missão não está em fase de resolução.');
 const facts=input.facts.map(f=>spyIntelFactSchema.parse(f));
 if(facts.some(f=>f.sourceOperationId!==op.id||!op.requestedFields.includes(f.fieldCode)))
  throw new Error('Fato não pertence ao escopo da operação.');
 if(facts.some(f=>!f.approvedByNarrator))
  throw new Error('Carta só aceita fatos adjudicados e autorizados pelo Narrador.');
 return spyReportSchema.parse({
  id:input.id,operationId:op.id,ownerHouseId:op.ownerHouseId,targetType:op.targetType,
  targetId:op.targetId,code:input.code,assetCodename:input.assetCodename,
  locationLabel:input.locationLabel,observedDateKey:input.observedDateKey,
  requestedFields:[...op.requestedFields],facts,state:'sealed',version:1,
 });
}
export function releaseSpyReport(report:SpyReport,review:{
 narratorAuthorized:true;narratorId:string;reason:string;dateKey:string;
 delivery:'returned'|'explicit_communication';expectedVersion:number;
}):SpyReport{
 const original=spyReportSchema.parse(report);
 if(original.state!=='sealed')throw new Error('Carta já divulgada ou arquivada.');
 if(review.narratorAuthorized!==true||!review.narratorId?.trim()||review.reason.trim().length<10)
  throw new Error('Liberação exige Narrador autorizado e justificativa.');
 if(review.expectedVersion!==original.version)throw new Error('Versão de carta desatualizada.');
 spyDateKeySchema.parse(review.dateKey);
 if(getHarptosOrdinal(review.dateKey)<getHarptosOrdinal(original.observedDateKey))
  throw new Error('Não é possível liberar antes da descoberta.');
 if(!['returned','explicit_communication'].includes(review.delivery))
  throw new Error('Entrega exige retorno confirmado ou comunicação autorizada.');
 return spyReportSchema.parse({...original,state:'released',releaseDateKey:review.dateKey,
  releaseReason:review.reason,version:original.version+1});
}
export function archiveSpyReport(report:SpyReport,expectedVersion:number){
 if(report.version!==expectedVersion||report.state!=='released')
  throw new Error('Arquivamento exige carta liberada e versão atual.');
 return spyReportSchema.parse({...report,state:'archived',version:report.version+1});
}
/** Fatos com mesmo campo podem coexistir em datas diferentes; IDs nunca são reescritos. */
export function mergeDossierFacts(current:SpyDossier,reports:readonly SpyReport[]):SpyDossier{
 const ids=new Set(current.facts.map(f=>f.id)),reportIds=new Set(current.reportIds);
 const facts=[...current.facts],included=[...current.reportIds];
 for(const report of reports){
  const r=spyReportSchema.parse(report);
  if(r.ownerHouseId!==current.ownerHouseId||r.targetId!==current.targetId||r.targetType!==current.targetType)
   throw new Error('Dossiê pertence a outra Casa ou alvo.');
  if(r.state==='sealed')continue;
  if(!reportIds.has(r.id)){reportIds.add(r.id);included.push(r.id);}
  for(const fact of r.facts){
   if(!fact.approvedByNarrator||ids.has(fact.id))continue;
   ids.add(fact.id);facts.push({...fact});
  }
 }
 return {...current,facts,reportIds:included,version:current.version+(facts.length!==current.facts.length?1:0)};
}
export function playerSpyReport(report:SpyReport,viewerHouseId:string){
 if(report.ownerHouseId!==viewerHouseId||report.state==='sealed')return null;
 const coverage=computeDisclosureCoverage(report.requestedFields,report.facts);
 return {id:report.id,code:report.code,targetType:report.targetType,targetId:report.targetId,
  observedDateKey:report.observedDateKey,releaseDateKey:report.releaseDateKey,
  locationLabel:report.locationLabel,assetCodename:report.assetCodename,
  state:report.state,coverage,
  facts:report.facts.filter(f=>f.approvedByNarrator).map(f=>({
   id:f.id,fieldCode:f.fieldCode,value:f.disclosedValue,confidence:f.confidence,
   observedDateKey:f.observedDateKey,staleAtDateKey:f.staleAtDateKey,
  }))};
}
export function projectSpyDossier(dossier:SpyDossier,viewerHouseId:string,dateKey:string){
 if(dossier.ownerHouseId!==viewerHouseId)return null;
 const today=getHarptosOrdinal(dateKey);
 return {id:dossier.id,targetId:dossier.targetId,targetType:dossier.targetType,
  facts:dossier.facts.filter(f=>f.approvedByNarrator).map(f=>({
   id:f.id,fieldCode:f.fieldCode,value:f.disclosedValue,confidence:f.confidence,
   stale:!!f.staleAtDateKey&&getHarptosOrdinal(f.staleAtDateKey)<today,
   observedDateKey:f.observedDateKey,
  }))};
}
export function formatIntelLetter(report:SpyReport,viewerHouseId:string):string|null{
 const shown=playerSpyReport(report,viewerHouseId);
 if(!shown)return null;
 const facts=shown.facts.map(f=>'- '+f.fieldCode+': '+String(f.value)+' ('+f.confidence+')').join('\n');
 return ['CARTA RESERVADA · '+shown.code,
  'Data: '+formatDate(shown.releaseDateKey),
  'Destino investigado: '+shown.targetId,
  'Local: '+shown.locationLabel,
  'Agente: '+shown.assetCodename,
  'Cobertura do objetivo: '+shown.coverage.resolvedCount+'/'+shown.coverage.eligibleCount+
   ' ('+shown.coverage.coveragePercent+'%)',
  facts||'Nenhuma informação autorizada.', 'Fim da carta.'].join('\n');
}
