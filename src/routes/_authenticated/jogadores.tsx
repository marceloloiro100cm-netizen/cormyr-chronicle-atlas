import {CampaignCalendar} from '@/components/calendar/calendar';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlayerRepresentation } from '@/components/player-representation';
import { ChangePassword, ChangePasswordButton } from '@/components/change-password';
import { NpcHub, CollapsibleText } from '@/components/npc-hub';
import { NarratorCalendar } from '@/components/calendar/narrator-calendar';
import { CampaignShell } from '@/components/campaign-shell';
import { Button } from '@/components/ui/button';
import { CampaignContent } from '@/components/campaign-content';
import { narrativeText } from '@/lib/campaign-content';
import { isFichaCasa, isFichaPersonagem } from '@/lib/ficha';
import { GmEventos, GmAventuras } from '@/components/gm-panels';
import { syncPlayerFolder } from '@/lib/player-sync.functions';
import { unreadReceivedCount, type LetterRow } from '@/lib/letters';
import {clearRepresentationQueryCache} from '@/lib/auth/session-boundary';
import {CAMPAIGN_ACCESS_SCOPE_KEY,CAMPAIGN_ACCESS_SCOPE_POLL_MS,loadCampaignAccessScope,clearRevokedAccessCache} from '@/lib/auth/campaign-access-scope';
import {NARRATOR_ACCESS_REVOKED_KEY,canReleaseNarratorLock,watchNarratorPrivateReadRevocations,type NarratorRevocationMarker} from '@/lib/auth/narrator-revocation';
import { loadPanel } from '@/components/players/panel-data';
import { RecordList, RecordEditor, RecordForm } from '@/components/players/records';
import { FichaTab } from '@/components/players/ficha-tab';
import {GalleryTab} from '@/components/players/gallery-tab';
import { AdminPanel } from '@/components/players/admin-panel';
import { MissivasTab } from '@/components/players/missivas-tab';
import { HouseIdentity } from '@/components/players/house-identity';
import { NarratorMissivasHub, NARRATOR_MENU } from '@/components/players/narrator-missives-hub';
import {SpyNarratorDossiers} from '@/components/house/espionage/spy-dossier-panel';
import {BATTLE_MODULE_ENABLED} from '@/lib/battle/feature-flag';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleV3Game} from '@/components/battle/BattleV3Game';

export const Route=createFileRoute('/_authenticated/jogadores')({head:()=>({meta:[{title:'Conselho dos jogadores — Cormyr Chronicle'},{name:'description',content:'Casas, personagens, documentos e missivas da segunda temporada.'},{property:'og:title',content:'Conselho dos jogadores — Cormyr Chronicle'},{property:'og:description',content:'Painel reservado aos jogadores autorizados da campanha.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:Players});

/** Access can be revoked without any Supabase auth event. The live route
 * must first prove the CURRENT memberships before showing cached private data.
 * Refetch on focus/reconnect, plus a 15s fallback for missed RLS Realtime.
 */
function Players(){
  const qc=useQueryClient();
  const scope=useQuery({
    queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,
    queryFn:loadCampaignAccessScope,
    refetchInterval:CAMPAIGN_ACCESS_SCOPE_POLL_MS,
    refetchOnWindowFocus:'always',
    refetchOnReconnect:'always',
    retry:false,
    staleTime:0,
  });
  // An administrative RPC denial locks the ENTIRE workspace immediately, not
  // just the calendar tab. Never trust the old role while the new RPC is pending.
  const revoked=useQuery({
    queryKey:NARRATOR_ACCESS_REVOKED_KEY,
    queryFn:async()=>null as NarratorRevocationMarker|null,
    enabled:false,
    initialData:null as NarratorRevocationMarker|null,
  });
  useEffect(()=>{
    if(!revoked.data)return;
    if(canReleaseNarratorLock(revoked.data,{
      dataUpdatedAt:scope.dataUpdatedAt,
      hasData:Boolean(scope.data),
      isError:scope.isError,
      isFetching:scope.isFetching,
    }))qc.setQueryData(NARRATOR_ACCESS_REVOKED_KEY,null);
  },[qc,revoked.data?.revokedAt,scope.dataUpdatedAt,scope.data?.fingerprint,scope.isError,scope.isFetching]);
  // Scope is the only source of admin authority; a failed private temporal
  // read still removes private QueryCache data and locks the entire workspace.
  useEffect(()=>{
    if(!scope.data?.admin||revoked.data)return;
    return watchNarratorPrivateReadRevocations(qc);
  },[qc,scope.data?.admin,revoked.data?.revokedAt]);
  const previous=useRef<string|null>(null);
  const [approved,setApproved]=useState<string|null>(null);
  useEffect(()=>{
    if(scope.isError){
      clearRevokedAccessCache(qc);
      previous.current=null;
      setApproved(null);
      return;
    }
    const next=scope.data?.fingerprint;
    if(!next||next===previous.current)return;
    if(previous.current!==null){
      // Revoke stale letters, administrative controls, and House forms before
      // mounting the newly authorized workspace. Server RLS remains mandatory.
      clearRevokedAccessCache(qc);
      sessionStorage.removeItem('campaign-selected-house');
    }
    previous.current=next;
    setApproved(next);
  },[qc,scope.data?.fingerprint,scope.isError]);
  if(revoked.data)return <section role="alert">
    O acesso administrativo foi bloqueado após revogação. Aguardando uma nova confirmação das permissões.
    <Button onClick={()=>void scope.refetch()}>Verificar permissões novamente</Button>
  </section>;
  if(scope.isError)return <section role="alert">
    Não foi possível confirmar seus vínculos e permissões. O acervo reservado está bloqueado.
    <Button onClick={()=>void scope.refetch()}>Verificar novamente</Button>
  </section>;
  if(!scope.data||approved!==scope.data.fingerprint)return <p role="status">
    Verificando permissões atuais da campanha…
  </p>;
  return <PlayersWorkspace key={approved} expectedUserId={scope.data.userId}/>;
}
function PlayersWorkspace({expectedUserId}:{expectedUserId:string}){
  const navigate=useNavigate(), qc=useQueryClient();
  const {data,error,isPending}=useQuery({queryKey:['campaign-panel'],queryFn:loadPanel});
  const [tab,setTab]=useState('missivas'),[house,setHouse]=useState(''),[message,setMessage]=useState(''),[section,setSection]=useState('painel'),[representing,setRepresenting]=useState(false);
  const [mailFilterHost,setMailFilterHost]=useState<HTMLDivElement|null>(null);
  const sync=useServerFn(syncPlayerFolder);
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['campaign-panel']});};
  useEffect(()=>{if(data?.admin)setTab(previous=>previous==='missivas'?'casa':previous);},[data?.admin]);
  useEffect(()=>{
    setHouse(sessionStorage.getItem('campaign-selected-house')??'');
    let debounce:ReturnType<typeof setTimeout>|null=null;
    const channel=supabase.channel('campaign-'+crypto.randomUUID())
      .on('postgres_changes',{event:'*',schema:'public'},()=>{
        if(debounce)clearTimeout(debounce);
        debounce=setTimeout(()=>{
          void qc.invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY});
          void qc.invalidateQueries({queryKey:['campaign-panel']});
          void qc.invalidateQueries({queryKey:['sync-queue']});
          debounce=null;
        },400);
      }).subscribe();
    return()=>{if(debounce)clearTimeout(debounce);void supabase.removeChannel(channel);};
  },[qc]);
  if(isPending)return <CampaignShell><h1>Conselho dos jogadores</h1><p role="status">Consultando seu acervo…</p></CampaignShell>;
  if(data&&data.user.id!==expectedUserId)return <p role="status">Revalidando a identidade do acervo…</p>;
  if(error||!data)return <CampaignShell><h1>Não foi possível consultar seu acervo</h1><p role="alert">{error?.message}</p><Button onClick={()=>refresh()}>Tentar novamente</Button></CampaignShell>;
  const me=data.players.find(p=>p.user_id===data.user.id);
  if(me&&!data.admin&&(!me.active||me.require_password_change))return <CampaignShell><h1>{me.active?'Altere sua senha para continuar':'Acesso à campanha inativo'}</h1>{me.require_password_change&&<ChangePassword/>}<Button variant="outline" onClick={signout}>Sair</Button></CampaignShell>;
  const authorized=data.admin?data.houses.filter(h=>h.active&&h.season===2):data.houses.filter(h=>data.members.some(m=>m.house_id===h.id&&m.player_id===me?.id));
  const current=data.admin?(authorized.find(h=>h.id===house)??authorized[0]):(authorized.find(h=>h.id===me?.roster_house_id)??authorized[0]);
  const canEdit=data.admin||data.members.some(m=>m.player_id===me?.id&&m.house_id===current?.id&&m.can_edit);
  const unread=unreadReceivedCount(data.letters as LetterRow[],data.replies,data.receipts,data.user.id,data.admin);
  const afterSave=async()=>{await refresh();if(!current)return;try{const result=await sync({data:{houseId:data.admin?'':current.id,importFiles:false}});setMessage(result.message);await refresh();}catch(e){setMessage('Salvo no site · pasta pendente: '+(e instanceof Error?e.message:'Falha no Drive.'));}};
  async function signout(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',search:{next:'/'},replace:true});}
  const conselho=!current&&!data.admin?<section><h2>Vínculo aguardando autorização</h2><p>Sua identidade foi autenticada, mas nenhuma casa foi autorizada para esta conta. O administrador precisa cadastrar seu jogador e aprovar o vínculo.</p><p>Identificador da conta: <code>{data.user.id}</code></p><p>Não há acesso a documentos, personagens ou missivas de outras casas.</p></section>:<>
    <div className="campaign-toolbar">
      {current&&<HouseIdentity house={current}/>}
      {data.admin&&<select aria-label="Selecionar casa para administração" value={current?.id??''} onChange={e=>{setHouse(e.target.value);sessionStorage.setItem('campaign-selected-house',e.target.value);}}>{authorized.map(h=><option value={h.id} key={h.id}>{h.name}</option>)}</select>}
    </div>
    <nav className="campaign-tabs" aria-label="Painel do jogador">{[['casa','Casa'],['ficha','Ficha'],['galeria','Galeria'],['calendario','Calendário'],['documentos','Documentos'],...(!data.admin?[['missivas','Missivas']]:[]),...(!data.admin&&BATTLE_MODULE_ENABLED?[['batalha','Batalha']]:[]),...(data.admin?[['admin','Administração']]:[])].map(([id,label])=><Button key={id} variant={tab===id?'default':'outline'} aria-pressed={tab===id} aria-label={id==='missivas'&&unread>0?`${label}: ${unread} missiva${unread===1?'':'s'} não lida${unread===1?'':'s'}`:undefined} onClick={()=>setTab(id??'casa')}>{label}{id==='missivas'&&unread>0&&<span className="campaign-tab-count" aria-hidden="true">{unread}</span>}</Button>)}</nav>
    {tab==='casa'&&current&&<><section><p className="campaign-eyebrow">{current.region} · CASA NOBRE</p><h2>{current.name}</h2><CampaignContent content={narrativeText(current.details)}/></section><CollapsibleText title={<h2>Textos da casa</h2>}><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind!=='document'&&r.kind!=='character'&&!isFichaCasa(r.title,r.content)&&!isFichaPersonagem(r.title,r.content)&&Boolean(narrativeText(r.content)))} narrativeOnly canEdit={canEdit} onSave={afterSave}/></CollapsibleText></>}
    {tab==='galeria'&&current&&<GalleryTab key={current.id} houseId={current.id}
     houseName={current.name} records={data.records.filter(r=>r.house_id===current.id)}/>}
    {tab==='calendario'&&<CampaignCalendar/>}
    {tab==='ficha'&&current&&<FichaTab playerId={me?.id} admin={data.admin} npcManager={<NpcHub records={data.records.filter(r=>r.house_id===current.id)} houseId={current.id} playerId={me?.id} admin={data.admin} canEdit={canEdit} onSave={afterSave} renderEditor={row=><RecordEditor row={row} canEdit={canEdit} onSave={afterSave}/>}/>} current={current} records={data.records.filter(r=>r.house_id===current.id)} canEdit={canEdit} onSave={afterSave}/>}
    {tab==='documentos'&&current&&<><h2>Documentos do acervo</h2><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind==='document')} canEdit={canEdit} onSave={afterSave}/>{canEdit&&<RecordForm houseId={current.id} playerId={me?.id} admin={data.admin} onSave={afterSave} kind="document"/>}</>}
    {tab==='missivas'&&!data.admin&&<MissivasTab data={data} me={me} onSave={afterSave} onError={setMessage} onManage={id=>{setHouse(id);sessionStorage.setItem('campaign-selected-house',id);setTab('ficha');}}/>}
    {tab==='admin'&&data.admin&&<AdminPanel data={data} onSave={afterSave}/>}
    {tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&<BattleV3Game/>}
    </>;
  if(data.admin&&representing)return <CampaignShell><PlayerRepresentation onReturn={()=>{clearRepresentationQueryCache(qc);setRepresenting(false);void refresh();}}/></CampaignShell>;
  return <CampaignShell><div className="campaign-heading"><div><p className="campaign-eyebrow">SEGUNDA TEMPORADA · CONSELHO</p><h1>{me?.name??(data.admin?'Conselho do mestre':'Área dos jogadores')}</h1></div><div className="campaign-actions">{data.admin&&<select aria-label="Acessar como jogador" defaultValue="" onChange={async e=>{if(!e.target.value)return;const r=await supabase.rpc('start_campaign_representation',{p_player:e.target.value});if(r.error)setMessage(r.error.message);else {clearRepresentationQueryCache(qc);setRepresenting(true);}}}><option value="">Acessar como jogador…</option>{data.players.filter(p=>p.active&&p.user_id!==data.user.id&&p.user_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}<ChangePasswordButton/><Button variant="outline" onClick={signout}>Sair</Button></div></div>
    {message&&<div className="campaign-status-banner" role="status" aria-live="polite">{message}</div>}
    {data.admin?<div className={'campaign-layout'+(section==='missivas'?' campaign-layout--mail':'')}><div className="campaign-side-column"><aside className="campaign-side" aria-label="Menu do Narrador"><p className="campaign-eyebrow">NARRADOR</p>{NARRATOR_MENU.filter(([id])=>id!=='batalha'||BATTLE_MODULE_ENABLED).map(([id,label])=><button key={id} type="button" className={section===id?'ativo':''} aria-pressed={section===id} aria-label={id==='missivas'&&unread>0?`${label}: ${unread} conversa${unread===1?'':'s'} com correspondência não lida`:undefined} onClick={()=>setSection(id??'painel')}>{label}{id==='missivas'&&unread>0&&<span className="campaign-tab-count" aria-hidden="true">{unread}</span>}</button>)}</aside>{section==='missivas'&&<div className="narrator-mail-filter-slot" id="narrator-mail-filter-slot" ref={setMailFilterHost}/>}</div><div>{section==='missivas'?<NarratorMissivasHub filterHost={mailFilterHost} data={data} me={me} onSave={()=>{void refresh();}} onError={setMessage} onManage={id=>{setHouse(id);setTab('ficha');setSection('painel');}}/>:section==='calendario'?<NarratorCalendar/>:section==='dossies'?<SpyNarratorDossiers/>:section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub/>:section==='eventos'?<GmEventos/>:section==='aventuras'?<GmAventuras/>:conselho}</div></div>:conselho}
  </CampaignShell>;
}
