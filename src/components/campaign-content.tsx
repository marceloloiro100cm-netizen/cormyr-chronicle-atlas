import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { contentParts, imageToken, validateImage } from '@/lib/campaign-content';

export function CampaignContent({content}:{content:string}) {
  return <div className="campaign-prose">{contentParts(content).map((part,i)=>'text' in part?<p className="campaign-preserve" key={i}>{part.text}</p>:<PrivateImage key={i} path={part.path} caption={part.caption}/>)}</div>;
}
export function PrivateImage({path,caption}:{path:string;caption:string}) {
  const {data,error}=useQuery({queryKey:['private-image',path],queryFn:async()=>{
    const result=await supabase.storage.from('campaign-images').download(path);if(result.error)throw result.error;
    return result.data;
  }});
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!data)return;const objectUrl=URL.createObjectURL(data);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl);},[data]);
  return <figure className="campaign-image">{url?<a href={url} target="_blank" rel="noopener"><img src={url} alt={caption||'Imagem da campanha'} loading="lazy"/></a>:<p role="status">{error?'Imagem indisponível.':'Carregando imagem…'}</p>}{caption&&<figcaption>{caption}</figcaption>}</figure>;
}
export type PendingImage={file:File;caption:string};
export function ImagePicker({images,onChange,disabled}:{images:PendingImage[];onChange:(images:PendingImage[])=>void;disabled?:boolean}) {
  const [error,setError]=useState('');
  return <div className="campaign-image-picker"><label><span className="flex items-center gap-2"><ImagePlus size={18}/>Imagens</span><input aria-label="Adicionar imagens" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" disabled={disabled} onChange={e=>{
    try{const files=Array.from(e.target.files??[]);files.forEach(validateImage);onChange([...images,...files.map(file=>({file,caption:file.name}))]);setError('');}catch(err){setError(err instanceof Error?err.message:'Imagem inválida.');}e.target.value='';
  }}/></label>{images.map((image,i)=><div className="campaign-image-selection" key={i}><span>{image.file.name}</span><input aria-label={'Legenda de '+image.file.name} value={image.caption} onChange={e=>onChange(images.map((item,n)=>n===i?{...item,caption:e.target.value}:item))}/><Button type="button" variant="ghost" size="icon" title="Remover imagem" aria-label={'Remover '+image.file.name} disabled={disabled} onClick={()=>onChange(images.filter((_,n)=>n!==i))}><X size={16}/></Button></div>)}{error&&<p role="alert">{error}</p>}</div>;
}
export async function uploadImages(content:string,images:PendingImage[],mutation:string) {
  if(!images.length)return content;
  const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sessão expirada.');
  const tokens:string[]=[];
  for(const [i,image] of images.entries()) {
    validateImage(image.file);
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'} as Record<string,string>)[image.file.type];
    const path=`${user.id}/${mutation}/${i}.${ext}`;
    const {error}=await supabase.storage.from('campaign-images').upload(path,image.file,{contentType:image.file.type,upsert:false});
    if(error&&error.message!=='The resource already exists'&&error.statusCode!=='409')throw error;
    tokens.push(imageToken(path,image.caption));
  }
  return [content,...tokens].join('\n\n');
}