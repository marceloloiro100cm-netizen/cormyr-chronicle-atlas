import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {PrivateImage} from '@/components/campaign-content';
import {supabase} from '@/integrations/supabase/client';
import {houseRecordGalleryImages,type GalleryRecord}
 from '@/lib/gallery/house-gallery';
import './gallery-tab.css';

type Topic='images'|'npcs'|'missives';
type Direction='all'|'sent'|'received';
const mailImageSchema=z.object({
 id:z.string().min(1),path:z.string().regex(/^[A-Za-z0-9_./-]+$/),
 caption:z.string(),subject:z.string(),
 sourceKind:z.enum(['letter','reply']),
 direction:z.enum(['sent','received']),
 occurredAt:z.string(),
}).strict();
type MailImage=z.infer<typeof mailImageSchema>;

async function loadHouseMailImages(houseId:string):Promise<MailImage[]>{
 // The new SQL RPC is versioned separately from generated Supabase types.
 const rpc=(supabase as unknown as {rpc:(
  name:string,args:{p_house:string}
 )=>Promise<{data:unknown;error:{message:string}|null}>}).rpc;
 const {data,error}=await rpc.call(supabase,'house_gallery_mail_images',{p_house:houseId});
 if(error)throw new Error('Não foi possível consultar as imagens das missivas desta Casa.');
 const parsed=z.array(mailImageSchema).max(500).safeParse(data);
 if(!parsed.success)throw new Error('A galeria de missivas retornou dados inesperados.');
 return parsed.data;
}

/** One gallery per authorized House. Records are filtered again here even
 * though Panel data already passed through can_read_record RLS.
 * Mail images are provided exclusively by an authenticated house-scoped RPC.
 */
export function GalleryTab({houseId,houseName,records}:{
 houseId:string;houseName:string;records:readonly GalleryRecord[];
}){
 const [topic,setTopic]=useState<Topic>('images');
 const [direction,setDirection]=useState<Direction>('all');
 const [limit,setLimit]=useState(12);
 const recordsByTopic=houseRecordGalleryImages(records,houseId);
 const images=recordsByTopic.filter(image=>image.topic==='images');
 const npcs=recordsByTopic.filter(image=>image.topic==='npcs');
 const mail=useQuery({
  queryKey:['house-gallery-mail-images',houseId],
  queryFn:()=>loadHouseMailImages(houseId),
  enabled:topic==='missives',staleTime:30_000,
  refetchOnWindowFocus:'always',retry:1,
 });
 const mailImages=(mail.data??[]).filter(item=>direction==='all'||item.direction===direction);
 const collection=topic==='images'?images:topic==='npcs'?npcs:mailImages;
 const shown=collection.slice(0,limit);
 const selectTopic=(next:Topic)=>{setTopic(next);setDirection('all');setLimit(12);};
 return <section className="campaign-gallery" aria-label={'Galeria da Casa '+houseName}>
  <header className="campaign-gallery-head">
   <p className="campaign-eyebrow">ACERVO PRIVADO DA CASA</p>
   <h2>Galeria · {houseName}</h2>
   <p>Retratos e imagens do acervo, da Corte e das correspondências acessíveis
    à sua Casa, organizados sem duplicar os arquivos.</p>
  </header>
  <nav className="campaign-gallery-topics" aria-label="Tópicos da galeria">
   {([
    ['images','Retratos e imagens',images.length],
    ['npcs','NPCs',npcs.length],
    ['missives','Imagens das missivas',mail.data?.length],
   ] as const).map(([key,label,count])=>
    <Button key={key} type="button" size="sm"
     variant={topic===key?'default':'outline'} aria-pressed={topic===key}
     onClick={()=>selectTopic(key)}>
     {label}{count!==undefined?<span className="campaign-gallery-count">{count}</span>:null}
    </Button>)}
  </nav>
  {topic==='missives'&&<div className="campaign-gallery-filter"
    role="group" aria-label="Origem das imagens das missivas">
   {([
    ['all','Todas'],['sent','Enviadas'],['received','Recebidas'],
   ] as const).map(([key,label])=>
    <Button key={key} type="button" size="sm" aria-pressed={direction===key}
     variant={direction===key?'secondary':'outline'}
     onClick={()=>{setDirection(key);setLimit(12);}}>{label}</Button>)}
  </div>}
  {topic==='missives'&&mail.isPending&&
   <p role="status" className="campaign-gallery-empty">Consultando as missivas autorizadas…</p>}
  {topic==='missives'&&mail.isError&&<div className="campaign-gallery-empty"
   role="alert">Não foi possível carregar as imagens das missivas.
   <Button type="button" variant="outline" size="sm"
    onClick={()=>void mail.refetch()}>Tentar novamente</Button>
  </div>}
  {!(topic==='missives'&&(mail.isPending||mail.isError))&&<>
   {collection.length===0?
    <p className="campaign-gallery-empty">Nenhuma imagem encontrada neste tópico
     para a Casa {houseName}.</p>:
    <>
     <div className="campaign-gallery-grid">
      {topic==='missives'?(shown as MailImage[]).map(item=>
       <article key={item.id} className="campaign-gallery-item">
        <PrivateImage path={item.path} caption={item.caption||item.subject}/>
        <p className="campaign-gallery-meta">
         <strong>{item.direction==='sent'?'Enviada':'Recebida'}</strong>
         {' · '}{item.sourceKind==='reply'?'Resposta':'Missiva'}
         {' · '}{item.subject}
        </p>
       </article>):
       (shown as typeof recordsByTopic).map(item=>
        <article key={item.id} className="campaign-gallery-item">
         <PrivateImage path={item.path} caption={item.caption}/>
         {item.topic==='npcs'&&
          <p className="campaign-gallery-meta">{item.recordTitle}</p>}
        </article>)}
     </div>
     {limit<collection.length&&
      <div className="campaign-gallery-more">
       <Button type="button" variant="outline"
        onClick={()=>setLimit(current=>current+12)}>
        Mostrar mais imagens ({collection.length-limit} restantes)
       </Button>
      </div>}
    </>}
  </>}
 </section>;
}
