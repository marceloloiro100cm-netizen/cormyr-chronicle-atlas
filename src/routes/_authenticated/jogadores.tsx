import {CampaignCalendar} from '@/components/calendar/calendar';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerRepresentation } from '@/components/player-representation';
import { ChangePassword, ChangePasswordButton } from '@/components/change-password';
import { NpcHub, CollapsibleText } from '@/components/npc-hub';
import { NarratorCalendar } from '@/components/calendar/narrator-calendar';
import { CampaignShell } from '@/components/campaign-shell';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CampaignContent } from '@/components/campaign-content';
import { narrativeText } from '@/lib/campaign-content';
import { isFichaCasa, isFichaPersonagem } from '@/lib/ficha';
import { GmEventos, GmAventuras } from '@/components/gm-panels';
import { syncPlayerFolder } from '@/lib/player-sync.functions';
import { refreshPublicArchive } from '@/lib/campaign.functions';
import { unreadReceivedCount, type LetterRow } from '@/lib/letters';
import { loadPanel } from '@/components/players/panel-data';
import { RecordList, RecordEditor, RecordForm } from '@/components/players/records';
import { FichaTab } from '@/components/players/ficha-tab';
import { AdminPanel } from '@/components/players/admin-panel';
import { MissivasTab } from '@/components/players/missivas-tab';

export const Route=createFileRoute('/_authenticated/jogadores')({head:()=>({meta:[{title:'Conselho dos jogadores — Cormyr Chronicle'},{name:'description',content:'Casas, personagens, documentos e missivas da segunda temporada.'},{property:'og:title',content:'Conselho dos jogadores — Cormyr Chronicle'},{property:'og:description',content:'Painel reservado aos jogadores autorizados da campanha.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:Players});

function Players(){
  const navigate=useNavigate(), qc=useQueryClient();
  const {data,error,isPending}=useQuery({queryKey:['campaign-panel'],queryFn:loadPanel});
  const [tab,setTab]=useState('missivas'),[house,setHouse]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[section,setSection]=useState('painel'),[representing,setRepresenting]=useState(false);
  const sync=useServerFn(syncPlayerFolder),refreshArchive=useServerFn(refreshPublicArchive);
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['campaign-panel']});};
  useEffect(()=>{setHouse(sessionStorage.getItem('campaign-selected-house')??'');const channel=supabase.channel('campaign-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public'},()=>{qc.invalidateQueries({queryKey:['campaign-panel']});qc.invalidateQueries({queryKey:['sync-queue']});}).subscribe();return()=>{supabase.removeChannel(channel);};},[qc]);
  if(isPending)return <CampaignShell><h1>Conselho dos jogadores</h1><p role="status">Consultando seu acervo…</p></CampaignShell>;
  if(error||!data)return <CampaignShell><h1>Não foi possível consultar seu acervo</h1><p role="alert">{error?.message}</p><Button onClick={()=>refresh()}>Tentar novamente</Button></CampaignShell>;
  const me=data.players.find(p=>p.user_id===data.user.id);
  if(me&&!data.admin&&(!me.active||me.require_password_change))return <CampaignShell><h1>{me.active?'Altere sua senha para continuar':'Acesso à campanha inativo'}</h1>{me.require_password_change&&<ChangePassword/>}<Button variant="outline" onClick={signout}>Sair</Button></CampaignShell>;
  const authorized=data.admin?data.houses.filter(h=>h.active&&h.season===2):data.houses.filter(h=>data.members.some(m=>m.house_id===h.id&&m.player_id===me?.id));
  const current=authorized.find(h=>h.id===house)??authorized[0];
  const canEdit=data.admin||data.members.some(m=>m.player_id===me?.id&&m.house_id===current?.id&&m.can_edit);
  const unread=unreadReceivedCount(data.letters as LetterRow[],data.replies,data.receipts,data.user.id);
  const afterSave=async()=>{await refresh();if(!current)return;try{const result=await sync({data:{houseId:data.admin?'':current.id,importFiles:false}});setMessage(result.message);await refresh();}catch(e){setMessage('Salvo no site · pasta pendente: '+(e instanceof Error?e.message:'Falha no Drive.'));}};
  async function signout(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',search:{next:'/'},replace:true});}
  const conselho=!current&&!data.admin?<section><h2>Vínculo aguardando autorização</h2><p>Sua identidade foi autenticada, mas nenhuma casa foi autorizada para esta conta. O administrador precisa cadastrar seu jogador e aprovar o vínculo.</p><p>Identificador da conta: <code>{data.user.id}</code></p><p>Não há acesso a documentos, personagens ou missivas de outras casas.</p></section>:<>
    <div className="campaign-toolbar"><label>Casa autorizada<select value={current?.id??''} onChange={e=>setHouse(e.target.value)}>{authorized.map(h=><option value={h.id} key={h.id}>{h.name}</option>)}</select></label></div>
    <nav className="campaign-tabs" aria-label="Painel do jogador">{[['casa','Casa'],['ficha','Ficha'],['calendario','Calendário'],['documentos','Documentos'],['missivas','Missivas'],...(data.admin?[['admin','Administração']]:[])].map(([id,label])=><Button key={id} variant={tab===id?'default':'outline'} aria-pressed={tab===id} aria-label={id==='missivas'&&unread>0?`${label}: ${unread} missiva${unread===1?'':'s'} não lida${unread===1?'':'s'}`:undefined} onClick={()=>setTab(id??'casa')}>{label}{id==='missivas'&&unread>0&&<span className="campaign-tab-count" aria-hidden="true">{unread}</span>}</Button>)}</nav>
    {tab==='casa'&&current&&<><section><p className="campaign-eyebrow">{current.region} · CASA NOBRE</p><h2>{current.name}</h2><CampaignContent content={narrativeText(current.details)}/></section><CollapsibleText title={<h2>Textos da casa</h2>}><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind!=='document'&&r.kind!=='character'&&!isFichaCasa(r.title,r.content)&&!isFichaPersonagem(r.title,r.content)&&Boolean(narrativeText(r.content)))} narrativeOnly canEdit={canEdit} onSave={afterSave}/></CollapsibleText></>}
    {tab==='calendario'&&<CampaignCalendar/>}
    {tab==='ficha'&&current&&<FichaTab npcManager={<NpcHub records={data.records.filter(r=>r.house_id===current.id)} houseId={current.id} playerId={me?.id} admin={data.admin} canEdit={canEdit} onSave={afterSave} renderEditor={row=><RecordEditor row={row} canEdit={canEdit} onSave={afterSave}/>}/>} current={current} records={data.records.filter(r=>r.house_id===current.id)} canEdit={canEdit} onSave={afterSave}/>}
    {tab==='documentos'&&current&&<><h2>Documentos do acervo</h2><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind==='document')} canEdit={canEdit} onSave={afterSave}/>{canEdit&&<RecordForm houseId={current.id} playerId={me?.id} admin={data.admin} onSave={afterSave} kind="document"/>}</>}
    {tab==='missivas'&&<MissivasTab data={data} me={me} onSave={afterSave} onError={setMessage} onManage={id=>{setHouse(id);setTab('ficha');}}/>}
    {tab==='admin'&&data.admin&&<AdminPanel data={data} onSave={afterSave}/>}
    </>;
  if(data.admin&&representing)return <CampaignShell><PlayerRepresentation onReturn={()=>{setRepresenting(false);refresh();}}/></CampaignShell>;
  return <CampaignShell><div className="campaign-heading"><div><p className="campaign-eyebrow">SEGUNDA TEMPORADA · CONSELHO</p><h1>{me?.name??(data.admin?'Conselho do mestre':'Área dos jogadores')}</h1><p className="text-muted-foreground">{data.user.email}</p></div><div className="campaign-actions"><>{data.admin&&<><select aria-label="Acessar como jogador" defaultValue="" onChange={async e=>{if(!e.target.value)return;const r=await supabase.rpc('start_campaign_representation',{p_player:e.target.value});if(r.error)setMessage(r.error.message);else setRepresenting(true);}}><option value="">Acessar como jogador…</option>{data.players.filter(p=>p.active&&p.user_id!==data.user.id&&p.user_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await refreshArchive();setMessage(result.message+' '+result.errors.join('; '));await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Falha na atualização.');}finally{setBusy(false);}}}>Atualizar acervo público</Button></>}</><Button variant="outline" disabled={busy||!current} onClick={async()=>{if(!current)return;setBusy(true);try{const result=await sync({data:{houseId:current.id,importFiles:true}});setMessage(result.message);await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Não foi possível atualizar a pasta.");}finally{setBusy(false);}}}><RefreshCw size={16} className={busy?"animate-spin":""}/>Atualizar</Button><ChangePasswordButton/><Button variant="outline" onClick={signout}>Sair</Button></div></div>
    {data.admin?<div className="campaign-layout"><aside className="campaign-side" aria-label="Menu do Narrador"><p className="campaign-eyebrow">NARRADOR</p>{[['painel','Conselho das casas'],['calendario','Calendário'],['eventos','Eventos'],['aventuras','Aventuras']].map(([id,label])=><button key={id} type="button" className={section===id?'ativo':''} aria-pressed={section===id} onClick={()=>setSection(id??'painel')}>{label}</button>)}</aside><div>{section==='calendario'?<NarratorCalendar/>:section==='eventos'?<GmEventos/>:section==='aventuras'?<GmAventuras/>:conselho}</div></div>:conselho}
    <p role="status">{message}</p>{busy&&<span role="status">Salvando…</span>}
  </CampaignShell>;
}
