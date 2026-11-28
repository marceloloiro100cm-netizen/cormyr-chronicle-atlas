import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Newspaper,UsersRound,ChevronLeft,ChevronRight,ChevronDown} from 'lucide-react';
import {NewspaperCanvas} from '@/components/newspaper/NewspaperCanvas';
import {NewspaperTeam} from '@/components/newspaper/NewspaperTeam';
import {formatDate} from '@/lib/calendar/harptos';
import {NEWSPAPER_FONTS,NEWSPAPER_TEMPLATES,safeNewspaperBlocks,type NewspaperEdition,
  type NewspaperFont,type NewspaperStaffMember,type NewspaperTemplate} from '@/lib/newspaper/model';
import {hrefWithParams,isPlainLeftClick,setUrlParams,urlLinkProps,useUrlParam} from '@/lib/navigation/url-state';
import {CormyrSignature} from '@/components/cormyr-signature';
import '@/components/newspaper/newspaper.css';
import '@/components/newspaper/newspaper-editorial.css';

/**
 * A Folha Sem Selo no site aberto: qualquer visitante, sem conta, lê as
 * edições publicadas e conhece a Redação. Cada leitura conta uma vez por
 * aparelho para o Editor-Chefe. Com ?embed=1 a página aparece dentro do
 * Atlas (botão "Jornal" do menu lateral), sem cabeçalho próprio.
 */
export const Route=createFileRoute('/jornal')({
  ssr:false,
  component:PublicNewspaper,
  head:()=>({meta:[
    {title:'A Folha Sem Selo · Atlas de Cormyr'},
    {name:'description',content:'Leia as edições de A Folha Sem Selo, o jornal do reino de Cormyr, e conheça a Redação.'},
    {property:'og:title',content:'A Folha Sem Selo · Atlas de Cormyr'},
  ]}),
});

type Summary={id:string;title:string;subtitle:string;editionNo:number;publishedAt:string;campaignDate:string|null};
type ListReply={items:Summary[];staff:(Pick<NewspaperStaffMember,'id'|'name'|'specialty'|'bio'|'sort_order'>&{photo_url?:string|null})[]};
type EditionReply={id:string;title:string;subtitle:string;editionNo:number;template:string;font_style:string;
  blocks:unknown[];pdfSrc?:string|null;publishedAt:string;campaignDate:string|null;version:number};

const VISITOR_KEY='atlas-cormyr-leitor';
function visitorId():string|null{
  try{
    const old=localStorage.getItem(VISITOR_KEY);
    if(old&&/^[a-f0-9]{32}$/.test(old))return old;
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const id=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(VISITOR_KEY,id);
    return id;
  }catch{return null;}
}
async function getJson<T>(url:string):Promise<T>{
  const response=await fetch(url,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error(response.status===404?'Edição não encontrada.':'O jornal está indisponível no momento.');
  return await response.json() as T;
}
function toEdition(v:EditionReply):NewspaperEdition{
  const template=NEWSPAPER_TEMPLATES.some(t=>t.value===v.template)?v.template as NewspaperTemplate:'classico';
  const font=NEWSPAPER_FONTS.some(f=>f.value===v.font_style)?v.font_style as NewspaperFont:'classico';
  return {id:v.id,edition_no:v.editionNo,campaign_date:v.campaignDate??'',title:v.title,subtitle:v.subtitle,
    template,font_style:font,state:'published',blocks:safeNewspaperBlocks(v.blocks),pdf_path:v.pdfSrc??null,
    version:v.version,publication_revision:v.version,created_by:'',updated_at:v.publishedAt,
    published_at:v.publishedAt,archived_at:null,cancelled_at:null,publish_on:null};
}

function PublicNewspaper(){
  const params=useMemo(()=>new URLSearchParams(typeof window==='undefined'?'':window.location.search),[]);
  const embed=params.get('embed')==='1';
  // Edição e aba no endereço (?edicao=...&ver=redacao): o link copiado abre a
  // mesma edição, e cada edição pode ser aberta em nova guia.
  const [selectedParam]=useUrlParam('edicao','');
  const selected=selectedParam||null;
  const [viewParam]=useUrlParam('ver','edicoes');
  const view:'edicoes'|'redacao'=viewParam==='redacao'?'redacao':'edicoes';
  const [editionsOpen,setEditionsOpen]=useState(false);
  const editionsTrigger=useRef<HTMLButtonElement>(null);
  const editionsMenu=useRef<HTMLElement>(null);
  // O arquivo é acessado pelo botão Edições: clique fora ou Escape fecha
  // o menu sem perder a edição atualmente aberta.
  useEffect(()=>{
    if(!editionsOpen)return;
    const outside=(event:PointerEvent)=>{
      if(!(event.target instanceof Node))return;
      if(!editionsTrigger.current?.contains(event.target)&&!editionsMenu.current?.contains(event.target)){
        setEditionsOpen(false);
      }
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setEditionsOpen(false);editionsTrigger.current?.focus();}
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[editionsOpen]);
  useEffect(()=>{if(view==='redacao')setEditionsOpen(false);},[view]);

  const list=useQuery({queryKey:['public-newspaper-list'],queryFn:()=>getJson<ListReply>('/api/public/newspaper'),
    staleTime:60_000,retry:1});
  const items=list.data?.items??[];
  const currentId=selected??items[0]?.id??null;
  const edition=useQuery({queryKey:['public-newspaper-edition',currentId],enabled:Boolean(currentId),
    queryFn:()=>getJson<EditionReply>('/api/public/newspaper?edicao='+encodeURIComponent(currentId!)),
    staleTime:5*60_000,retry:1});
  const counted=useRef(new Set<string>());
  // Conta a leitura uma vez por aparelho e edição (o servidor ignora repetições).
  useEffect(()=>{
    const id=edition.data?.id;
    if(!id||view!=='edicoes'||counted.current.has(id))return;
    counted.current.add(id);
    const visitor=visitorId();
    if(!visitor)return;
    void fetch('/api/public/newspaper',{method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({editionId:id,visitor})}).catch(()=>undefined);
  },[edition.data?.id,view]);
  const index=items.findIndex(i=>i.id===currentId);
  // Dentro do Atlas a página vem embutida (?embed=1); em nova guia ela abre inteira.
  const newTabHref=(changes:Record<string,string|null>)=>hrefWithParams({...changes,embed:null});
  const go=(id:string)=>{setEditionsOpen(false);setUrlParams({edicao:id,ver:null});window.scrollTo?.({top:0,behavior:'smooth'});};
  const staff=(list.data?.staff??[]).map(m=>({...m,photo_path:null,created_at:'',updated_at:''}));

  return <div className={'public-folha'+(embed?' public-folha--embed':'')}>
    {!embed&&<header className="public-folha-top">
      <a href="/cormyr/index.html" className="public-folha-brand" aria-label="Atlas de Cormyr: voltar ao reino"><CormyrSignature compact subtitle=""/></a>
      <a href="/cormyr/index.html">Voltar ao Atlas</a>
    </header>}
    <div className="public-folha-masthead">
      <div className="public-folha-head">
        <div className="public-folha-crest" aria-hidden="true">
          <img src="/newspaper/brasao_folha.webp" alt="" width={220} height={220}/>
        </div>
        <div className="public-folha-head-copy">
          <h1>A Folha Sem Selo</h1>
          <p>As notícias que atravessam Cormyr, abertas a todos os leitores.</p>
        </div>
        <div className="public-folha-head-balance" aria-hidden="true"/>
      </div>
      <div className="public-folha-toolbar">
        <nav className="public-folha-tabs" aria-label="Jornal">
          <button type="button" ref={editionsTrigger} aria-expanded={editionsOpen}
            aria-controls="public-folha-editions-menu" aria-haspopup="true"
            aria-pressed={view==='edicoes'}
            onClick={()=>{if(view!=='edicoes')setUrlParams({ver:null});setEditionsOpen(open=>!open);}}>
            <Newspaper size={16}/> Edições <ChevronDown size={15} aria-hidden="true"/>
          </button>
          <a aria-current={view==='redacao'?'page':undefined} {...urlLinkProps({ver:'redacao'})} href={newTabHref({ver:'redacao'})}><UsersRound size={16}/> A Redação</a>
        </nav>
        {view==='edicoes'&&items.length>0&&<nav className="public-folha-edition-nav" aria-label="Navegar entre edições">
          <button type="button" aria-label="Edição anterior" disabled={index<0||index>=items.length-1}
            onClick={()=>{const previous=items[index+1];if(previous)go(previous.id);}}>
            <ChevronLeft size={18}/><span>Anterior</span>
          </button>
          <span className="public-folha-current-edition" aria-live="polite">
            Edição nº {items[index]?.editionNo??'—'}
            <small>{index>=0?`${index+1} de ${items.length} no arquivo`:''}</small>
          </span>
          <button type="button" aria-label="Edição seguinte" disabled={index<=0}
            onClick={()=>{const next=items[index-1];if(next)go(next.id);}}>
            <span>Seguinte</span><ChevronRight size={18}/>
          </button>
        </nav>}
        {view==='edicoes'&&items.length>0&&<span className="public-folha-toolbar-balance" aria-hidden="true"/>}
      </div>
      {editionsOpen&&view==='edicoes'&&<nav
        ref={editionsMenu} id="public-folha-editions-menu"
        className="public-folha-editions-menu" aria-label="Selecionar edição publicada">
        {list.isPending&&<p role="status">Carregando edições…</p>}
        {list.isError&&<p role="alert">Não foi possível carregar o arquivo.</p>}
        {list.data&&(items.length>0?<ul>{items.map(item=><li key={item.id}>
          <a aria-current={item.id===currentId?'page':undefined}
            href={newTabHref({edicao:item.id,ver:null})}
            onClick={event=>{if(!isPlainLeftClick(event))return;event.preventDefault();go(item.id);}}>
            <span>Nº {item.editionNo}{item.campaignDate?' · '+formatDate(item.campaignDate):''}</span>
            <strong>{item.title}</strong>
          </a>
        </li>)}</ul>:<p>Nenhuma edição publicada.</p>)}
      </nav>}
    </div>
    {list.isPending&&<p role="status" className="public-folha-status">Abrindo o arquivo do jornal…</p>}
    {list.isError&&<p role="alert" className="public-folha-status">{list.error instanceof Error?list.error.message:'Jornal indisponível.'}</p>}
    {list.data&&view==='redacao'&&(staff.length?<NewspaperTeam staff={staff}/>:
      <p className="public-folha-status">A Redação ainda não apresentou sua equipe.</p>)}
    {list.data&&view==='edicoes'&&(items.length===0?<p className="public-folha-status">Nenhuma edição publicada ainda.</p>:
      <div className="public-folha-layout">
        <main className="public-folha-reader">
          {edition.isPending&&<p role="status" className="public-folha-status">Abrindo a edição…</p>}
          {edition.isError&&<p role="alert" className="public-folha-status">{edition.error instanceof Error?edition.error.message:'Edição indisponível.'}</p>}
          {edition.data&&<NewspaperCanvas edition={toEdition(edition.data)}/>}
        </main>
      </div>)}
  </div>;
}
