import {lazy,Suspense,useEffect,useRef,useState,type MouseEvent as ReactMouseEvent,type ReactNode} from 'react';
import {isPlainLeftClick,useUrlSearch} from '@/lib/navigation/url-state';
import {LanguageSwitcher} from '@/components/language-switcher';
import {useTranslation} from '@/lib/i18n/context';
import {NARRATION_GROUPS,narrationHouseIds} from '@/lib/mail-groups';
import {CORMYR_CREST,Icon,NARRATOR_MOBILE,useMedia} from './narrator-ui';
import './narrator-workspace.css';

// O relógio completo só existe na área autenticada; carregado sob demanda como em CampaignShell.
const PrivateClockBody=lazy(()=>import('@/components/campaign-private-clock'));

export type NarratorMenuEntry=readonly [string,string];
/** Rótulo curto do rail e da barra inferior (o nome completo fica no aria-label). */
const SHORT:Record<string,string>={
 painel:'Conselho',missivas:'Missivas',jornal:'Jornal',calendario:'Hub',dossies:'Dossiês',
 batalha:'Batalha',eventos:'Eventos',aventuras:'Aventuras','acessos-firebase':'Contas',
};
/** Itens fixos da barra inferior no celular; o resto vai para "Mais". */
const MOBILE_PRIMARY=['painel','missivas','jornal','calendario'];

/**
 * Casca da visão do Narrador: cabeçalho de uma linha, rail de módulos à
 * esquerda (barra inferior no celular) e a área do módulo ocupando a tela.
 * Só organiza a navegação: permissões e ações continuam nos módulos.
 */
export function NarratorWorkspace({menu,extra,section,onSection,sectionHref,unread,openRound,represent,account,message,onDismissMessage,children}:{
 menu:ReadonlyArray<NarratorMenuEntry>;extra?:NarratorMenuEntry|null;
 section:string;onSection:(id:string)=>void;
 /** Endereço de cada módulo: com ele, o menu vira links (botão direito > nova guia). */
 sectionHref?:((id:string)=>string)|undefined;
 unread:number;openRound:number|null;
 represent:ReactNode;account:ReactNode;message:string;onDismissMessage:()=>void;children:ReactNode;
}){
 const {t}=useTranslation();
 const mobile=useMedia(NARRATOR_MOBILE);
 const [accountOpen,setAccountOpen]=useState(false);
 const [moreOpen,setMoreOpen]=useState(false);
 const accountRef=useRef<HTMLDivElement>(null);
 const items=[...menu,...(extra?[extra]:[])];
 useEffect(()=>{
  if(!accountOpen&&!moreOpen)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setAccountOpen(false);setMoreOpen(false);}};
  const onClick=(e:MouseEvent)=>{
   const target=e.target as Node|null;
   if(accountOpen&&accountRef.current&&target&&!accountRef.current.contains(target)&&
     !(target instanceof Element&&target.closest('[role="dialog"]')))setAccountOpen(false);
  };
  window.addEventListener('keydown',onKey);document.addEventListener('mousedown',onClick);
  return()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('mousedown',onClick);};
 },[accountOpen,moreOpen]);
 const go=(id:string)=>{setMoreOpen(false);onSection(id);};
 useUrlSearch();
 // Link real quando há endereço; clique comum continua trocando o módulo aqui mesmo.
 const nav=(id:string)=>sectionHref?{href:sectionHref(id),
  onClick:(e:ReactMouseEvent<HTMLAnchorElement>)=>{if(!isPlainLeftClick(e))return;e.preventDefault();go(id);}}:null;
 const label=(id:string,name:string)=>id==='missivas'&&unread>0?`${name}: ${unread} conversa${unread===1?'':'s'} com correspondência não lida`:name;
 const navBody=(id:string,name:string)=><>
  <Icon name={id} size={21}/><span>{SHORT[id]??name}</span>
  {id==='missivas'&&unread>0&&<span className="nw-badge" aria-hidden="true">{unread}</span>}
 </>;
 const navButton=([id,name]:NarratorMenuEntry)=>{
  const link=nav(id);
  return link?<a key={id} className="nw-nav-btn" {...link}
   aria-current={section===id?'page':undefined} aria-label={label(id,name)} title={name}>{navBody(id,name)}</a>
  :<button key={id} type="button" className="nw-nav-btn"
   aria-current={section===id?'page':undefined} aria-label={label(id,name)} title={name} onClick={()=>go(id)}>{navBody(id,name)}</button>;
 };
 const primary=items.filter(([id])=>MOBILE_PRIMARY.includes(id));
 const secondary=items.filter(([id])=>!MOBILE_PRIMARY.includes(id));
 const inMore=secondary.some(([id])=>id===section);
 return <div className="campaign-theme nw-root">
  <header className="nw-top">
   {(()=>{const body=<><img src={CORMYR_CREST} alt="" width={34} height={42}/>
    <span><b>Atlas <em>Cormyr</em></b>
     <span className="nw-clock"><Suspense fallback={<small>Consultando data oficial…</small>}><PrivateClockBody/></Suspense></span></span></>;
    return <a className="nw-brand" href="/cormyr/index.html"
      aria-label="Atlas Cormyr: voltar ao site público">{body}</a>;})()}
   <span className="nw-spacer"/>
   {(()=>{const props={className:'nw-week'+(openRound===null?' nw-week--closed':''),title:'Abrir o Hub Temporal',
     'aria-label':(openRound!==null?`Semana ${openRound} aberta`:'Nenhuma semana aberta')+'. Abrir o Hub Temporal'};
    const body=<><span className="nw-week-dot" aria-hidden="true"/>
     <span className="nw-week-long">{openRound!==null?`Semana ${openRound} aberta`:'Sem semana aberta'}</span>
     <span className="nw-week-short" aria-hidden="true">{openRound!==null?`S${openRound}`:'—'}</span></>;
    const link=nav('calendario');
    return link?<a {...props} {...link}>{body}</a>:<button type="button" {...props} onClick={()=>go('calendario')}>{body}</button>;})()}
   <div className="nw-represent-wrap">{represent}</div>
   <div className="nw-account" ref={accountRef}>
    <button type="button" className="nw-avatar" aria-haspopup="true" aria-expanded={accountOpen}
     aria-label="Conta do Narrador" onClick={()=>setAccountOpen(v=>!v)}>N</button>
    <div className={'nw-menu'+(accountOpen?' nw-menu--open':'')} aria-label="Conta do Narrador">
     <p className="nw-menu-title">Narrador</p>
     <div className="nw-menu-actions">{account}</div>
     <hr/>
     <a href="/cormyr/index.html">{t('nav.kingdomAndRegions')}</a>
     <div className="nw-menu-lang"><LanguageSwitcher/></div>
    </div>
   </div>
  </header>
  {message&&<div className="campaign-status-banner nw-status" role="status" aria-live="polite">
   <span>{message}</span><button type="button" onClick={onDismissMessage} aria-label="Fechar aviso"><Icon name="close" size={16}/></button></div>}
  <div className="nw-body">
   {!mobile&&<nav className="nw-rail" aria-label="Menu do Narrador">
    {menu.map(navButton)}<span className="nw-spacer"/>{extra&&navButton(extra)}
   </nav>}
   <main className={'nw-main'+(section==='missivas'?' nw-main--app':'')}>{children}</main>
  </div>
  {mobile&&<nav className="nw-bottom" aria-label="Menu do Narrador">
   {primary.map(navButton)}
   {secondary.length>0&&<button type="button" className="nw-nav-btn" aria-current={inMore?'page':undefined}
    aria-expanded={moreOpen} aria-label="Mais módulos" onClick={()=>setMoreOpen(v=>!v)}><Icon name="mais" size={21}/><span>Mais</span></button>}
  </nav>}
  {mobile&&moreOpen&&<>
   <div className="nw-scrim" onClick={()=>setMoreOpen(false)} aria-hidden="true"/>
   <div className="nw-more" role="menu" aria-label="Mais módulos">
    {secondary.map(([id,name])=>{const link=nav(id);return link
     ?<a key={id} role="menuitem" aria-current={section===id?'page':undefined} {...link}><Icon name={id} size={21}/>{name}</a>
     :<button key={id} type="button" role="menuitem" aria-current={section===id?'page':undefined}
      onClick={()=>go(id)}><Icon name={id} size={21}/>{name}</button>;})}
   </div>
  </>}
 </div>;
}

type RepresentablePlayer={id:string;name:string;active:boolean;user_id:string|null;roster_house_id:string|null};
/**
 * Opções de "Acessar como jogador", agrupadas pelos grupos de narração. Só
 * lista jogadores ativos com conta; a representação continua sendo uma sessão
 * curta validada no servidor (start_campaign_representation).
 */
export function RepresentationOptions({players,houses,selfUserId}:{
 players:RepresentablePlayer[];houses:{id:string;name:string}[];selfUserId:string;
}){
 const eligible=players.filter(p=>p.active&&p.user_id!==selfUserId&&p.user_id);
 const houseName=(id:string|null)=>id?houses.find(h=>h.id===id)?.name??null:null;
 const option=(p:RepresentablePlayer)=>{const house=houseName(p.roster_house_id);
  return <option key={p.id} value={p.id}>{house?`Casa ${house} · ${p.name}`:p.name}</option>;};
 const used=new Set<string>();
 const groups=NARRATION_GROUPS.map(g=>{
  const ids=new Set(narrationHouseIds(g.id,houses.map(h=>h.id)));
  const list=eligible.filter(p=>p.roster_house_id&&ids.has(p.roster_house_id));
  list.forEach(p=>used.add(p.id));
  return {id:g.id,label:g.label,list};
 }).filter(g=>g.list.length>0);
 const rest=eligible.filter(p=>!used.has(p.id));
 return <>
  {groups.map(g=><optgroup key={g.id} label={g.label}>{g.list.map(option)}</optgroup>)}
  {rest.length>0&&(groups.length?<optgroup label="Outros jogadores">{rest.map(option)}</optgroup>:rest.map(option))}
 </>;
}
