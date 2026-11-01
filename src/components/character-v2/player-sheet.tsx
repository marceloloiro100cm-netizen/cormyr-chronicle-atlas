import {parseFichaPersonagem} from '@/lib/ficha';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {classifyCharacterV2Source} from '@/lib/character-v2/readiness';
import {CHARACTER_SKILL_IDS,CHARACTER_SKILL_LABELS,type CharacterSkillId} from '@/lib/character-v2/schema';
import {resolveCharacterDerived,type DerivedKey} from '@/lib/character-v2/derived';
import {SkillPips,TraitCard} from './character-sheet-parts';
import {findCharacterTrait} from '@/lib/character-v2/catalog';
import {getCharacterTraitRule} from '@/lib/character-v2/trait-rules';
import {Button} from '@/components/ui/button';
import {useState} from 'react';
import {describeCharacterTrait} from '@/lib/character-v2/trait-descriptions';

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
export function CharacterV2PlayerSheet({record,houseId,canEdit=false,onEdit}:{
 record:CharacterRecord;houseId:string;canEdit?:boolean;onEdit?:()=>void;
}){
 const [downloading,setDownloading]=useState(false);
 const preview=buildCharacterPlayerPreview(record,houseId);
 if(!preview)return null;
 const {character,known,stats,specializations,traitNotes}=preview;
 const sourceVersion=preview.sourceVersion;
 async function download(){
  if(downloading)return;
  setDownloading(true);
  try{
   const {default:jsPDF}=await import('jspdf');
   const pdf=new jsPDF({unit:'mm',format:'a4'});
   let y=20;
   const write=(txt:string,bold=false)=>{
    pdf.setFont('helvetica',bold?'bold':'normal');
    pdf.setFontSize(bold?12:9);
    const lines=pdf.splitTextToSize(txt,174) as string[];
    if(y+lines.length*5>280){pdf.addPage();y=20;}
    pdf.text(lines,17,y);y+=lines.length*5+2;
   };
   write(character.displayName,true);
   write('Casa: '+houseId+' · Ficha V2 de consulta · origem v'+preview.sourceVersion);
   write('Indicadores',true);
   stats.forEach(st=>write(st.label+': '+(st.value===null?'A conferir':st.value)));
   write('Habilidades',true);
   CHARACTER_SKILL_IDS.forEach(id=>write(CHARACTER_SKILL_LABELS[id]+': '+(known.has(id)?character.skillRanks[id]:'A conferir')));
   write('Qualidades e defeitos',true);
   traitNotes.forEach(t=>{
    const detail=describeCharacterTrait(t.catalog?.id??t.original);
    write((t.kind==='flaw'?'Defeito: ':'Qualidade: ')+t.original);
    write('Efeito informado: '+(detail?.effectDescription??'A conferir')+' (aplicação não homologada)');
   });
   const bytes=pdf.output('arraybuffer');
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
   const link=document.createElement('a');link.href=url;
   link.download='ficha-'+character.displayName.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')+'.pdf';
   link.click();URL.revokeObjectURL(url);
  }finally{setDownloading(false);}
 }
 return <section className="character-v2-preview" aria-label={'Nova apresentação da ficha de '+character.displayName}>
  <header className="character-v2-header">
   <h3 className="text-2xl font-semibold">{character.displayName}</h3>
   <div className="character-v2-action-bar">
    <Button variant="outline" type="button" onClick={onEdit} disabled={!canEdit||!onEdit}>Editar ficha</Button>
    <Button variant="outline" type="button" onClick={()=>void download()} disabled={downloading}>
     {downloading?'Preparando PDF…':'Baixar ficha'}
    </Button>
   </div>
  </header>
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
 </section>;
}
