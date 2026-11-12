import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ImagePlus,Trash2} from 'lucide-react';
import {signedEngravingImage} from '@/lib/newspaper/data';
import type {NewspaperEngraving} from '@/lib/newspaper/model';

export function StoredEngravingImage({path,alt=''}:{path:string;alt?:string}){
 const url=useQuery({queryKey:['newspaper-engraving-url',path],queryFn:()=>signedEngravingImage(path),
  staleTime:45*60*1000,retry:false});
 if(url.data)return <img src={url.data} alt={alt} loading="lazy"/>;
 return <div className="folha-engraving-placeholder" aria-hidden="true"/>;
}

/** Gravuras do Reino: o Editor-Chefe envia imagens quadradas e escolhe quais aparecem no acervo. */
export function NewspaperEngravings({items,busy,onUpload,onToggle,onDelete}:{
 items:NewspaperEngraving[];busy:boolean;
 onUpload:(file:File,name:string)=>Promise<boolean>;
 onToggle:(item:NewspaperEngraving,inCollection:boolean)=>void;
 onDelete:(item:NewspaperEngraving)=>void;
}){
 const [name,setName]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const [error,setError]=useState('');
 const submit=async()=>{
  if(!file){setError('Escolha uma imagem para enviar.');return;}
  setError('');
  const ok=await onUpload(file,name);
  if(ok){setFile(null);setName('');}
 };
 return <section className="folha-engravings-manager" aria-label="Gravuras do Reino">
  <h4>Gravuras do Reino</h4>
  <p className="folha-empty-copy">Envie imagens para o Acervo de gravuras. A bolinha marca se a gravura aparece no acervo; desmarcada, ela continua guardada aqui.</p>
  <form className="folha-engraving-upload" onSubmit={e=>{e.preventDefault();void submit();}}>
   <label>Nome da gravura<input value={name} maxLength={80} placeholder="Ex.: Torre de Suzail"
    onChange={e=>setName(e.target.value)}/></label>
   <label className="folha-file-button"><ImagePlus size={16}/> {file?file.name:'Escolher imagem'}
    <input type="file" accept="image/png,image/jpeg,image/webp"
     onChange={e=>{setFile(e.target.files?.[0]??null);e.target.value='';}}/></label>
   <button type="submit" className="folha-text-action" disabled={busy}>Enviar gravura</button>
  </form>
  {error&&<p className="newspaper-alert" role="alert">{error}</p>}
  {items.length===0?<p className="folha-empty-copy">Nenhuma gravura enviada ainda.</p>:
   <div className="folha-engraving-library">{items.map(item=><figure key={item.id} className="folha-engraving-tile">
    <div className="folha-engraving-square"><StoredEngravingImage path={item.image_path} alt={item.name}/></div>
    <figcaption>{item.name}</figcaption>
    <div className="folha-engraving-controls">
     <button type="button" role="switch" className={`folha-dot${item.in_collection?' on':''}`}
      aria-checked={item.in_collection} aria-label={`${item.name}: aparece no acervo`}
      title={item.in_collection?'Aparece no acervo':'Fora do acervo'} disabled={busy}
      onClick={()=>onToggle(item,!item.in_collection)}/>
     <button type="button" aria-label={`Excluir gravura ${item.name}`} title="Excluir" disabled={busy}
      onClick={()=>onDelete(item)}><Trash2 size={15}/></button>
    </div></figure>)}</div>}
 </section>;
}
