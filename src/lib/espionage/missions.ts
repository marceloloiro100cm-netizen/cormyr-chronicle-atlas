/** Lote 6 — catálogo e rascunho de missões. Nunca consulta HouseState de alvo. */
import {spyIdSchema,spyOperationSchema,spyRequestFieldsSchema,SPY_RULES_VERSION,
 SPY_REQUEST_FIELDS,type SpyAsset,type SpyOperation} from './contracts';
import {validateSpyAssignment} from './assets';
type MissionKind=SpyOperation['missionKind'];
type TargetKind=SpyOperation['targetType'];
export type SpyRequestedField=typeof SPY_REQUEST_FIELDS[number]['code'];

export const SPY_MISSIONS:Record<MissionKind,{
 title:string;targets:readonly TargetKind[];fields:readonly SpyRequestedField[];
 description:string;
}>={
 regional_recon:{title:'Reconhecimento regional',targets:['region'],
  fields:['regional_roads','regional_communities','regional_rumors','regional_risks'],
  description:'Rotas, comunidades, rumores e riscos; sem revelar notas secretas.'},
 house_recon:{title:'Reconhecimento de Casa',targets:['house'],
  fields:['house_name','house_region','house_lord','house_fortifications'],
  description:'Sede, autoridade aparente e presença conhecida.'},
 economy:{title:'Investigar economia',targets:['house'],
  fields:['house_resources','house_trade'],
  description:'Comércio e recursos; valor exato depende do Narrador.'},
 military:{title:'Investigar forças militares',targets:['house'],
  fields:['house_army','house_troop_movements','house_fortifications'],
  description:'Presença e movimentação aproximada, nunca fichas militares brutas.'},
 family:{title:'Investigar nobreza',targets:['house','person'],
  fields:['noble_family','house_family_succession','house_lord'],
  description:'Família, sucessão e vínculos autorizados.'},
 law:{title:'Investigar governo e Lei',targets:['house'],
  fields:['house_legal_environment','house_law'],
  description:'Governo e policiamento, sem expor a Lei interna por padrão.'},
 rumors:{title:'Coletar rumores',targets:['region','house'],
  fields:['regional_rumors','house_rumors'],
  description:'Pistas não equivalem a fatos comprovados.'},
 dossier_refresh:{title:'Atualizar dossiê',targets:['region','house','person'],
  fields:SPY_REQUEST_FIELDS.map(f=>f.code),
  description:'Nova coleta de evidências; nunca substitui fatos antigos silenciosamente.'},
};
export type SpyMissionDraftRequest={
 id:string;ownerHouseId:string;asset:SpyAsset;existingOperations:readonly SpyOperation[];
 targetType:TargetKind;targetId:string;kind:MissionKind;
 requestedFields:readonly string[];calendarVersion:number;
};
/** Esta prévia precisa ser confirmada em RPC com permissão de Casa, rota e regras do Narrador. */
export function createSpyMissionDraft(request:SpyMissionDraftRequest):{
 operation:SpyOperation;classification:'public'|'restricted'|'secret';requiresNarratorReview:true;
}{
 spyIdSchema.parse(request.id);
 if(!request.ownerHouseId.trim()||!request.targetId.trim())throw new Error('Mandante e alvo são obrigatórios.');
 const assignment=validateSpyAssignment(request.asset,request.existingOperations,request.ownerHouseId);
 if(!assignment.allowed)throw new Error(assignment.reasons.join(' '));
 const template=SPY_MISSIONS[request.kind];
 if(!template.targets.includes(request.targetType))throw new Error('Tipo de alvo incompatível com a missão.');
 const fields=spyRequestFieldsSchema.parse([...request.requestedFields]);
 if(fields.some(field=>!template.fields.includes(field)))throw new Error('Campo não disponível para essa categoria de missão.');
 if(request.kind==='dossier_refresh'&&request.targetType==='region'&&fields.some(field=>SPY_REQUEST_FIELDS.find(f=>f.code===field)?.kind!=='region'))
  throw new Error('Atualização regional só aceita campos de região.');
 if(request.kind==='dossier_refresh'&&request.targetType==='house'&&fields.some(field=>SPY_REQUEST_FIELDS.find(f=>f.code===field)?.kind!=='house'))
  throw new Error('Atualização de Casa só aceita campos da Casa.');
 if(request.targetType==='person'&&fields.some(field=>!['noble_family','house_family_succession','house_lord'].includes(field)))
  throw new Error('Informação não aprovada para investigação familiar.');
 const operation=spyOperationSchema.parse({
  id:request.id,ownerHouseId:request.ownerHouseId,assetId:request.asset.id,
  targetType:request.targetType,targetId:request.targetId,missionKind:request.kind,
  requestedFields:fields,status:'draft',sourceCalendarVersion:request.calendarVersion,
  rulesVersion:SPY_RULES_VERSION,version:1,
 });
 const classification=fields.some(f=>SPY_REQUEST_FIELDS.find(x=>x.code===f)?.classification==='secret')
  ?'secret':fields.some(f=>SPY_REQUEST_FIELDS.find(x=>x.code===f)?.classification==='restricted')
  ?'restricted':'public';
 return {operation,classification,requiresNarratorReview:true};
}
export function playerSpyMissionPreview(operation:SpyOperation){
 return {id:operation.id,kind:SPY_MISSIONS[operation.missionKind].title,
  requestedFields:operation.requestedFields,stage:operation.status,
  difficulty:'Sob avaliação do Narrador' as const,
  successChancePercent:null as null,confirmedSecrets:0 as const};
}
