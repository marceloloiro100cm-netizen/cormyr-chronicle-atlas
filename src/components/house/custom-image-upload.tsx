import {useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {customImageFromFile} from '@/lib/house/custom-image-file';

/**
 * Envio de imagem própria (espião ou unidade). A foto é reduzida no próprio
 * aparelho para uma miniatura quadrada e gravada na Ficha da Casa pela
 * operação auditada `custom_image`; nada é publicado fora da Casa.
 */
export function CustomImageUpload({label,hasImage,busy=false,onSave}:{
 label:string;hasImage:boolean;busy?:boolean;
 onSave:(image:string)=>Promise<boolean>;
}){
 const input=useRef<HTMLInputElement>(null);
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const send=async(file:File|undefined)=>{
  if(!file)return;
  setWorking(true);setError('');
  try{
   const image=await customImageFromFile(file);
   if(!await onSave(image))setError('A imagem não foi gravada. Confira o aviso da Ficha.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar a imagem.');}
  finally{setWorking(false);}
 };
 const remove=async()=>{
  setWorking(true);setError('');
  try{if(!await onSave(''))setError('A imagem não foi removida.');}
  finally{setWorking(false);}
 };
 return <div className="custom-image-upload">
  <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
   aria-label={'Escolher imagem para '+label}
   onChange={e=>{const file=e.target.files?.[0];e.target.value='';void send(file);}}/>
  <Button type="button" size="sm" variant="outline" disabled={busy||working}
   onClick={()=>input.current?.click()}>
   <ImagePlus size={14}/>{working?'Enviando…':hasImage?'Trocar imagem':'Enviar imagem'}
  </Button>
  {hasImage&&<Button type="button" size="sm" variant="ghost" disabled={busy||working}
   aria-label={'Remover imagem enviada de '+label} title="Voltar à imagem padrão"
   onClick={()=>void remove()}><Trash2 size={14}/></Button>}
  {error&&<small role="alert" className="house-warning">{error}</small>}
 </div>;
}
