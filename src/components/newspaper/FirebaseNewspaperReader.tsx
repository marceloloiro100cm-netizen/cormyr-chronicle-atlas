/**
 * Read-only Firebase newspaper renderer.
 *
 * The published edition comes from the authorized Cloud backend. We render
 * typed plain text, never stored HTML, and only allow same-origin public
 * images. Private Storage paths must be served by a future Firebase media
 * adapter, never by Supabase.
 */
import {useState,type ReactNode} from 'react';
import {newspaperTypefaceFamily,NEWSPAPER_TYPEFACES,type NewspaperTypeface} from '@/lib/newspaper/model';

type DisplayKind='headline'|'subtitle'|'article'|'quote'|'notice'|'image';
export type DisplayBlock={
  id:string;type:DisplayKind;text:string;subtitle:string;
  byline:string;caption:string;imageSrc:string|null;
  titleFont?:NewspaperTypeface;bodyFont?:NewspaperTypeface;span?:number;
};
export type NewspaperEditionRead={
  id:string;title:string;subtitle:string;editionNo:number;blocks:unknown[];
  campaignDate?:string|null;
};

const imageRoute=(editionId:string,index:number):string|null=>
 /^[A-Za-z0-9_-]{1,128}$/.test(editionId)&&Number.isSafeInteger(index)&&
 index>=0&&index<80
  ?'/api/public/newspaper-image?edition='+encodeURIComponent(editionId)+'&index='+index
  :null;

const publicImage=(value:unknown):string|null=>{
  if(typeof value!=='string'||value.length>250||
     value.includes('..')||value.includes('//'))return null;
  if(/^\/api\/public\/newspaper-image\?edition=[A-Za-z0-9_-]{1,128}&index=(?:0|[1-7]?[0-9])$/.test(value))
   return value;
  if(!/^\/(?:newspaper|cormyr)\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i.test(value))
    return null;
  return value;
};

export function safePublishedBlocks(input:unknown,editionId?:string):DisplayBlock[]{
  if(!Array.isArray(input))return [];
  return input.slice(0,80).flatMap((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
    const b=raw as Record<string,unknown>;
    const kind=b['type']??b['kind'];
    const type:DisplayKind=
      kind==='headline'||kind==='subtitle'||kind==='quote'||
      kind==='notice'||kind==='image'||kind==='article'?kind:'article';
    // The trusted public route already bounds the full edition payload.
    // Do not cut historical prose, captions or bylines while rendering.
    const str=(key:string)=>typeof b[key]==='string'?b[key] as string:'';
    const text=str('text'),subtitle=str('subtitle');
    const byline=str('byline'),caption=str('caption');
    const imageSrc=publicImage(b['imageSrc'])??(
      type==='image'&&typeof b['imagePath']==='string'&&
      /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/.test(b['imagePath'])&&
      !b['imagePath'].includes('..')&&editionId?imageRoute(editionId,index):null);
    if(type!=='image'&&!text.trim())return [];
    return [{
      id:typeof b['id']==='string'&&b['id'].length<=120?b['id']:String(index),
      type,text,subtitle,byline,caption,imageSrc,
      ...(NEWSPAPER_TYPEFACES.some(f=>f.value===b['titleFont'])?{titleFont:b['titleFont'] as NewspaperTypeface}:{}),
      ...(NEWSPAPER_TYPEFACES.some(f=>f.value===b['bodyFont'])?{bodyFont:b['bodyFont'] as NewspaperTypeface}:{}),
      ...(typeof b['span']==='number'&&[3,4,6,8,12].includes(b['span'])?{span:b['span']}:{}),
    }];
  });
}

function NewspaperPicture({item}:{item:DisplayBlock}){
 const [broken,setBroken]=useState(false);
 return <figure className="my-5">
  {item.imageSrc&&!broken
   ?<img src={item.imageSrc} alt={item.caption||'Gravura do jornal'}
       onError={()=>setBroken(true)}
       loading="lazy" className="max-h-[480px] w-full object-contain sepia-[.2]"/>
   :<div className="flex min-h-28 items-center justify-center
      border border-dashed border-[#af9167] p-4 text-center text-sm italic">
      Gravura original ainda não disponível no Firebase Storage.
     </div>}
  {item.caption&&<figcaption className="mt-1 text-center text-xs italic">
    {item.caption}</figcaption>}
 </figure>;
}

function NewspaperBlock({item}:{item:DisplayBlock}):ReactNode{
  switch(item.type){
    case 'headline':
      return <section className="border-b border-[#a58a60] pb-4">
        <h3 style={{fontFamily:newspaperTypefaceFamily(item.titleFont)}} className="font-serif text-2xl sm:text-3xl font-bold leading-tight">
          {item.text}
        </h3>
        {item.subtitle&&<p className="mt-1 italic">{item.subtitle}</p>}
      </section>;
    case 'subtitle':
      return <h3 style={{fontFamily:newspaperTypefaceFamily(item.titleFont)}} className="font-serif text-xl font-semibold border-b
        border-[#b4a083] pb-1">{item.text}</h3>;
    case 'quote':
      return <blockquote className="border-l-2 border-[#7c543a] pl-4 italic
        font-serif text-lg whitespace-pre-wrap">{item.text}</blockquote>;
    case 'notice':{
      const [heading,...parts]=item.text.split('\n');
      return <aside className="my-4 border-y-2 border-[#95744a] py-4
        text-center font-serif">
        <h3 style={{fontFamily:newspaperTypefaceFamily(item.titleFont)}} className="font-bold uppercase tracking-wider">{heading}</h3>
        {parts.join('\n').trim()&&
          <p className="mt-2 whitespace-pre-wrap">{parts.join('\n').trim()}</p>}
      </aside>;
    }
    case 'image':return <NewspaperPicture item={item}/>;
    default:{
      const [heading,...body]=item.text.split('\n');
      const story=body.join('\n').trim();
      return <article style={{fontFamily:newspaperTypefaceFamily(item.bodyFont)}} className="font-serif">
        <h3 style={{fontFamily:newspaperTypefaceFamily(item.titleFont)}} className="text-lg font-bold leading-snug">{heading}</h3>
        {story&&<p className="mt-2 whitespace-pre-wrap text-justify
          leading-relaxed">{story}</p>}
        {item.byline&&<p className="mt-1 text-right text-xs italic">
          Por {item.byline}
        </p>}
      </article>;
    }
  }
}

export function FirebaseNewspaperReader({edition}:{edition:NewspaperEditionRead}){
  const items=safePublishedBlocks(edition.blocks,edition.id);
  return <article aria-label="Edição publicada de A Folha Sem Selo"
    className="mx-auto w-full max-w-3xl bg-[#f1e1bf] text-[#38291e]
      border-4 border-double border-[#97744d] px-4 py-6 sm:px-8
      shadow-sm font-serif">
    <header className="border-b-4 border-double border-[#8a6745]
      text-center pb-4">
      <p className="text-xs uppercase tracking-[.25em]">Gazeta de Cormyr</p>
      <h2 className="mt-1 text-3xl sm:text-5xl font-bold tracking-tight">
        A Folha Sem Selo
      </h2>
      {edition.subtitle&&<p className="mt-2 italic">{edition.subtitle}</p>}
      <p className="mt-4 border-t border-[#a58a60] pt-2 text-xs
        uppercase tracking-wider">Edição {edition.editionNo}
        {edition.campaignDate?' · '+edition.campaignDate:''}</p>
    </header>
    <div className="mt-6 grid grid-cols-12 gap-5">
      {items.length===0
        ?<p className="col-span-12 text-center italic">Sem textos publicados nesta edição.</p>
        :items.map((item,i)=><div key={item.id+':'+i}
          className={'col-span-12 '+({3:'sm:col-span-3',4:'sm:col-span-4',6:'sm:col-span-6',8:'sm:col-span-8',12:'sm:col-span-12'}[item.span as 3|4|6|8|12]??'')}
          style={{fontFamily:newspaperTypefaceFamily(item.bodyFont)}}>
          <NewspaperBlock item={item}/>
        </div>)}
    </div>
    <footer className="mt-8 border-t-4 border-double border-[#8a6745]
      pt-3 text-center text-xs uppercase tracking-widest">
      {edition.title}{edition.subtitle?' · '+edition.subtitle:''}
    </footer>
  </article>;
}

