import {useState} from 'react';
import {Copy,Pencil,Plus,Trash2,X} from 'lucide-react';
import {
 BUILTIN_STORY_MODELS,NEWSPAPER_WIDTH_PRESETS,duplicatedStoryModelName,makeNewspaperBlock,
 validateStoryModel,type NewspaperBlock,type NewspaperBlockType,type StoryModel,
} from '@/lib/newspaper/model';

const TYPE_LABEL:Record<NewspaperBlockType,string>={
 headline:'Título',subtitle:'Subtítulo',article:'Coluna',image:'Imagem',quote:'Citação',notice:'Aviso',
};
type Draft={id?:string;name:string;description:string;blocks:NewspaperBlock[]};

/** Seis modelos prontos mais os do Editor-Chefe: escolher, duplicar com novo nome, editar e salvar. */
export function NewspaperStoryModels({custom,busy,onUse,onSave,onDelete}:{
 custom:StoryModel[];busy:boolean;
 onUse:(model:StoryModel)=>void;
 onSave:(input:{id?:string;name:string;description:string;blocks:NewspaperBlock[]})=>Promise<boolean>;
 onDelete:(model:StoryModel)=>void;
}){
 const [draft,setDraft]=useState<Draft|null>(null);
 const [error,setError]=useState('');
 const edit=(model:StoryModel)=>{
  setError('');
  setDraft({id:model.id,name:model.name,description:model.description,blocks:model.blocks.map(b=>({...b}))});
 };
 const duplicate=(model:StoryModel)=>{
  setError('');
  setDraft({name:duplicatedStoryModelName(model.name),description:model.description,
   blocks:model.blocks.map(b=>({...b,id:crypto.randomUUID()}))});
 };
 const patchBlock=(id:string,patch:Partial<NewspaperBlock>)=>
  setDraft(d=>d?{...d,blocks:d.blocks.map(b=>b.id===id?{...b,...patch}:b)}:d);
 const save=async()=>{
  if(!draft)return;
  const problem=validateStoryModel(draft);
  if(problem){setError(problem);return;}
  const ok=await onSave({...(draft.id?{id:draft.id}:{}),name:draft.name,description:draft.description,blocks:draft.blocks});
  if(ok)setDraft(null);
 };
 const card=(model:StoryModel)=><article key={model.id} className="folha-model-card">
  <strong>{model.name}</strong>
  <small>{model.description||'Modelo personalizado'}</small>
  <span className="folha-model-kinds">{model.blocks.map(b=>TYPE_LABEL[b.type]).join(' · ')}</span>
  <div className="folha-model-actions">
   <button type="button" className="folha-text-action" disabled={busy} onClick={()=>onUse(model)}>Usar este modelo</button>
   <button type="button" aria-label={`Duplicar ${model.name}`} title="Duplicar" disabled={busy}
    onClick={()=>duplicate(model)}><Copy size={15}/></button>
   {!model.builtin&&<>
    <button type="button" aria-label={`Editar ${model.name}`} title="Editar" disabled={busy}
     onClick={()=>edit(model)}><Pencil size={15}/></button>
    <button type="button" aria-label={`Excluir ${model.name}`} title="Excluir" disabled={busy}
     onClick={()=>onDelete(model)}><Trash2 size={15}/></button></>}
  </div>
 </article>;
 return <div className="folha-models">
  {draft&&<form className="folha-model-editor" aria-label="Editar modelo"
   onSubmit={e=>{e.preventDefault();void save();}}>
   <label>Nome do modelo<input value={draft.name} maxLength={80}
    onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Descrição<input value={draft.description} maxLength={200}
    onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
   {draft.blocks.map(b=><div key={b.id} className="folha-model-block">
    <div className="folha-model-block-head"><strong>{TYPE_LABEL[b.type]}</strong>
     <select aria-label={`Largura do bloco ${TYPE_LABEL[b.type]}`} value={b.span}
      onChange={e=>patchBlock(b.id,{span:Number(e.target.value)})}>
      {NEWSPAPER_WIDTH_PRESETS.map(w=><option key={w.span} value={w.span}>{w.label}</option>)}
     </select>
     <button type="button" aria-label="Remover bloco do modelo"
      onClick={()=>setDraft({...draft,blocks:draft.blocks.filter(x=>x.id!==b.id)})}><X size={14}/></button></div>
    {b.type!=='image'&&<textarea rows={b.type==='article'||b.type==='notice'?4:2} value={b.text}
     aria-label={`Texto do bloco ${TYPE_LABEL[b.type]}`}
     onChange={e=>patchBlock(b.id,{text:e.target.value})}/>}
    {b.type==='headline'&&<input value={b.subtitle??''} aria-label="Linha de apoio da manchete"
     onChange={e=>patchBlock(b.id,{subtitle:e.target.value})}/>}
    {b.type==='image'&&<input value={b.caption??''} aria-label="Legenda da imagem"
     onChange={e=>patchBlock(b.id,{caption:e.target.value})}/>}
   </div>)}
   <div className="folha-model-add">
    <span>Adicionar bloco:</span>
    {(Object.keys(TYPE_LABEL) as NewspaperBlockType[]).map(type=>
     <button type="button" key={type} disabled={draft.blocks.length>=12}
      onClick={()=>setDraft({...draft,blocks:[...draft.blocks,makeNewspaperBlock(type)]})}>
      <Plus size={13}/> {TYPE_LABEL[type]}</button>)}
   </div>
   {error&&<p className="newspaper-alert" role="alert">{error}</p>}
   <div className="newspaper-commission-actions">
    <button type="button" className="folha-text-action" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</button>
    <button type="submit" className="folha-text-action" disabled={busy}>Salvar modelo</button>
   </div>
  </form>}
  <div className="folha-model-grid">{[...BUILTIN_STORY_MODELS,...custom].map(card)}</div>
 </div>;
}
