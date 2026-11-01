import type {CharacterV2,CharacterSkillId} from '@/lib/character-v2/schema';
import {CHARACTER_SKILL_IDS,CHARACTER_SKILL_LABELS} from '@/lib/character-v2/schema';
import {findCharacterTrait,type CharacterTrait} from '@/lib/character-v2/catalog';
import './character-sheet-parts.css';

type PipsProps={
 label:string;value:number;max?:number;min?:number;disabled?:boolean|undefined;
 onValueChange?:((value:number)=>void)|undefined;
};
function Pips({label,value,max=7,min=1,disabled=false,onValueChange}:PipsProps){
 const editable=Boolean(onValueChange)&&!disabled;
 const capped=Math.max(0,Math.min(max,value));
 return <div className="character-v2-pips" role="group" aria-label={label+': '+value+' de '+max}>
  {Array.from({length:max},(_,i)=>{
    const grade=i+1,filled=grade<=capped,blocked=grade<min;
    return editable?<button key={grade} type="button" className={'character-v2-pip'+(filled?' is-filled':'')}
      aria-label={label+': selecionar '+grade} aria-pressed={filled} disabled={blocked}
      title={label+' '+grade} onClick={()=>onValueChange?.(grade)}/>:
      <span key={grade} aria-hidden="true" className={'character-v2-pip'+(filled?' is-filled':'')}/>;
  })}
  <output className="character-v2-pip-value" aria-live="polite">{value}</output>
 </div>;
}
export function SkillPips({skillId,value,max=7,onValueChange,disabled}:{
 skillId:CharacterSkillId;value:number;max?:number;disabled?:boolean|undefined;onValueChange?:((value:number)=>void)|undefined;
}){
 return <Pips label={CHARACTER_SKILL_LABELS[skillId]} value={value} max={max} min={1}
   disabled={disabled} onValueChange={onValueChange}/>;
}
export function SpecialtyPips({label,bonusDice,max=5,onValueChange,disabled}:{
 label:string;bonusDice:number;max?:number;disabled?:boolean|undefined;onValueChange?:((value:number)=>void)|undefined;
}){
 return <div className="character-v2-specialty">
   <span>{label} <small>({bonusDice}B)</small></span>
   <Pips label={'Especialidade '+label} value={bonusDice} max={max} min={1}
     disabled={disabled} onValueChange={onValueChange}/>
   {onValueChange&&!disabled&&bonusDice>0&&
     <button className="character-v2-clear" type="button" onClick={()=>onValueChange(0)}
       aria-label={'Remover pontos de '+label}>Limpar</button>}
 </div>;
}
export function TraitCard({trait,status='imported_unverified',tier}:{
 trait:CharacterTrait;status?:'imported_unverified'|'proposed'|'approved'|'inactive';tier?:number|null;
}){
 return <article className={'character-v2-trait '+(trait.kind==='flaw'?'is-flaw':'is-benefit')}
   aria-label={trait.label+' — '+(trait.kind==='flaw'?'Desvantagem':'Benefício')}>
   <div className="character-v2-trait-heading"><strong>{trait.label}</strong>
     <span>{trait.kind==='flaw'?'Desvantagem':'Benefício'}</span></div>
   <p>{trait.category==='flaw'?'Defeito':{
      fortune:'Fortuna',heritage:'Herança',ability:'Habilidade',
      martial:'Marcial',social:'Social'}[trait.category]}</p>
   {tier!==undefined&&tier!==null&&
     <Pips label={'Grau de '+trait.label} value={tier} max={3} disabled/>}
   <small>{status==='approved'?'Aprovado (efeitos aguardam motor de regras)':
     status==='inactive'?'Inativo':status==='proposed'?'Pendente de aprovação':
     'Importado — pendente de conciliação'}</small>
 </article>;
}
export function CharacterStatus({name,role,reviewStatus,stats}:{
 name:string;role:string;reviewStatus:string;
 stats?:{combatDefense?:number|null;intrigueDefense?:number|null;health?:number|null;composure?:number|null;movement?:number|null;running?:number|null};
}){
 const cells=[
  ['Defesa de Combate',stats?.combatDefense],['Defesa de Intriga',stats?.intrigueDefense],
  ['Saúde',stats?.health],['Compostura',stats?.composure],
  ['Movimento',stats?.movement],['Corrida',stats?.running],
 ] as const;
 return <section className="character-v2-status" aria-label={'Resumo de '+name}>
  <header><div><p>FICHA DE PERSONAGEM · V2</p><h3>{name}</h3><span>{role}</span></div>
   <small>{reviewStatus==='approved'?'Verificado':'Prévia — requer conferência'}</small></header>
  <dl className="character-v2-stats">{cells.map(([label,value])=><div key={label}>
    <dt>{label}</dt><dd>{value===null||value===undefined?'—':value}</dd></div>)}</dl>
  <p className="character-v2-disclaimer">Cálculos e modificadores serão ativados após validação do motor de regras; nenhum bônus é presumido nesta prévia.</p>
 </section>;
}
/** Lote 03: composição apenas de LEITURA. Não substituir a ficha atual antes do lote 12. */
export function CharacterV2Preview({character}: {character:CharacterV2}){
 return <div className="character-v2-preview">
  <CharacterStatus name={character.displayName} role={character.role}
    reviewStatus={character.review.status}/>
  <section aria-label="Habilidades V2" className="character-v2-section">
   <h4>Habilidades</h4>
   <div className="character-v2-skills">{CHARACTER_SKILL_IDS.map(id=>
    <div key={id} className="character-v2-skill">
     <strong>{CHARACTER_SKILL_LABELS[id]}</strong>
     <SkillPips skillId={id} value={character.skillRanks[id]}/>
    </div>)}</div>
  </section>
  {character.specialties.length>0&&<section className="character-v2-section" aria-label="Especialidades V2">
   <h4>Especialidades</h4>{character.specialties.map(s=><SpecialtyPips key={s.id}
    label={s.specialtyId} bonusDice={s.bonusDice}/>)}
  </section>}
  {character.traits.length>0&&<section className="character-v2-section" aria-label="Qualidades e defeitos V2">
   <h4>Qualidades e defeitos</h4>
   <div className="character-v2-traits">{character.traits.map(t=>{
    const trait=findCharacterTrait(t.traitId);
    return trait?<TraitCard key={t.id} trait={trait} status={t.status} tier={t.tier}/>:
     <p key={t.id}>Entrada não reconhecida: {t.traitId} (não aplicada)</p>;
   })}</div>
  </section>}
  {character.review.warnings.length>0&&<section aria-label="Pendências de conciliação"
    className="character-v2-section character-v2-warnings"><h4>Pendências de conciliação</h4>
    <ul>{character.review.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></section>}
 </div>;
}
