/** Lote 6 — DADOS RESTRITOS ao Narrador. Não importar em componentes de jogador.
 * O servidor futuro deve autenticar is_campaign_admin antes de invocar a adjudicação
 * e carregar Lei de ficha-alvo via service/RLS, nunca por payload do atacante.
 */
import {z} from 'zod';
import {SPY_MISSION_KINDS,spyIdSchema,spyOperationSchema,type SpyOperation} from './contracts';

export const spyLawSnapshotSchema=z.object({
 targetId:z.string().min(1),law:z.number().int().min(0).max(100000).nullable(),
 kind:z.enum(['player_house_total','npc_approved_sheet','regional_rule','unresolved']),
 sourceVersion:z.number().int().min(1).nullable(),sourceRef:z.string().min(1).nullable(),
}).strict().superRefine((v,ctx)=>{
 if(v.kind==='unresolved'&&(v.law!==null||v.sourceVersion!==null))
  ctx.addIssue({code:'custom',message:'Lei não verificada não pode possuir valor'});
 if(v.kind!=='unresolved'&&(v.law===null||v.sourceVersion===null||!v.sourceRef))
  ctx.addIssue({code:'custom',message:'Lei confirmada exige fonte e versão'});
});
export type SpyLawSnapshot=z.infer<typeof spyLawSnapshotSchema>;
export const spyDifficultyRuleSchema=z.object({
 id:spyIdSchema,version:z.number().int().min(1),approvedByNarratorId:z.string().min(1),
 source:z.string().trim().min(5),baseByMission:z.partialRecord(z.enum(SPY_MISSION_KINDS),
  z.number().int().min(0).max(100)),
 lawRanges:z.array(z.object({min:z.number().int().min(0),max:z.number().int().min(0),
   modifier:z.number().int().min(-100).max(100)}).strict()).max(200),
 stacking:z.enum(['highest','sum','narrator_review']),
}).strict();
export type SpyDifficultyRule=z.infer<typeof spyDifficultyRuleSchema>;

export const spySecurityEffectSchema=z.object({
 sourceHoldingId:spyIdSchema,
 sourceId:z.string().min(1),
 appliedToArea:z.boolean(),
 appliesToMission:z.boolean(),
 modifier:z.number().int().min(0).max(100),
 description:z.string().max(500),
}).strict();
export type SpySecurityEffect=z.infer<typeof spySecurityEffectSchema>;
export type SpyDifficultyResult=
 |{status:'pending_narrator_rule'|'pending_law_source'|'pending_countermeasure_review';value:null;
   publicLabel:'Sob avaliação'}
 |{status:'resolved';value:number;publicLabel:'Definida pelo Narrador';narratorOnly:{
   law:number;lawSource:string;lawSourceVersion:number;base:number;lawModifier:number;
   securityModifier:number;adjustment:number;rulesVersion:number;sources:string[];
 }};

/** Dificuldade NUNCA é uma probabilidade de êxito; sem dados de rolagem não há chance percentual. */
export function resolveSpyDifficulty(input:{
 mission:SpyOperation;law:SpyLawSnapshot;rules:SpyDifficultyRule|null;
 security:readonly SpySecurityEffect[];narratorAdjustment?:number;
}):SpyDifficultyResult{
 const mission=spyOperationSchema.parse(input.mission);
 const law=spyLawSnapshotSchema.parse(input.law);
 if(law.targetId!==mission.targetId)throw new Error('Lei de alvo divergente.');
 if(!input.rules)return {status:'pending_narrator_rule',value:null,publicLabel:'Sob avaliação'};
 if(law.law===null||law.kind==='unresolved'||law.sourceVersion===null||!law.sourceRef)
  return {status:'pending_law_source',value:null,publicLabel:'Sob avaliação'};
 const rules=spyDifficultyRuleSchema.parse(input.rules);
 const base=rules.baseByMission[mission.missionKind];
 if(base===undefined)return {status:'pending_narrator_rule',value:null,publicLabel:'Sob avaliação'};
 const lawValue=law.law;
 const lawBands=rules.lawRanges.filter(b=>lawValue>=b.min&&lawValue<=b.max);
 if(lawBands.length!==1)return {status:'pending_narrator_rule',value:null,publicLabel:'Sob avaliação'};
 const candidates=input.security.map(s=>spySecurityEffectSchema.parse(s))
  .filter(s=>s.appliedToArea&&s.appliesToMission);
 const unique=new Set(candidates.map(s=>s.sourceHoldingId));
 if(unique.size!==candidates.length)throw new Error('Contramedida duplicada.');
 if(candidates.length>1&&rules.stacking==='narrator_review')
  return {status:'pending_countermeasure_review',value:null,publicLabel:'Sob avaliação'};
 const securityModifier=rules.stacking==='sum'?candidates.reduce((n,s)=>n+s.modifier,0):
  Math.max(0,...candidates.map(s=>s.modifier));
 const adj=input.narratorAdjustment??0;
 if(!Number.isInteger(adj)||Math.abs(adj)>100)throw new Error('Ajuste narratorial inválido.');
 const result=base+lawBands[0]!.modifier+securityModifier+adj;
 return {status:'resolved',value:Math.max(0,result),publicLabel:'Definida pelo Narrador',
  narratorOnly:{law:lawValue,lawSource:law.sourceRef,lawSourceVersion:law.sourceVersion,
   base,lawModifier:lawBands[0]!.modifier,securityModifier,adjustment:adj,
   rulesVersion:rules.version,sources:candidates.map(s=>s.sourceId)}};
}
export function visibleSpyDifficulty(result:SpyDifficultyResult){
 return {status:result.status,description:result.publicLabel,successChancePercent:null as null};
}
