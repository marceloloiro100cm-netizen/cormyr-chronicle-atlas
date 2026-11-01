import {isFichaPersonagem,parseFichaPersonagem} from '@/lib/ficha';
import {parseChronicleSheet} from '@/lib/house/character-sheet';

/**
 * Read-only inventory of authorized, already-loaded records. The word "candidate"
 * never means "approved" or "ready to migrate": the Narrator must verify the
 * original, canonical identity, source version and every incomplete field.
 */
export type CharacterSourceCandidate=Readonly<{
 id:string;title:string;kind:string;content:string;
}>;
export type CharacterSourceClassification=Readonly<{
 recordId:string;kind:'structured'|'legacy'|'unrelated'|'incomplete';
 inspectable:boolean;reason:string;
 recognizedSkills:number;
}>;
export function classifyCharacterV2Source(record:CharacterSourceCandidate):CharacterSourceClassification{
 const result=(kind:CharacterSourceClassification['kind'],inspectable:boolean,
  reason:string,recognizedSkills=0):CharacterSourceClassification=>({
  recordId:record.id,kind,inspectable,reason,recognizedSkills,
 });
 if(record.kind!=='character')return result('unrelated',false,'Não é um registro de personagem.');
 const v1=parseChronicleSheet(record.content);
 if(v1)return result('structured',true,'Ficha estruturada V1 identificada; conciliação obrigatória.',19);
 if(!isFichaPersonagem(record.title,record.content))
  return result('unrelated',false,'Registro ilustrativo, membro da Corte ou narrativa; não é uma ficha.');
 const legacy=parseFichaPersonagem(record.content);
 if(!legacy.nome?.trim()||legacy.habilidades.length===0)
  return result('incomplete',false,'Ficha legada sem nome ou tabela de habilidades válida.',legacy.habilidades.length);
 return result('legacy',true,'Ficha legada identificada; habilidades ausentes e efeitos são pendências.',
  legacy.habilidades.length);
}
export function summarizeCharacterV2Sources(records:readonly CharacterSourceCandidate[]){
 const classified=records.map(classifyCharacterV2Source);
 const inspected=classified.filter(x=>x.inspectable);
 return{
  total:records.filter(x=>x.kind==='character').length,
  inspectable:inspected.length,
  structured:inspected.filter(x=>x.kind==='structured').length,
  legacy:inspected.filter(x=>x.kind==='legacy').length,
  excluded:classified.filter(x=>x.kind!=='structured'&&x.kind!=='legacy').length,
  incomplete:classified.filter(x=>x.kind==='incomplete').length,
  classified,
 };
}
