/** CCA-ESP-MVP-001 — Lote 1. Contratos puros, NÃO são permissões de consulta nem tabelas. */
import {z} from 'zod';
import {parseDate} from '../calendar/harptos';

export const SPY_RULES_VERSION = 'CCA-ESP-MVP-001:v1' as const;
export const SPY_ASSET_KINDS = ['network_cell','contractor','local_contact'] as const;
export const SPY_ASSET_STATUSES = ['available','assigned','traveling','operating','returning','missing','captured','retired','lost','pending_review'] as const;
export const SPY_LOCATION_KINDS = ['region','house_seat','domain','settlement','waypoint','unknown'] as const;
export const SPY_TRAVEL_MODES = ['foot','horse','caravan','ship'] as const;
export const SPY_MISSION_KINDS = ['regional_recon','house_recon','economy','military','family','law','rumors','dossier_refresh'] as const;
export const SPY_OPERATION_STATUSES = ['draft','planned','traveling','operating','pending_narrator_review','returning','completed','cancelled'] as const;
export const SPY_SEGMENT_STATUSES = ['planned','traveling','arrived','cancelled','pending_review'] as const;
export const SPY_TARGET_KINDS = ['house','region','person'] as const;

export const spyIdSchema = z.string().uuid();
export const spyDateKeySchema = z.string().refine(value=>parseDate(value)!==null,'Data de Harptos inválida');
const versionSchema = z.number().int().min(1);
const sourceSchema = z.string().trim().min(3).max(500);
const houseIdSchema = z.string().min(1).max(100);

export const spyLocationSchema = z.object({
 id:spyIdSchema,kind:z.enum(SPY_LOCATION_KINDS),refId:z.string().min(1).max(180),
 name:z.string().trim().min(1).max(180),regionId:z.string().min(1).max(120).nullable(),
 visibility:z.enum(['public','narrator']),approved:z.boolean(),
 version:versionSchema,source:sourceSchema,
}).strict();
export type SpyLocation = z.infer<typeof spyLocationSchema>;

export const spyTravelEdgeSchema = z.object({
 id:spyIdSchema,fromLocationId:spyIdSchema,toLocationId:spyIdSchema,
 mode:z.enum(SPY_TRAVEL_MODES),baseDays:z.number().int().positive().max(3650),
 bidirectional:z.boolean(),blocked:z.boolean(),approved:z.boolean(),
 version:versionSchema,source:sourceSchema,
 approvedByNarratorId:z.string().min(1).optional(),
 approvalReason:z.string().trim().min(10).max(2000).optional(),
}).strict().superRefine((edge,ctx)=>{
 if(edge.fromLocationId===edge.toLocationId)ctx.addIssue({code:'custom',message:'Rota circular não cadastrável'});
 if(edge.approved&&(!edge.approvedByNarratorId||!edge.approvalReason))
  ctx.addIssue({code:'custom',message:'Rota aprovada exige Narrador e justificativa'});
});
export type SpyTravelEdge = z.infer<typeof spyTravelEdgeSchema>;

export const spyAssetSchema = z.object({
 id:spyIdSchema,ownerHouseId:houseIdSchema,kind:z.enum(SPY_ASSET_KINDS),
 label:z.string().trim().min(1).max(160),
 sourceHoldingId:z.string().min(1).max(200).optional(),sourcePurchaseId:z.string().min(1).max(200).optional(),
 sourceRef:z.string().min(1).max(200),
 currentLocationId:spyIdSchema.nullable(),status:z.enum(SPY_ASSET_STATUSES),
 rulesVersion:z.string().min(1),version:versionSchema,
}).strict().superRefine((a,ctx)=>{
 if(a.kind==='network_cell'&&!a.sourceHoldingId)
  ctx.addIssue({code:'custom',message:'Célula requer posse ativa de origem'});
});
export type SpyAsset = z.infer<typeof spyAssetSchema>;

export const spyOperationSchema = z.object({
 id:spyIdSchema,ownerHouseId:houseIdSchema,assetId:spyIdSchema,
 targetType:z.enum(SPY_TARGET_KINDS),targetId:z.string().min(1),
 missionKind:z.enum(SPY_MISSION_KINDS),requestedFields:z.array(z.string().min(1)).min(1).max(64),
 status:z.enum(SPY_OPERATION_STATUSES),
 sourceCalendarVersion:versionSchema,rulesVersion:z.string().min(1),version:versionSchema,
}).strict();
export type SpyOperation = z.infer<typeof spyOperationSchema>;

export const spyTravelSegmentSchema = z.object({
 id:spyIdSchema,operationId:spyIdSchema,ordinal:z.number().int().min(0),
 edgeId:spyIdSchema,fromLocationId:spyIdSchema,toLocationId:spyIdSchema,
 departureDateKey:spyDateKeySchema,arrivalDateKey:spyDateKeySchema,
 durationDays:z.number().int().positive(),edgeVersion:versionSchema,
 status:z.enum(SPY_SEGMENT_STATUSES),
}).strict();
export type SpyTravelSegment = z.infer<typeof spyTravelSegmentSchema>;

/** A categoria é elegível para pedido, NÃO autoriza revelar a ficha de outra Casa. */
export const SPY_REQUEST_FIELDS = [
 {code:'house_name',kind:'house',classification:'public'},
 {code:'house_region',kind:'house',classification:'public'},
 {code:'house_lord',kind:'house',classification:'restricted'},
 {code:'house_resources',kind:'house',classification:'secret'},
 {code:'house_army',kind:'house',classification:'secret'},
 {code:'house_law',kind:'house',classification:'secret'},
 {code:'noble_family',kind:'person',classification:'restricted'},
 {code:'regional_roads',kind:'region',classification:'public'},
 {code:'regional_rumors',kind:'region',classification:'restricted'},
 {code:'regional_communities',kind:'region',classification:'restricted'},
 {code:'regional_risks',kind:'region',classification:'restricted'},
 {code:'house_trade',kind:'house',classification:'restricted'},
 {code:'house_fortifications',kind:'house',classification:'restricted'},
 {code:'house_troop_movements',kind:'house',classification:'secret'},
 {code:'house_family_succession',kind:'house',classification:'restricted'},
 {code:'house_rumors',kind:'house',classification:'restricted'},
 {code:'house_legal_environment',kind:'house',classification:'restricted'},
 {code:'dossier_update',kind:'house',classification:'restricted'},
] as const;
export const spyRequestedFieldSchema=z.enum(SPY_REQUEST_FIELDS.map(f=>f.code) as [typeof SPY_REQUEST_FIELDS[number]['code'],...typeof SPY_REQUEST_FIELDS[number]['code'][]]);
export const spyRequestFieldsSchema=z.array(spyRequestedFieldSchema).min(1).max(SPY_REQUEST_FIELDS.length)
 .refine(values=>new Set(values).size===values.length,'Campos repetidos');
export const spyIntelFactSchema = z.object({
 id:spyIdSchema,dossierId:spyIdSchema,sourceOperationId:spyIdSchema,
 fieldCode:spyRequestedFieldSchema,disclosedValue:z.union([z.string(),z.number(),z.boolean(),z.null()]),
 confidence:z.enum(['rumor','partial','confirmed','disputed']),
 observedDateKey:spyDateKeySchema,staleAtDateKey:spyDateKeySchema.optional(),
 approvedByNarrator:z.boolean(),
}).strict();
export type SpyIntelFact=z.infer<typeof spyIntelFactSchema>;
