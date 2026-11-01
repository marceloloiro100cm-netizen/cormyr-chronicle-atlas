import {readCharacterV2,type AuthorizedCharacterSource} from './read-adapter';
import {buildCharacterResolvedReport} from './equipment-report';

/** Lote 12: plano de conciliação SOMENTE LEITURA. Nunca converte por similaridade de nomes. */
export const CHARACTER_V2_RELEASE_GATE=false as const;
export type CanonicalEvidence=Readonly<{
 id:string;houseId:string|null;reviewStatus:'pending'|'reviewed'|'conflict';
 confidence:'unverified'|'supported'|'confirmed';
 sourceLinkRecordId:string|null;sourceLinkCanonicalId:string|null;
 canonicalAgeStatus?:'ok'|'deceased'|'pending_review'|'conflict'|'unknown'|undefined;
}>;
export type MigrationReview=Readonly<{
 recordId:string;sourceVersion:number;
 original:string;originalFields:Readonly<Record<string,string>>;
 candidateName:string|null;canonicalId:string|null;
 derived:ReturnType<typeof buildCharacterResolvedReport>|null;
 blockers:readonly string[];warnings:readonly string[];
 canStageDraft:boolean;canReleaseToPlayers:false;
}>;
export function reviewCharacterMigration(source:AuthorizedCharacterSource,
 canonical:CanonicalEvidence|null):MigrationReview{
 const read=readCharacterV2(source),candidate=read.character;
 const blockers:string[]=[];
 if(!candidate)blockers.push('Arquivo não foi reconhecido como ficha V1/legada válida.');
 if(!canonical)blockers.push('Personagem canônico não indicado.');
 else{
  if(canonical.houseId!==source.houseId)
   blockers.push('Casa da identidade canônica difere da Casa de origem.');
  if(canonical.reviewStatus!=='reviewed'||!['supported','confirmed'].includes(canonical.confidence))
   blockers.push('Identidade canônica exige revisão de confiança.');
  if(canonical.sourceLinkRecordId!==source.id||canonical.sourceLinkCanonicalId!==canonical.id)
   blockers.push('Não existe vínculo explícito entre registro e personagem canônico.');
  if(canonical.canonicalAgeStatus&&canonical.canonicalAgeStatus!=='ok'&&canonical.canonicalAgeStatus!=='deceased')
   blockers.push('Idade canônica pendente ou conflitante.');
 }
 if(!candidate)return{recordId:source.id,sourceVersion:source.version,original:source.content,
  originalFields:{},candidateName:null,canonicalId:canonical?.id??null,derived:null,
  blockers,warnings:read.warnings,canStageDraft:false,canReleaseToPlayers:false};
 const unparsed=candidate.source.unparsedFields;
 const report=buildCharacterResolvedReport(candidate);
 if(candidate.review.status!=='approved')
  blockers.push('Qualidades, XP, Destino e especialidades precisam de conciliação do Narrador.');
 // Lote 11 não tem RPC de compras para jogadores nem homologação de todos os equipamentos.
 if(candidate.specialties.some(s=>!s.verified)||report.pending.length)
  blockers.push('Pendências mecânicas e/ou editoriais ainda existem.');
 const legacy=unparsed['corrida']??unparsed['movement']??unparsed['movimento'];
 const warnings=[...read.warnings,...report.pending];
 if(legacy)warnings.push('Movimento/corrida original preservado para comparação: '+legacy);
 if(unparsed['destiny']||unparsed['spentDestiny'])
  warnings.push('Destino original não é convertido em créditos de ledger.');
 return{recordId:source.id,sourceVersion:source.version,original:source.content,
  originalFields:unparsed,candidateName:candidate.displayName,canonicalId:canonical?.id??null,
  derived:report,blockers,warnings,canStageDraft:blockers.length===0,canReleaseToPlayers:false};
}
/** Prevent accidental publishing even if a local UI flag is forced on. */
export function assertCharacterV2ReleaseAuthorized():never{
 throw new Error('Ficha V2 bloqueada para publicação até migração RLS e aceite do Narrador.');
}
