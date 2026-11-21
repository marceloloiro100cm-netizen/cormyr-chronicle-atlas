import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowDown,ArrowUp,GripVertical,ImagePlus,Pencil,Trash2,UserPlus} from 'lucide-react';
import {signedStaffPhoto} from '@/lib/newspaper/data';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {handleNewspaperTextareaTab} from '@/lib/newspaper/editing';
import {staffByline,validateStaffMember,type NewspaperStaffMember} from '@/lib/newspaper/model';

export function StaffPhoto({path,name,id,src}:{path:string|null;name:string;id?:string;src?:string}){
 const firebasePhoto=Boolean(path&&id&&firebaseWorkspaceClient());
 const direct=src??(firebasePhoto?'/api/public/newspaper-staff-photo?staff='+encodeURIComponent(id!):undefined);
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[path,direct]);
 const photo=useQuery({queryKey:['newspaper-staff-photo',path],queryFn:()=>signedStaffPhoto(path!),
  enabled:Boolean(path)&&!direct,staleTime:45*60*1000,retry:false});
 const image=direct??photo.data;
 if(image&&!failed)return <img className="folha-staff-photo" src={image}
  alt={`Foto de ${name}`} onError={()=>setFailed(true)}/>;
 return <div className="folha-staff-photo folha-staff-photo-empty" aria-label={`Retrato indisponível de ${name}`}>
  {name.trim().slice(0,1).toUpperCase()||'?'}</div>;
}

/** Corpo de funcionários da Redação: foto, nome, especialidade e texto, todos campos livres. */
export function NewspaperStaff({staff,busy,onSave,onDelete,onReorder}:{
 staff:NewspaperStaffMember[];busy:boolean;
 onSave:(input:{id?:string;name:string;specialty:string;bio:string;photoPath:string|null},photo:File|null)=>Promise<boolean>;
 onDelete:(member:NewspaperStaffMember)=>void;
 /** Leva o funcionário `id` para a posição de `targetId`; a ordem é a que os jogadores veem. */
 onReorder?:(id:string,targetId:string)=>void;
}){
 const [dragId,setDragId]=useState<string|null>(null);
 const [overId,setOverId]=useState<string|null>(null);
 const canReorder=Boolean(onReorder)&&staff.length>1;
 const endDrag=()=>{setDragId(null);setOverId(null);};
 const [editing,setEditing]=useState<NewspaperStaffMember|'new'|null>(null);
 const [name,setName]=useState('');
 const [specialty,setSpecialty]=useState('');
 const [bio,setBio]=useState('');
 const [photo,setPhoto]=useState<File|null>(null);
 const [error,setError]=useState('');
 const open=(member:NewspaperStaffMember|'new')=>{
  setEditing(member);setError('');setPhoto(null);
  setName(member==='new'?'':member.name);
  setSpecialty(member==='new'?'':member.specialty);
  setBio(member==='new'?'':member.bio);
 };
 const submit=async()=>{
  const problem=validateStaffMember({name,specialty,bio});
  if(problem){setError(problem);return;}
  const ok=await onSave({
   ...(editing&&editing!=='new'?{id:editing.id}:{}),name,specialty,bio,
   photoPath:editing&&editing!=='new'?editing.photo_path:null,
  },photo);
  if(ok)setEditing(null);
 };
 return <div className="folha-staff">
  {editing===null&&<button type="button" className="folha-text-action" onClick={()=>open('new')}>
   <UserPlus size={16}/> Novo funcionário</button>}
  {editing!==null&&<form className="folha-staff-form" aria-label="Funcionário da Redação"
   onSubmit={e=>{e.preventDefault();void submit();}}>
   <label>Nome<input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
   <label>Especialidade<input value={specialty} maxLength={120}
    placeholder="Ex.: Correspondente de guerra" onChange={e=>setSpecialty(e.target.value)}/></label>
   <label>Texto<textarea rows={5} value={bio} maxLength={3000}
    placeholder="Apresentação livre do funcionário." onChange={e=>setBio(e.target.value)}
    onKeyDown={e=>handleNewspaperTextareaTab(e,setBio)}/></label>
   <label className="newspaper-upload"><ImagePlus size={17}/> {photo?photo.name:'Foto (opcional)'}
    <input type="file" accept="image/png,image/jpeg,image/webp"
     onChange={e=>{setPhoto(e.target.files?.[0]??null);e.target.value='';}}/></label>
   {error&&<p className="newspaper-alert" role="alert">{error}</p>}
   <div className="newspaper-commission-actions">
    <button type="button" className="folha-text-action" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
    <button type="submit" className="folha-text-action" disabled={busy}>Salvar funcionário</button>
   </div>
  </form>}
  {staff.length===0&&editing===null?<div className="folha-future-module"><strong>Nenhum funcionário ainda</strong>
   <span>Cadastre o corpo da Redação. Eles aparecem na assinatura das matérias.</span></div>:
   <div className="folha-staff-list">{staff.map((m,index)=><article key={m.id}
    className={`folha-staff-card${dragId===m.id?' folha-staff-dragging':''}${overId===m.id&&dragId&&dragId!==m.id?' folha-staff-over':''}`}
    onDragOver={e=>{if(!dragId)return;e.preventDefault();e.dataTransfer.dropEffect='move';setOverId(m.id);}}
    onDrop={e=>{e.preventDefault();if(dragId&&dragId!==m.id)onReorder?.(dragId,m.id);endDrag();}}>
    {canReorder&&<div className="folha-staff-order">
     <button type="button" className="folha-staff-grip" draggable={!busy} disabled={busy}
      aria-label={`Arrastar ${m.name} para mudar a ordem`} title="Arraste para mudar a ordem"
      onDragStart={e=>{setDragId(m.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',m.id);
       const card=e.currentTarget.closest('article');if(card)e.dataTransfer.setDragImage(card,24,24);}}
      onDragEnd={endDrag}><GripVertical size={16}/></button>
     <button type="button" aria-label={`Subir ${m.name}`} disabled={busy||index===0}
      onClick={()=>onReorder?.(m.id,staff[index-1]!.id)}><ArrowUp size={14}/></button>
     <button type="button" aria-label={`Descer ${m.name}`} disabled={busy||index===staff.length-1}
      onClick={()=>onReorder?.(m.id,staff[index+1]!.id)}><ArrowDown size={14}/></button>
    </div>}
    <StaffPhoto id={m.id} path={m.photo_path} name={m.name}/>
    <div><strong>{m.name}</strong>{m.specialty&&<small>{m.specialty}</small>}
     {m.bio&&<p>{m.bio}</p>}
     <em>Assina: {staffByline(m)}</em></div>
    <div className="folha-staff-actions">
     <button type="button" aria-label={`Editar ${m.name}`} disabled={busy} onClick={()=>open(m)}><Pencil size={15}/></button>
     <button type="button" aria-label={`Remover ${m.name}`} disabled={busy} onClick={()=>onDelete(m)}><Trash2 size={15}/></button>
    </div>
   </article>)}</div>}
 </div>;
}
