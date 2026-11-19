import { useNavigate } from '@tanstack/react-router';
import {CampaignCalendar} from '@/components/calendar/calendar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {useServerFn} from '@/lib/visual-preview/server-fn';
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
import {EditorMailReader} from '@/components/players/editor-mail-reader';
import {MissivasArea} from '@/components/players/chancelaria/MissivasArea';
import {CouncilOpening} from '@/components/firebase/CouncilOpening';
import {FirebaseCouncilAccessReview} from '@/components/firebase/FirebaseCouncilAccessReview';
import {firebaseWorkspaceClient} from '@/lib/firebase-workspace/state';
import {NewspaperHub,useUnreadNewspaperCount,useUnseenCommissionAnswers} from '@/components/newspaper/NewspaperHub';
import { HouseIdentity } from '@/components/players/house-identity';
import {heraldicHouseKey,type HeraldicHouse} from '@/lib/house/heraldry';
import { NarratorMissivasHub, NARRATOR_MENU } from '@/components/players/narrator-missives-hub';
import {SpyNarratorDossiers} from '@/components/house/espionage/spy-dossier-panel';
import {BATTLE_MODULE_ENABLED as BATTLE_MODULE_BUILD_ENABLED,BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleV3PlayerEntry} from '@/components/battle/BattleV3PlayerEntry';

/**
 * Área interna original da segunda temporada (Conselho dos jogadores, do
 * Narrador e do Editor-Chefe). Compartilhada pela rota legada /jogadores e
 * pela área interna exibida após o login Firebase (/firebase-access).
 */
export type PlayersAreaProps={
  /** Substitui a saída padrão (Supabase + /auth), por exemplo pelo logout Firebase. */
  onSignOut?:(()=>void)|undefined;
  /** Oculta o módulo de batalha mesmo quando habilitado no build. */
  hideBattle?:boolean|undefined;
};
/** Encerra a sessão limpando o cache privado antes de sair. */
function useAreaSignout(onSignOut:PlayersAreaProps['onSignOut']){
  const qc=useQueryClient(),navigate=useNavigate();
  return async()=>{
    await qc.cancelQueries();qc.clear();
    if(onSignOut){onSignOut();return;}
    await supabase.auth.signOut();
    await navigate({to:'/auth',search:{next:'/'},replace:true});
  };
}

/** Negativas do servidor (nunca repetidas): sessão, perfil ou vínculo recusados. */
const ACCESS_DENIAL=/access_denied|authentication_required|invalid_access_scope|não autorizad|Identidade alterada|divergentes|expirada/i;
/** Access can be revoked without any Supabase auth event. The live route
 * must first prove the CURRENT memberships before showing cached private data.
 * Refetch on focus/reconnect, plus a 15s fallback for missed RLS Realtime.
 */
export function PlayersArea({onSignOut,hideBattle=false}:PlayersAreaProps={}){
  const qc=useQueryClient();
  const signout=useAreaSignout(onSignOut);
  const scope=useQuery({
    queryKey:CAMPAIGN_ACCESS_SCOPE_KEY,
    queryFn:loadCampaignAccessScope,
    refetchInterval:CAMPAIGN_ACCESS_SCOPE_POLL_MS,
    refetchOnWindowFocus:'always',
    refetchOnReconnect:'always',
    // Uma oscilação de rede não pode derrubar o Conselho e apagar o que está
    // sendo escrito. Negativas de acesso continuam bloqueando na hora.
    retry:(failures,error)=>failures<2&&!ACCESS_DENIAL.test(error instanceof Error?error.message:''),
    retryDelay:1500,
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
  if(scope.isError)return <CouncilOpening><section role="alert">
    Não foi possível confirmar seus vínculos e permissões. O acervo reservado está bloqueado.
    {scope.error instanceof Error&&<small className="block text-xs opacity-80">Detalhe técnico: {scope.error.message}</small>}
    <div className="campaign-actions"><Button onClick={()=>void scope.refetch()}>Verificar novamente</Button>
    <Button variant="outline" onClick={()=>void signout()}>Sair</Button></div>
  </section></CouncilOpening>;
  // Mesma tela de abertura do login até o acervo carregar (uma única tela).
  if(!scope.data||approved!==scope.data.fingerprint)return <CouncilOpening/>;
  // Mandatory first-login password change precedes all private campaign reads.
  // A freshly provisioned player cannot rely on loadPanel(), since its RLS
  // queries may be restricted until the credential is rotated.
  if(!scope.data.admin&&scope.data.playerId&&
    (!scope.data.active||scope.data.passwordChangeRequired))
   return <CampaignShell>
    <h1>{scope.data.active?'Altere sua senha para continuar':'Acesso à campanha inativo'}</h1>
    {scope.data.passwordChangeRequired&&scope.data.active&&<ChangePassword/>}
    <Button variant="outline" onClick={signout}>Sair</Button>
   </CampaignShell>;
  if(scope.data.profile==='editor')return <EditorialWorkspace key={approved} expectedUserId={scope.data.userId} onSignOut={onSignOut}/>;
  if(scope.data.profile!=='jogador'&&scope.data.profile!=='narrador')return <section role="alert">Conta sem perfil autorizado na campanha.</section>;
  return <PlayersWorkspace key={approved} expectedUserId={scope.data.userId} onSignOut={onSignOut} hideBattle={hideBattle}/>;
}
function EditorialWorkspace({expectedUserId,onSignOut}:{expectedUserId:string;onSignOut:PlayersAreaProps['onSignOut']}){
  const signout=useAreaSignout(onSignOut);
  // Editor-Chefe lê as missivas entregues (somente leitura) para escrever o Jornal.
  const [view,setView]=useState<'jornal'|'missivas'>('jornal');
  return <>
    <nav className="campaign-tabs" aria-label="Área do Editor-Chefe">{([['jornal','Redação do Jornal'],['missivas','Missivas (somente leitura)']] as const).map(([id,label])=>
      <Button key={id} variant={view===id?'default':'outline'} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</Button>)}</nav>
    {view==='missivas'?<CampaignShell publicTime><EditorMailReader userId={expectedUserId}/></CampaignShell>
      :<NewspaperHub userId={expectedUserId} editor editorial onSignout={()=>{void signout();}}/>}
  </>;
}
function PlayersWorkspace({expectedUserId,onSignOut,hideBattle}:{expectedUserId:string;onSignOut:PlayersAreaProps['onSignOut'];hideBattle:boolean}){
  const qc=useQueryClient();
  const signout=useAreaSignout(onSignOut);
  // A área interna Firebase não exibe o módulo de batalha.
  const BATTLE_MODULE_ENABLED=BATTLE_MODULE_BUILD_ENABLED&&!hideBattle;
  const {data,error,isPending}=useQuery({queryKey:['campaign-panel'],queryFn:loadPanel});
  const {count:editionsUnread}=useUnreadNewspaperCount(expectedUserId);
  const commissionAnswers=useUnseenCommissionAnswers(expectedUserId);
  const newspaperUnread=editionsUnread+commissionAnswers;
  const [tab,setTab]=useState('missivas'),[house,setHouse]=useState(''),[message,setMessage]=useState(''),[section,setSection]=useState('painel'),[representing,setRepresenting]=useState(false),[representedTheme,setRepresentedTheme]=useState<HeraldicHouse|null>(null);
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
  if(isPending)return <CouncilOpening/>;
  if(data&&data.user.id!==expectedUserId)return <p role="status">Revalidando a identidade do acervo…</p>;
  if(error||!data)return <CampaignShell><h1>Não foi possível consultar seu acervo</h1><p role="alert">{error?.message}</p><Button onClick={()=>refresh()}>Tentar novamente</Button></CampaignShell>;
  const me=data.players.find(p=>p.user_id===data.user.id);
  if(me&&!data.admin&&(!me.active||me.require_password_change))return <CampaignShell><h1>{me.active?'Altere sua senha para continuar':'Acesso à campanha inativo'}</h1>{me.require_password_change&&<ChangePassword/>}<Button variant="outline" onClick={signout}>Sair</Button></CampaignShell>;
  const authorized=data.admin?data.houses.filter(h=>h.active&&h.season===2):data.houses.filter(h=>data.members.some(m=>m.house_id===h.id&&m.player_id===me?.id));
  const current=data.admin?(authorized.find(h=>h.id===house)??authorized[0]):(authorized.find(h=>h.id===me?.roster_house_id)??authorized[0]);
  const canEdit=data.admin||data.members.some(m=>m.player_id===me?.id&&m.house_id===current?.id&&m.can_edit);
  const unread=unreadReceivedCount(data.letters as LetterRow[],data.replies,data.receipts,data.user.id,data.admin);
  const afterSave=async()=>{await refresh();if(!current)return;try{const result=await sync({data:{houseId:data.admin?'':current.id,importFiles:false}});setMessage(result.message);await refresh();}catch(e){setMessage('Salvo no site · pasta pendente: '+(e instanceof Error?e.message:'Falha no Drive.'));}};
  const conselho=!current&&!data.admin?<section><h2>Vínculo aguardando autorização</h2><p>Sua identidade foi autenticada, mas nenhuma casa foi autorizada para esta conta. O administrador precisa cadastrar seu jogador e aprovar o vínculo.</p><p>Identificador da conta: <code>{data.user.id}</code></p><p>Não há acesso a documentos, personagens ou missivas de outras casas.</p></section>:<>
    <div className="campaign-toolbar">
      {current&&<HouseIdentity house={current}/>}
      {data.admin&&<select aria-label="Selecionar casa para administração" value={current?.id??''} onChange={e=>{setHouse(e.target.value);sessionStorage.setItem('campaign-selected-house',e.target.value);}}>{authorized.map(h=><option value={h.id} key={h.id}>{h.name}</option>)}</select>}
    </div>
    <nav className="campaign-tabs" aria-label="Painel do jogador">{[['casa','Casa'],['ficha','Ficha'],['galeria','Galeria'],['calendario','Calendário'],['documentos','Documentos'],...(!data.admin?[['missivas','Missivas'],['jornal','Jornal']]:[]),...(!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED?[['batalha','Batalha']]:[]),...(data.admin?[['admin','Administração']]:[])].map(([id,label])=><Button key={id} variant={tab===id?'default':'outline'} aria-pressed={tab===id} aria-label={id==='jornal'&&newspaperUnread>0?`Jornal: ${newspaperUnread} novidade(s)`:id==='missivas'&&unread>0?`${label}: ${unread} missiva${unread===1?'':'s'} não lida${unread===1?'':'s'}`:undefined} onClick={()=>setTab(id??'casa')}>{label}{id==='missivas'&&unread>0&&<span className="campaign-tab-count" aria-hidden="true">{unread}</span>}{id==='jornal'&&newspaperUnread>0&&<span className="campaign-tab-count" aria-hidden="true">{newspaperUnread}</span>}</Button>)}</nav>
    {tab==='casa'&&current&&<><section><p className="campaign-eyebrow">{current.region} · CASA NOBRE</p><h2>{current.name}</h2><CampaignContent content={narrativeText(current.details)}/></section><CollapsibleText title={<h2>Textos da casa</h2>}><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind!=='document'&&r.kind!=='character'&&!isFichaCasa(r.title,r.content)&&!isFichaPersonagem(r.title,r.content)&&Boolean(narrativeText(r.content)))} narrativeOnly canEdit={canEdit} onSave={afterSave}/></CollapsibleText></>}
    {tab==='galeria'&&current&&<GalleryTab key={current.id} houseId={current.id}
     houseName={current.name} records={data.records.filter(r=>r.house_id===current.id)}/>}
    {tab==='calendario'&&<CampaignCalendar/>}
    {tab==='ficha'&&current&&<FichaTab playerId={me?.id} admin={data.admin} npcManager={<NpcHub records={data.records.filter(r=>r.house_id===current.id)} houseId={current.id} playerId={me?.id} admin={data.admin} canEdit={canEdit} onSave={afterSave} renderEditor={row=><RecordEditor row={row} canEdit={canEdit} onSave={afterSave}/>}/>} current={current} records={data.records.filter(r=>r.house_id===current.id)} canEdit={canEdit} onSave={afterSave}/>}
    {tab==='documentos'&&current&&<><h2>Documentos do acervo</h2><RecordList rows={data.records.filter(r=>r.house_id===current.id&&r.kind==='document')} canEdit={canEdit} onSave={afterSave}/>{canEdit&&<RecordForm houseId={current.id} playerId={me?.id} admin={data.admin} onSave={afterSave} kind="document"/>}</>}
    {tab==='jornal'&&!data.admin&&<NewspaperHub userId={data.user.id} editor={false} {...(current?{houseId:current.id}:{})}/>}
    {tab==='missivas'&&!data.admin&&<MissivasArea data={data} me={me} onSave={afterSave} onError={setMessage} onManage={id=>{setHouse(id);sessionStorage.setItem('campaign-selected-house',id);setTab('ficha');}} classic={<MissivasTab data={data} me={me} onSave={afterSave} onError={setMessage} onManage={id=>{setHouse(id);sessionStorage.setItem('campaign-selected-house',id);setTab('ficha');}}/>}/>}
    {tab==='admin'&&data.admin&&<AdminPanel data={data} onSave={afterSave}/>}
    {tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED&&<BattleV3PlayerEntry houseId={current?.id??''}/>}
    </>;
  if(data.admin&&representing)return <CampaignShell heraldry={representedTheme}><PlayerRepresentation onHouseTheme={setRepresentedTheme} onReturn={()=>{clearRepresentationQueryCache(qc);setRepresentedTheme(null);setRepresenting(false);void refresh();}}/></CampaignShell>;
  return <CampaignShell heraldry={!data.admin&&current?heraldicHouseKey(current.name):null}><div className="campaign-heading"><div><p className="campaign-eyebrow">SEGUNDA TEMPORADA · CONSELHO</p><h1>{me?.name??(data.admin?'Conselho do mestre':'Área dos jogadores')}</h1></div><div className="campaign-actions">{data.admin&&<select aria-label="Acessar como jogador" defaultValue="" onChange={async e=>{if(!e.target.value)return;const r=await supabase.rpc('start_campaign_representation',{p_player:e.target.value});if(r.error)setMessage(r.error.message);else {clearRepresentationQueryCache(qc);setRepresenting(true);}}}><option value="">Acessar como jogador…</option>{data.players.filter(p=>p.active&&p.user_id!==data.user.id&&p.user_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}<ChangePasswordButton/><Button variant="outline" onClick={signout}>Sair</Button></div></div>
    {message&&<div className="campaign-status-banner" role="status" aria-live="polite">{message}</div>}
    {data.admin?<div className={'campaign-layout'+(section==='missivas'?' campaign-layout--mail':'')}><div className="campaign-side-column"><aside className="campaign-side" aria-label="Menu do Narrador"><p className="campaign-eyebrow">NARRADOR</p>{NARRATOR_MENU.filter(([id])=>id!=='batalha'||BATTLE_MODULE_ENABLED).map(([id,label])=><button key={id} type="button" className={section===id?'ativo':''} aria-pressed={section===id} aria-label={id==='missivas'&&unread>0?`${label}: ${unread} conversa${unread===1?'':'s'} com correspondência não lida`:undefined} onClick={()=>setSection(id??'painel')}>{label}{id==='missivas'&&unread>0&&<span className="campaign-tab-count" aria-hidden="true">{unread}</span>}</button>)}{firebaseWorkspaceClient()!==null&&<button type="button"
      className={section==='acessos-firebase'?'ativo':''}
      aria-pressed={section==='acessos-firebase'}
      onClick={()=>setSection('acessos-firebase')}>
      Contas pendentes Firebase
    </button>}</aside>{section==='missivas'&&<div className="narrator-mail-filter-slot" id="narrator-mail-filter-slot" ref={setMailFilterHost}/>}</div><div>{section==='acessos-firebase'&&firebaseWorkspaceClient()!==null?
      <FirebaseCouncilAccessReview narrator={data.admin} houses={data.houses}/>:
      section==='missivas'?<MissivasArea data={data} me={me} onSave={()=>{void refresh();}} onError={setMessage} onManage={id=>{setHouse(id);setTab('ficha');setSection('painel');}} classic={<NarratorMissivasHub filterHost={mailFilterHost} data={data} me={me} onSave={()=>{void refresh();}} onError={setMessage} onManage={id=>{setHouse(id);setTab('ficha');setSection('painel');}}/>}/>:section==='jornal'?<NewspaperHub userId={data.user.id} editor/>:section==='calendario'?<>{firebaseWorkspaceClient()!==null&&<p className="campaign-status-banner" role="status">No Firebase, a abertura das semanas fica no <a className="underline" href="/firebase-hub">HUB Temporal Firebase</a>: ele fecha a semana atual, abre a próxima e entrega as missivas programadas.</p>}<NarratorCalendar/></>:section==='dossies'?<SpyNarratorDossiers/>:section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub/>:section==='eventos'?<GmEventos/>:section==='aventuras'?<GmAventuras/>:conselho}</div></div>:conselho}
  </CampaignShell>;
}
