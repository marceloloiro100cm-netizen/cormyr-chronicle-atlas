import {parseFichaPersonagem} from '@/lib/ficha';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {classifyCharacterV2Source} from '@/lib/character-v2/readiness';
import {CHARACTER_SKILL_IDS,CHARACTER_SKILL_LABELS,type CharacterSkillId} from '@/lib/character-v2/schema';
import {resolveCharacterDerived,type DerivedKey} from '@/lib/character-v2/derived';
import {SkillPips,TraitCard} from './character-sheet-parts';
import {findCharacterTrait} from '@/lib/character-v2/catalog';
import {getCharacterTraitRule} from '@/lib/character-v2/trait-rules';

type CharacterRecord={
 id:string;title:string;kind:string;content:string;version:number;
 player_id?:string|null|undefined;
};
export type CharacterPreviewStat=Readonly<{
 key:DerivedKey;label:string;value:number|null;reason:string;
}>;
const stripAccents=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase('pt-BR').trim();
const STAT_DEPS:Readonly<Partial<Record<DerivedKey,readonly CharacterSkillId[]>>>={
 combatDefense:['agility','athletics','awareness'],
 intrigueDefense:['cunning','awareness','status'],
 maxHealth:['endurance'],maxComposure:['will'],
};
const statLabels:Readonly<Partial<Record<DerivedKey,string>>>={
 combatDefense:'Defesa de Combate',intrigueDefense:'Defesa de Intriga',
 maxHealth:'Saúde (base)',maxComposure:'Compostura (base)',
 movement:'Movimento',running:'Corrida',
};
const STATS=['combatDefense','intrigueDefense','maxHealth','maxComposure',
 'movement','running'] as const;

/**
 * Projeção exclusivamente visual. O contrato V2 ainda não permite persistir
 * dados ou creditar XP: graduações ausentes NÃO se tornam 2 pontos oficiais.
 */
export function buildCharacterPlayerPreview(record:CharacterRecord,houseId:string){
 const classification=classifyCharacterV2Source(record);
 if(!classification.inspectable)return null;
 const result=readCharacterV2({id:record.id,houseId,version:record.version,
  title:record.title,content:record.content,playerId:record.player_id??null});
 if(!result.character)return null;
 const character=result.character;
 const known=new Set<CharacterSkillId>();
 if(classification.kind==='structured'){
  for(const id of CHARACTER_SKILL_IDS)known.add(id);
 }else{
  const sheet=parseFichaPersonagem(record.content);
  for(const skill of sheet.habilidades){
   const id=CHARACTER_SKILL_IDS.find(id=>
    stripAccents(CHARACTER_SKILL_LABELS[id])===stripAccents(skill.nome));
   if(id)known.add(id);
  }
 }
 const derived=resolveCharacterDerived(character);
 const stats:CharacterPreviewStat[]=STATS.map(key=>{
  const required=STAT_DEPS[key];
  const missing=required?.filter(id=>!known.has(id))??[];
  // Movimento/Corrida exigem equipamento, Volume e benefícios homologados.
  // Exibir "4" sem Correr/Volume verificados induziria erro.
  const canQuote=Boolean(required)&&missing.length===0;
  const reason=missing.length
   ?'Falta conferir: '+missing.map(id=>CHARACTER_SKILL_LABELS[id]).join(', ')
   :canQuote?'Base sem modificadores de equipamento, condição ou qualidade.'
   :'Depende de equipamento, Volume, especialidades e qualidades homologados.';
  return{key,label:statLabels[key]??key,value:canQuote?derived.values[key]:null,reason};
 });
 const allPending=[
  ...result.warnings,
  ...(classification.kind==='legacy'?
   ['Graus extraídos de planilha legada; confira cada dado antes de jogar.']:[]),
 ];
 // Never expose originalContent through this display component or mark approved.
 const specializations=Object.entries(character.source.unparsedFields)
  .filter(([key,value])=>key.startsWith('specialty:')&&value.trim())
  .map(([key,value])=>({label:key.slice('specialty:'.length),value}));
 const traitNotes=character.traits.map(item=>({
  id:item.id,kind:item.params['kind']==='flaw'?'flaw' as const:'quality' as const,
  original:item.params['original']??item.traitId,
  detail:item.params['detail']??null,
  catalog:findCharacterTrait(item.traitId)??null,
  rule:getCharacterTraitRule(item.traitId)??null,
  status:item.status,
  tier:item.tier,
 }));
 return{character,known,stats,allPending,specializations,traitNotes,
  sourceVersion:record.version};
}
export function CharacterV2PlayerSheet({record,houseId}:{
 record:CharacterRecord;houseId:string;
}){
 const preview=buildCharacterPlayerPreview(record,houseId);
 if(!preview)return null;
 const {character,known,stats,allPending,specializations,traitNotes}=preview;
 return <section className="character-v2-preview" aria-label={'Nova apresentação da ficha de '+character.displayName}>
  <header className="character-v2-status">
   <p className="text-xs font-semibold tracking-wide">FICHA DE PERSONAGEM · VISUALIZAÇÃO V2</p>
   <h3 className="text-2xl font-semibold">{character.displayName}</h3>
   <p className="text-sm">Versão importada {preview.sourceVersion} · consulta sem edição automática</p>
  </header>
  <p className="character-v2-disclaimer">
   Apresentação nova com bolinhas. A ficha anterior permanece como documento original e
   fonte de edição. Nenhum ponto de XP, Destino, qualidade ou atributo ausente é concedido nesta visualização.
  </p>
  <section className="character-v2-section" aria-label="Indicadores derivados da ficha">
   <h4>Indicadores</h4>
   <dl className="character-v2-stats">
    {stats.map(stat=><div key={stat.key} title={stat.reason}>
      <dt>{stat.label}</dt>
      <dd>{stat.value===null?'A conferir':stat.value}</dd>
    </div>)}
   </dl>
   <p className="text-xs">Os números disponíveis são apenas cálculos básicos. Armaduras, escudos,
    ferimentos, bônus e defeitos ainda exigem homologação.</p>
  </section>
  <section className="character-v2-section" aria-label="Graduações em bolinhas">
   <h4>Habilidades</h4>
   <div className="character-v2-skills">
    {CHARACTER_SKILL_IDS.map(id=><div className="character-v2-skill" key={id}>
      <strong>{CHARACTER_SKILL_LABELS[id]}</strong>
      {known.has(id)?
        <SkillPips skillId={id} value={character.skillRanks[id]}
          max={Math.max(7,character.skillRanks[id])}/>:
        <span className="text-xs" aria-label={CHARACTER_SKILL_LABELS[id]+': graduação pendente'}>
         A conferir
        </span>}
    </div>)}
   </div>
  </section>
  {specializations.length>0&&
   <section className="character-v2-section" aria-label="Especialidades ainda não homologadas">
    <h4>Especialidades importadas</h4>
    {specializations.map(x=><p className="text-sm" key={x.label}>
     <strong>{x.label}:</strong> {x.value}</p>)}
    <p className="text-xs">Dados de bônus das especialidades exigem conferência antes do uso.</p>
   </section>}
  <section className="character-v2-section" aria-label="Qualidades e defeitos da ficha">
   <h4>Qualidades e defeitos</h4>
   <p className="text-xs">Características preservadas da ficha importada. Sem aprovação individual,
    nenhuma característica concede bônus ou aplica penalidades automaticamente.</p>
   {(['quality','flaw'] as const).map(kind=><div key={kind} className="mt-3">
    <h5 className="font-semibold mb-2">{kind==='quality'?'Qualidades':'Defeitos'} ({traitNotes.filter(t=>t.kind===kind).length})</h5>
    <div className="character-v2-traits">
     {traitNotes.filter(t=>t.kind===kind).map(item=><div key={item.id} className="min-w-0">
      {item.catalog?<TraitCard trait={item.catalog} status={item.status} tier={item.tier}/>:
       <article className="character-v2-trait" aria-label={item.original+' — sem correspondência'}>
        <strong>{item.original}</strong><p>Sem correspondência confirmada no catálogo</p>
       </article>}
      {item.catalog?.label!==item.original&&<p className="text-sm mt-1">Registro original: {item.original}</p>}
      <p className="text-xs mt-1">{item.rule?.status==='verified'
       ?'Regra catalogada; bônus bloqueado até homologação do Narrador.'
       :item.rule?.status==='narrative_manual'
       ?'Efeito narrativo: depende de avaliação do Narrador.'
       :'Regra ainda sem confirmação; nenhum efeito aplicado.'}</p>
     </div>)}
     {!traitNotes.some(t=>t.kind===kind)&&<p className="text-sm">Nenhum registro encontrado na fonte.</p>}
    </div>
   </div>)}
  </section>
  <details className="character-v2-section">
   <summary>Conferência e pendências da importação ({allPending.length})</summary>
   <ul className="list-disc pl-6 text-sm">
    {allPending.map((warning,i)=><li key={i}>{warning}</li>)}
   </ul>
  </details>
 </section>;
}
