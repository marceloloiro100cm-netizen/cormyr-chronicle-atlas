import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ImagePlus,Trash2} from 'lucide-react';
import {signedEngravingImage} from '@/lib/newspaper/data';
import {NEWSPAPER_ENGRAVINGS,type NewspaperEngraving} from '@/lib/newspaper/model';

/** Mostra a gravura do acervo: original do site (src direto) ou enviada (link assinado do armazenamento). */
export function StoredEngravingImage({item,alt=''}:{item:Pick<NewspaperEngraving,'image_path'|'public_src'>;alt?:string}){
 const path=item.image_path;
 const url=useQuery({queryKey:['newspaper-engraving-url',path],queryFn:()=>signedEngravingImage(path!),
  enabled:Boolean(path)&&!item.public_src,staleTime:45*60*1000,retry:false});
 if(item.public_src)return <img src={item.public_src} alt={alt} loading="lazy"/>;
 if(url.data)return <img src={url.data} alt={alt} loading="lazy"/>;
 return <div className="folha-engraving-placeholder" aria-hidden="true"/>;
}

/** Gravuras do Reino: o Editor-Chefe envia imagens quadradas e escolhe quais aparecem no acervo. */
export function NewspaperEngravings({items,busy,onUpload,onToggle,onDelete,onRestore}:{
 items:NewspaperEngraving[];busy:boolean;
 onRestore:()=>void;
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
  <p className="folha-empty-copy">Este é o Acervo de gravuras: tudo o que aparece na Folha fica aqui, inclusive as originais do Reino. A bolinha marca se a gravura aparece no acervo da folha; desmarcada, ela continua guardada aqui. A lixeira exclui a gravura (edições já publicadas não mudam).</p>
  {NEWSPAPER_ENGRAVINGS.some(e=>!items.some(i=>i.public_src===e.src))&&
   <button type="button" className="folha-text-link" disabled={busy} onClick={onRestore}>
    Restaurar gravuras originais do Reino</button>}
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
    <div className="folha-engraving-square"><StoredEngravingImage item={item} alt={item.name}/></div>
    <figcaption>{item.name}{item.public_src&&<small className="folha-engraving-origin"> · original do Reino</small>}</figcaption>
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
