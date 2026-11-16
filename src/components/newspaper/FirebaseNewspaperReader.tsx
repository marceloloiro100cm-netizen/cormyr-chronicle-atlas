/**
 * Read-only Firebase newspaper renderer.
 *
 * The published edition comes from the authorized Cloud backend. We render
 * typed plain text, never stored HTML, and only allow same-origin public
 * images. Private Storage paths must be served by a future Firebase media
 * adapter, never by Supabase.
 */
import type {ReactNode} from 'react';

type DisplayKind='headline'|'subtitle'|'article'|'quote'|'notice'|'image';
export type DisplayBlock={
  id:string;type:DisplayKind;text:string;subtitle:string;
  byline:string;caption:string;imageSrc:string|null;
};
export type NewspaperEditionRead={
  id:string;title:string;subtitle:string;editionNo:number;blocks:unknown[];
  campaignDate?:string|null;
};

const publicImage=(value:unknown):string|null=>{
  if(typeof value!=='string'||value.length>250||
     value.includes('..')||value.includes('//')||
     !/^\/(?:newspaper|cormyr)\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i.test(value))
    return null;
  return value;
};

export function safePublishedBlocks(input:unknown):DisplayBlock[]{
  if(!Array.isArray(input))return [];
  return input.slice(0,80).flatMap((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
    const b=raw as Record<string,unknown>;
    const kind=b['type']??b['kind'];
    const type:DisplayKind=
      kind==='headline'||kind==='subtitle'||kind==='quote'||
      kind==='notice'||kind==='image'||kind==='article'?kind:'article';
    const str=(key:string,max:number)=>
      typeof b[key]==='string'?(b[key] as string).slice(0,max):'';
    const text=str('text',16000),subtitle=str('subtitle',1000);
    const byline=str('byline',200),caption=str('caption',600);
    const imageSrc=publicImage(b['imageSrc']);
    if(type!=='image'&&!text.trim())return [];
    return [{
      id:typeof b['id']==='string'&&b['id'].length<=120?b['id']:String(index),
      type,text,subtitle,byline,caption,imageSrc,
    }];
  });
}

function NewspaperBlock({item}:{item:DisplayBlock}):ReactNode{
  switch(item.type){
    case 'headline':
      return <section className="border-b border-[#a58a60] pb-4">
        <h3 className="font-serif text-2xl sm:text-3xl font-bold leading-tight">
          {item.text}
        </h3>
        {item.subtitle&&<p className="mt-1 italic">{item.subtitle}</p>}
      </section>;
    case 'subtitle':
      return <h3 className="font-serif text-xl font-semibold border-b
        border-[#b4a083] pb-1">{item.text}</h3>;
    case 'quote':
      return <blockquote className="border-l-2 border-[#7c543a] pl-4 italic
        font-serif text-lg whitespace-pre-wrap">{item.text}</blockquote>;
    case 'notice':{
      const [heading,...parts]=item.text.split('\n');
      return <aside className="my-4 border-y-2 border-[#95744a] py-4
        text-center font-serif">
        <h3 className="font-bold uppercase tracking-wider">{heading}</h3>
        {parts.join('\n').trim()&&
          <p className="mt-2 whitespace-pre-wrap">{parts.join('\n').trim()}</p>}
      </aside>;
    }
    case 'image':
      return <figure className="my-5">
        {item.imageSrc
          ?<img src={item.imageSrc} alt={item.caption||'Gravura do jornal'}
            loading="lazy" className="max-h-[480px] w-full object-contain sepia-[.2]"/>
          :<div className="flex min-h-28 items-center justify-center
            border border-dashed border-[#af9167] p-4 text-center
            text-sm italic">Gravura preservada; acesso à imagem pendente
            da migração para o Firebase Storage.</div>}
        {item.caption&&<figcaption className="mt-1 text-center text-xs italic">
          {item.caption}
        </figcaption>}
      </figure>;
    default:{
      const [heading,...body]=item.text.split('\n');
      const story=body.join('\n').trim();
      return <article className="font-serif">
        <h3 className="text-lg font-bold leading-snug">{heading}</h3>
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
  const items=safePublishedBlocks(edition.blocks);
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
    <div className="mt-6 space-y-5">
      {items.length===0
        ?<p className="text-center italic">Sem textos publicados nesta edição.</p>
        :items.map((item,i)=><NewspaperBlock
          key={item.id+':'+i} item={item}/>)}
    </div>
    <footer className="mt-8 border-t-4 border-double border-[#8a6745]
      pt-3 text-center text-xs uppercase tracking-widest">
      {edition.title}{edition.subtitle?' · '+edition.subtitle:''}
    </footer>
  </article>;
}
