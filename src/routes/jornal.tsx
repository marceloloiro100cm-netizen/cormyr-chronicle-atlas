import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Newspaper,UsersRound,ChevronLeft,ChevronRight} from 'lucide-react';
import {NewspaperCanvas} from '@/components/newspaper/NewspaperCanvas';
import {NewspaperTeam} from '@/components/newspaper/NewspaperTeam';
import {formatDate} from '@/lib/calendar/harptos';
import {NEWSPAPER_FONTS,NEWSPAPER_TEMPLATES,safeNewspaperBlocks,type NewspaperEdition,
  type NewspaperFont,type NewspaperStaffMember,type NewspaperTemplate} from '@/lib/newspaper/model';
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
    {title:'A Folha Sem Selo · Atlas Cormyr'},
    {name:'description',content:'Leia as edições de A Folha Sem Selo, o jornal do reino de Cormyr, e conheça a Redação.'},
    {property:'og:title',content:'A Folha Sem Selo · Atlas Cormyr'},
  ]}),
});

type Summary={id:string;title:string;subtitle:string;editionNo:number;publishedAt:string;campaignDate:string|null};
type ListReply={items:Summary[];staff:Pick<NewspaperStaffMember,'id'|'name'|'specialty'|'bio'|'sort_order'>[]};
type EditionReply={id:string;title:string;subtitle:string;editionNo:number;template:string;font_style:string;
  blocks:unknown[];publishedAt:string;campaignDate:string|null;version:number};

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
    template,font_style:font,state:'published',blocks:safeNewspaperBlocks(v.blocks),pdf_path:null,
    version:v.version,publication_revision:v.version,created_by:'',updated_at:v.publishedAt,
    published_at:v.publishedAt,archived_at:null,cancelled_at:null,publish_on:null};
}

function PublicNewspaper(){
  const params=useMemo(()=>new URLSearchParams(typeof window==='undefined'?'':window.location.search),[]);
  const embed=params.get('embed')==='1';
  const [selected,setSelected]=useState<string|null>(params.get('edicao'));
  const [view,setView]=useState<'edicoes'|'redacao'>(params.get('ver')==='redacao'?'redacao':'edicoes');
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
  const go=(id:string)=>{setSelected(id);setView('edicoes');window.scrollTo?.({top:0,behavior:'smooth'});};
  const staff=(list.data?.staff??[]).map(m=>({...m,photo_path:null,created_at:'',updated_at:''}));

  return <div className={'public-folha'+(embed?' public-folha--embed':'')}>
    {!embed&&<header className="public-folha-top">
      <a href="/cormyr/index.html" className="public-folha-brand"><img src="/cormyr/assets/cormyr.jpg" alt="" width={30} height={36}/>
        <span>Atlas <em>Cormyr</em></span></a>
      <a href="/cormyr/index.html">Voltar ao Atlas</a>
    </header>}
    <div className="public-folha-head">
      <img src="/newspaper/brasao_folha.webp" alt="" aria-hidden="true" width={56} height={56}/>
      <div><p className="newspaper-kicker">A IMPRENSA DO REINO</p><h1>A Folha Sem Selo</h1>
        <p>As notícias que atravessam Cormyr, abertas a todos os leitores.</p></div>
    </div>
    <nav className="public-folha-tabs" aria-label="Jornal">
      <button type="button" aria-pressed={view==='edicoes'} onClick={()=>setView('edicoes')}><Newspaper size={16}/> Edições</button>
      <button type="button" aria-pressed={view==='redacao'} onClick={()=>setView('redacao')}><UsersRound size={16}/> A Redação</button>
    </nav>
    {list.isPending&&<p role="status" className="public-folha-status">Abrindo o arquivo do jornal…</p>}
    {list.isError&&<p role="alert" className="public-folha-status">{list.error instanceof Error?list.error.message:'Jornal indisponível.'}</p>}
    {list.data&&view==='redacao'&&(staff.length?<NewspaperTeam staff={staff}/>:
      <p className="public-folha-status">A Redação ainda não apresentou sua equipe.</p>)}
    {list.data&&view==='edicoes'&&(items.length===0?<p className="public-folha-status">Nenhuma edição publicada ainda.</p>:
      <div className="public-folha-layout">
        <aside className="public-folha-list" aria-label="Edições publicadas">
          <h2>Edições</h2>
          <ul>{items.map(item=><li key={item.id}>
            <button type="button" aria-current={item.id===currentId?'true':undefined} onClick={()=>go(item.id)}>
              <span>Nº {item.editionNo}{item.campaignDate?' · '+formatDate(item.campaignDate):''}</span>
              <strong>{item.title}</strong></button></li>)}</ul>
        </aside>
        <main className="public-folha-reader">
          <div className="public-folha-pager">
            <button type="button" disabled={index<0||index>=items.length-1} onClick={()=>{const next=items[index+1];if(next)go(next.id);}}>
              <ChevronLeft size={16}/> Edição anterior</button>
            <button type="button" disabled={index<=0} onClick={()=>{const prev=items[index-1];if(prev)go(prev.id);}}>
              Edição seguinte <ChevronRight size={16}/></button>
          </div>
          {edition.isPending&&<p role="status" className="public-folha-status">Abrindo a edição…</p>}
          {edition.isError&&<p role="alert" className="public-folha-status">{edition.error instanceof Error?edition.error.message:'Edição indisponível.'}</p>}
          {edition.data&&<NewspaperCanvas edition={toEdition(edition.data)}/>}
        </main>
      </div>)}
  </div>;
}
