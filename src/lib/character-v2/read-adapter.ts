import {parseChronicleSheet} from '@/lib/house/character-sheet';
import {parseFichaPersonagem} from '@/lib/ficha';
import {CharacterV2Schema,CHARACTER_SKILL_IDS,CHARACTER_SKILL_LABELS,emptyCharacterSkillRanks,
  type CharacterSkillId,type CharacterV2} from './schema';

/** Fonte já autorizada por RLS na camada de registros; este adaptador não busca dados. */
export type AuthorizedCharacterSource={
  id:string;houseId:string;playerId?:string|null;version:number;
  title:string;content:string;portraitRef?:string|null;
};
export type ReadResult={character:CharacterV2|null;warnings:readonly string[]};
const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const skillByLabel=new Map<string,CharacterSkillId>(
  CHARACTER_SKILL_IDS.map(id=>[norm(CHARACTER_SKILL_LABELS[id]),id]));
/** Fingerprint de mudança para prévia; NÃO é hash criptográfico, assinatura ou autorização. */
export function sourceFingerprint(text:string):string{
  let h=2166136261;
  for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),16777619);}
  return 'fnv1a32:'+((h>>>0).toString(16).padStart(8,'0'));
}
function makePreview(record:AuthorizedCharacterSource,format:'chronicle-v1'|'legacy-text',
  name:string,role:string,skills:Record<CharacterSkillId,number>,warnings:string[],
  unparsedFields:Record<string,string>):ReadResult {
  const item={
    schemaVersion:2,id:record.id,houseId:record.houseId,playerId:record.playerId??null,
    displayName:name,role,portraitRef:record.portraitRef??null,
    sourceRecordIds:[record.id],canonicalAgeRef:null,version:0,
    skillRanks:skills,specialties:[],traits:[],equipment:[],
    state:{healthCurrent:null,composureCurrent:null,injuries:[],wounds:[],conditions:[]},
    source:{format,recordId:record.id,recordVersion:record.version,
      sourceFingerprint:sourceFingerprint(record.content),originalContent:record.content,
      unparsedFields},
    review:{status:'needs_review' as const,warnings},
    migrationStatus:'read_only_preview' as const,
  };
  const parsed=CharacterV2Schema.safeParse(item);
  if(!parsed.success)return{character:null,warnings:[...warnings,
    'Registro V1 inválido para leitura V2: '+parsed.error.issues.map(x=>x.path.join('.')).join(', ')]};
  return{character:parsed.data,warnings};
}
/**
 * Lote 02: adaptação em memória. Não salva, não compra XP, não aplica bônus,
 * não transforma Briga em graduação de Luta e não altera o documento original.
 */
export function readCharacterV2(record:AuthorizedCharacterSource):ReadResult{
  const v1=parseChronicleSheet(record.content);
  if(v1){
    const warnings:string[]=[];
    const ranks=emptyCharacterSkillRanks();
    for(const id of CHARACTER_SKILL_IDS){
      if(id==='cunning') {ranks.cunning=v1.cunning;continue;}
      const label=CHARACTER_SKILL_LABELS[id];
      ranks[id]=v1.skills[label as keyof typeof v1.skills]??2;
    }
    const unusedBrawl=v1.skills['Briga'];
    if(unusedBrawl!==undefined&&unusedBrawl!==2)
      warnings.push('Briga V1 não é habilidade autônoma: graduação preservada, conciliar com especialidade de Luta.');
    if(v1.specialties.trim())warnings.push('Especialidades em texto aguardam conciliação por habilidade/bonusDice.');
    if(v1.qualities.trim()||v1.flaws.trim())warnings.push('Qualidades e defeitos em texto aguardam mapeamento de catálogo.');
    warnings.push('XP, Destino, idade canônica e equipamento não são migrados automaticamente.');
    return makePreview(record,'chronicle-v1',v1.name,v1.role,ranks,warnings,{
      specialties:v1.specialties,qualities:v1.qualities,flaws:v1.flaws,
      brawlingRank:String(v1.skills['Briga']??2),
      destiny:String(v1.destiny),spentDestiny:String(v1.spentDestiny),
      xpSpent:String(v1.xpSpent),
      birthYear:String(v1.birthYear??''),birthDate:v1.birthDate??'',
      shield:String(v1.shield),armorPenalty:String(v1.armorPenalty),
      movement:String(v1.movement),
    });
  }
  const legacy=parseFichaPersonagem(record.content);
  const name=legacy.nome?.trim();
  if(!name||(!legacy.habilidades.length&&!record.content.includes('Nome do Personagem')))
    return{character:null,warnings:['Registro não identificado como ficha de personagem V1 ou legado.']};
  const warnings:string[]=[];
  const ranks=emptyCharacterSkillRanks(),unparsed:Record<string,string>={};
  for(const h of legacy.habilidades){
    const id=skillByLabel.get(norm(h.nome));
    if(id){ranks[id]=h.graduacao;}
    else{unparsed['skill:'+h.nome]=String(h.graduacao);warnings.push('Habilidade não reconhecida: '+h.nome);}
    if(h.especializacao)unparsed['specialty:'+h.nome]=h.especializacao;
  }
  if(legacy.habilidades.some(h=>norm(h.nome)==='briga'))
    warnings.push('Briga no legado exige conciliação como especialidade, sem ganho automático de Luta.');
  for(const [name,value] of Object.entries({
    idade:legacy.idade,player:legacy.jogador,virtude:legacy.virtude,vicio:legacy.vicio,
    defesaIntriga:legacy.defesaIntriga,compostura:legacy.compostura,
    movimento:legacy.movimento,corrida:legacy.corrida
  }))if(value)unparsed[name]=value;
  warnings.push('Valores derivados declarados (inclusive Corrida) não são aceitos como cálculos canônicos.');
  warnings.push('Importação legada somente leitura: graduação, especialidades e identidade requerem confirmação.');
  return makePreview(record,'legacy-text',name,'Personagem legado',ranks,warnings,unparsed);
}
/** Round-trip reversível por identidade e conteúdo: nenhuma mutação histórica ocorre. */
export function restoreOriginalCharacterSource(preview:CharacterV2):{
  id:string;version:number;content:string;sourceFingerprint:string
}{
  return {id:preview.source.recordId,version:preview.source.recordVersion,
    content:preview.source.originalContent,sourceFingerprint:preview.source.sourceFingerprint};
}
