import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CalendarDays,Castle,Feather,Mail,Newspaper,Swords} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useServerFn} from '@/lib/visual-preview/server-fn';
import {loadHouseHub} from '@/lib/house/house.functions';
import {balances} from '@/lib/house/engine';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {formatCampaignPeriod,formatDate,dateKey} from '@/lib/calendar/harptos';
import type {Panel} from './panel-data';
import type {WeekFestival} from '@/components/calendar/hub-temporal/week-festivals';

type Props={
 house:Panel['houses'][number];
 data:Panel;
 unreadMail:number;
 newspaperUnread:number;
 weekFestivals:WeekFestival[];
 onOpenTab:(tab:string,extra?:Record<string,string|null>)=>void;
};

/**
 * Painel "Minha Semana": resumo acionável no topo da aba Casa do jogador,
 * reunindo Semana/Data oficial, Chancelaria, Pulso da Casa e Jornal.
 */
export function PlayerWeekDashboard({house,data,unreadMail,newspaperUnread,weekFestivals,onOpenTab}:Props){
 const {data:clock}=useCampaignTime();
 const load=useServerFn(loadHouseHub);
 const hubQuery=useQuery({
  queryKey:['noble-house',house.id],
  queryFn:()=>load({data:{houseId:house.id}}),
  staleTime:60_000,
  retry:false,
 });

 const openRound=useMemo(()=>data.rounds.filter(r=>r.status==='open').map(r=>r.number).sort((a,b)=>b-a)[0]??null,[data.rounds]);
 const weekMail=useMemo(()=>{
  if(openRound===null)return {sent:0,drafts:0};
  let sent=0,drafts=0;
  for(const l of data.letters){
   if(l.deleted_at||l.sender_user_id!==data.user.id)continue;
   if(l.publication_state==='draft'&&l.creation_week===openRound)drafts++;
   else if((l.creation_week===openRound||l.delivery_week===openRound)&&l.publication_state!=='draft')sent++;
  }
  return {sent,drafts};
 },[data.letters,data.user.id,openRound]);

 const state=hubQuery.data?.state??null;
 const bal=state?balances(state):null;
 const deficits=bal?RESOURCE_KEYS.filter(k=>bal.available[k]<0):[];
 const building=state?state.projects.filter(p=>p.status==='building').length:0;
 const units=state?state.units.length:0;
 const court=state?state.court.length:0;

 return <section className="player-week-dash" aria-label="Resumo da semana da Casa">
  <div className="pwd-head">
   <div>
    <p className="campaign-eyebrow">MINHA SEMANA · CASA {house.name.toUpperCase()}</p>
    <h2>Mesa do Conselho</h2>
   </div>
   <div className="pwd-head-actions">
    <Button onClick={()=>onOpenTab('missivas',{compor:'1'})}><Feather size={16}/>Escrever missiva</Button>
    <Button variant="outline" onClick={()=>onOpenTab('ficha')}><Castle size={16}/>Gerir Casa</Button>
   </div>
  </div>

  <div className="pwd-grid">
   <article className="pwd-card">
    <div className="pwd-card-top">
     <span className="pwd-ic"><CalendarDays size={18}/></span>
     <h3>Tempo oficial</h3>
    </div>
    <p className="pwd-big">{openRound!==null?`Semana ${openRound} aberta`:'Entre semanas'}</p>
    <p className="pwd-sub">{clock?`${formatDate(dateKey(clock))} · ${formatCampaignPeriod(clock)}`:'Consultando calendário de Harptos…'}</p>
    {weekFestivals.length>0&&<p className="pwd-pill pwd-pill--gold">✦ {weekFestivals.map(f=>f.name).join(', ')}</p>}
    <div className="pwd-card-foot">
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('calendario')}>Abrir Calendário</Button>
    </div>
   </article>

   <article className="pwd-card">
    <div className="pwd-card-top">
     <span className="pwd-ic"><Mail size={18}/></span>
     <h3>Chancelaria</h3>
    </div>
    <p className="pwd-big">{unreadMail>0?`${unreadMail} em Sua vez`:'Caixa em dia'}</p>
    <p className="pwd-sub">
     {openRound!==null
      ?`${weekMail.sent} enviada${weekMail.sent===1?'':'s'} na Semana ${openRound}${weekMail.drafts>0?` · ${weekMail.drafts} rascunho${weekMail.drafts===1?'':'s'}`:''}`
      :'Consulte sua correspondência e rascunhos.'}
    </p>
    <div className="pwd-card-foot">
     <Button size="sm" variant={unreadMail>0?'default':'outline'} onClick={()=>onOpenTab('missivas')}>Abrir Missivas</Button>
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('missivas',{compor:'1'})}>Nova carta</Button>
    </div>
   </article>

   <article className="pwd-card">
    <div className="pwd-card-top">
     <span className="pwd-ic"><Swords size={18}/></span>
     <h3>Pulso da Casa</h3>
    </div>
    {state&&bal?<>
     <div className="pwd-res-mini">
      {RESOURCE_KEYS.map(k=><span key={k} className={'pwd-res-chip'+(bal.available[k]<0?' pwd-res-chip--neg':'')}>
       {RESOURCE_NAMES[k].slice(0,3)}. <b>{bal.available[k]}</b>
      </span>)}
     </div>
     <p className="pwd-sub">
      {units} unidade{units===1?'':'s'} · {court} na Corte · {building} obra{building===1?'':'s'} em andamento
     </p>
     {deficits.length>0&&<p className="pwd-pill pwd-pill--warn">Déficit em {deficits.map(k=>RESOURCE_NAMES[k]).join(', ')}</p>}
    </>:<p className="pwd-sub">{hubQuery.isPending?'Consultando ficha da Casa…':'Abra a Ficha para ver recursos, tropas e projetos.'}</p>}
    <div className="pwd-card-foot">
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('ficha')}>Ficha</Button>
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('ficha',{parte:'spy'})}>Espionagem</Button>
    </div>
   </article>

   <article className="pwd-card">
    <div className="pwd-card-top">
     <span className="pwd-ic"><Newspaper size={18}/></span>
     <h3>Imprensa &amp; Acervo</h3>
    </div>
    <p className="pwd-big">{newspaperUnread>0?`${newspaperUnread} novidade${newspaperUnread===1?'':'s'} no Jornal`:'A Folha Sem Selo'}</p>
    <p className="pwd-sub">Edições do reino, encomendas à Redação, galeria e documentos da Casa.</p>
    <div className="pwd-card-foot">
     <Button size="sm" variant={newspaperUnread>0?'default':'outline'} onClick={()=>onOpenTab('jornal')}>Ler Jornal</Button>
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('galeria')}>Galeria</Button>
     <Button size="sm" variant="outline" onClick={()=>onOpenTab('documentos')}>Docs</Button>
    </div>
   </article>
  </div>
 </section>;
}
