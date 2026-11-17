import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState,type FormEvent} from 'react';
import {runFirebaseRoleSelfAcceptance}
  from '@/lib/auth/firebase-role-self-acceptance';
import {firebasePilotAuth as firebaseAuth} from '@/lib/auth/firebase-pilot-session';
import {describeFirebasePilotSignals} from '@/lib/auth/firebase-pilot-readiness-ui';
import {GmEventos,GmAventuras} from '@/components/gm-panels';
import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';
import {FirebaseNewspaperReader} from '@/components/newspaper/FirebaseNewspaperReader';
import {FirebaseCalendarSnapshot} from '@/components/calendar/FirebaseCalendarSnapshot';
import {FirebaseHouseSheet} from '@/components/houses/FirebaseHouseSheet';
import {FirebaseArmyRoster} from '@/components/houses/FirebaseArmyRoster';
import {FirebaseHoldingsRoster} from '@/components/houses/FirebaseHoldingsRoster';
import {FirebaseConstructionSchedule} from '@/components/houses/FirebaseConstructionSchedule';
import {FirebaseConstructionQuote,type ConstructionQuoteView}
  from '@/components/houses/FirebaseConstructionQuote';
import {FirebaseHouseCourtDomains} from '@/components/houses/FirebaseHouseCourtDomains';
import {FirebaseHouseResources} from '@/components/houses/FirebaseHouseResources';
import {FirebaseHouseBalances} from '@/components/houses/FirebaseHouseBalances';
import {FirebaseOperationalEconomy,type OperationalEconomyView}
  from '@/components/houses/FirebaseOperationalEconomy';
import {FirebaseHouseChronicle} from '@/components/houses/FirebaseHouseChronicle';
import {FirebaseHouseReconciliationAudit} from '@/components/houses/FirebaseHouseReconciliationAudit';
import {FirebaseHouseReconciliationOverview}
  from '@/components/houses/FirebaseHouseReconciliationOverview';
import type {HouseReconciliationReport} from '@/lib/house/firebase-house-reconciliation-audit';

/**
 * Firebase-only pilot: read-only, no Supabase, no emulator and no direct
 * browser access to private Firestore migration collections.
 */
export const Route=createFileRoute('/firebase-access')({
  ssr:false,
  component:FirebaseAccess,
  head:()=>({meta:[{title:'Acesso Firebase — Cormyr'}]}),
});

type SessionView={authenticated:boolean;profile:'jogador'|'narrador'|'editor';
  memberHouseIds:string[];readOnly:boolean;snapshotReconciliationPending:boolean};
type House={id:string;name:string;castle:string|null;crest:string|null};
type HouseView={id:string;name:string;castle:string|null;crest:string|null;
  state:Record<string,unknown>;version:number;readOnly:boolean};
type Calendar={year:number;month:number;day:number;festival:string|null;version:number};
type MailEntry={id:string;source:'imported'|'firebase-cloud';subject:string;
  content:string;senderName:string|null;recipientHouseId:string|null;
  createdAt:string;campaignDate:string|null;canMarkRead:boolean;readAt:string|null;
  canReply:boolean};
type Inbox={items:MailEntry[];totalVisible:number;truncated:boolean};
type MailStatus={enabled:boolean;canSend:boolean;originHouseIds:string[];readOnly:boolean};
type MailReply={id:string;duplicate:boolean;state:string;deliveryRound:number};
type EditionSummary={id:string;title:string;subtitle:string;editionNo:number;
  publishedAt:string;campaignDate:string|null};
type Edition={id:string;title:string;subtitle:string;blocks:unknown[];editionNo:number;campaignDate?:string|null};
type PaperStatus={enabled:boolean;canPublish:boolean;readOnly:boolean};
type PaperReply={id:string;editionNo:number;duplicate:boolean;state:string};
type TreasuryStatus={enabled:boolean;canAdjust:boolean;readOnly:boolean;
  balance:number|null;version:number|null};
type TreasurySummary={available:boolean;readOnly:true;
  balance:number|null;version:number|null};
type TreasuryReply={id:string;duplicate:boolean;houseId:string;
  balance:number;version:number};
type SpyAgent={id:string;codename:string;status:string;missionSuccesses:number};
type BattleSummary={
  id:string;title:string;status:'active'|'completed'|'closed';
  stateVersion:number;attackerHouseId:string;defenderHouseId:string;
  createdAt:string|null;
};
type BattleOverview={houseId:string;items:BattleSummary[];
  totalVisible:number;truncated:boolean;readOnly:true;};
type SpyFinding={objective:'house_resources'|'army'|'possessions';
  subjectKey:string;valueSnapshot:Record<string,unknown>;
  discoveredDateKey:string|null;verifiedDateKey:string|null};
type SpyDossier={id:string;targetHouseId:string;findings:SpyFinding[]};
type SpyDossierCatalog={ownerHouseId:string;items:SpyDossier[];readOnly:boolean};
const spyCategory=(key:SpyFinding['objective'])=>
  key==='house_resources'?'Recursos':key==='army'?'Exército':'Posses';
function spyValue(value:unknown):string {
  if(value===null||value===undefined)return 'Não informado';
  if(typeof value==='string')return value.slice(0,2000);
  if(typeof value==='number'||typeof value==='boolean')return String(value);
  try{return JSON.stringify(value).slice(0,2000);}catch{return 'Registro não disponível';}
}

async function readCloud<T>(action:'session'|'listHouses'|'getHouse'|'getCalendar'|
  'listMailbox'|'listNewspaper'|'getNewspaper'|'listSpyAgents'|'listSpyDossiers'|'listHouseBattles',
  houseId?:string,editionId?:string):Promise<T>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-read',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action,...(houseId?{houseId}:{}),...(editionId?{editionId}:{})}),
  });
  if(!response.ok)throw Error(response.status===403
    ? 'Seu perfil não tem permissão para esta consulta.'
    :response.status===401?'Sua sessão não está ativa no Firebase.'
    :'Serviço Firebase indisponível ou ainda não liberado.');
  const body:unknown=await response.json();
  if(!body||typeof body!=='object'||!('result' in body))
    throw Error('Resposta inválida do serviço Firebase.');
  return (body as {result:T}).result;
}

async function cloudMail<T>(body:Record<string,unknown>):Promise<T>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-mail',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(body),
  });
  if(!response.ok)throw Error(
    response.status===409?'Essa chave já pertence a outra missiva.':
    response.status===403?'Seu perfil não está autorizado a enviar essa missiva.':
    response.status===429?'Limite de missivas desta rodada atingido.':
    'Envio Firebase ainda não liberado ou indisponível.'
  );
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||!('result' in raw))
    throw Error('Resposta inválida do serviço de missivas.');
  return (raw as {result:T}).result;
}

async function cloudPaper<T>(body:Record<string,unknown>):Promise<T>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-newspaper',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(body),
  });
  if(!response.ok)throw Error(response.status===409
    ?'Esta chave já foi usada para outra edição.'
    :response.status===403?'Seu perfil não tem permissão para publicar.'
    :'Publicação do jornal ainda não autorizada ou indisponível.');
  const bodyValue:unknown=await response.json();
  if(!bodyValue||typeof bodyValue!=='object'||!('result' in bodyValue))
    throw Error('Resposta inválida do serviço editorial.');
  return (bodyValue as {result:T}).result;
}

async function cloudTreasury<T>(input:Record<string,unknown>):Promise<T>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-treasury',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
  });
  if(!response.ok)throw Error(
    response.status===409
      ?'Versão de Tesouro desatualizada ou chave de lançamento já utilizada.'
      :response.status===403?'Somente o Narrador autorizado pode registrar esta operação.'
      :response.status===400?'Lançamento inválido: confira valor e justificativa.'
      :'Tesouro operacional não autorizado ou indisponível no Firebase.'
  );
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=='object'||!('result' in payload))
    throw Error('Resposta inválida do serviço de Tesouro.');
  return (payload as {result:T}).result;
}

async function cloudHouseReconciliation(houseId:string):Promise<HouseReconciliationReport>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-house-reconciliation-audit',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action:'inspect',houseId}),
  });
  if(!response.ok)throw Error('Diagnóstico de reconciliação indisponível.');
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||!('result' in raw))
    throw Error('Diagnóstico com resposta inválida.');
  return (raw as {result:HouseReconciliationReport}).result;
}

async function cloudOperationalEconomy(houseId:string):Promise<OperationalEconomyView>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-operational-economy',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action:'getHouse',houseId}),
  });
  if(!response.ok)throw Error('Economia operacional ainda não homologada.');
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||!('result' in raw))
    throw Error('Consulta operacional inválida.');
  return (raw as {result:OperationalEconomyView}).result;
}

async function cloudHouseQuote(input:Record<string,unknown>):Promise<ConstructionQuoteView>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-house-quote',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action:'quote',...input}),
  });
  if(!response.ok)throw Error(response.status===403
    ?'Seu perfil não pode consultar a ficha desta Casa.'
    :response.status===404?'Item, domínio ou posse não localizado.'
    :response.status===503?'Ficha ou simulador Firebase indisponível.'
    :'Dados inválidos para a simulação.');
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||!('result' in raw))
    throw Error('Simulação Firebase com resposta inválida.');
  return (raw as {result:ConstructionQuoteView}).result;
}

function FirebaseAccess(){
  const [configured]=useState(()=>firebaseAuth()!==null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [view,setView]=useState<SessionView|null>(null);
  const [narratorLibraryOpen,setNarratorLibraryOpen]=useState(false);
  const [roleCheck,setRoleCheck]=useState<
    Awaited<ReturnType<typeof runFirebaseRoleSelfAcceptance>>|null>(null);
  const [houses,setHouses]=useState<House[]>([]);
  const [house,setHouse]=useState<HouseView|null>(null);
  const [calendar,setCalendar]=useState<Calendar|null>(null);
  const [inbox,setInbox]=useState<Inbox|null>(null);
  const [editions,setEditions]=useState<EditionSummary[]>([]);
  const [edition,setEdition]=useState<Edition|null>(null);
  const [agents,setAgents]=useState<SpyAgent[]|null>(null);
  const [dossiers,setDossiers]=useState<SpyDossierCatalog|null>(null);
  const [battles,setBattles]=useState<BattleOverview|null>(null);
  const [mailStatus,setMailStatus]=useState<MailStatus|null>(null);
  const [paperStatus,setPaperStatus]=useState<PaperStatus|null>(null);
  const [paperTitle,setPaperTitle]=useState('');
  const [treasuryStatus,setTreasuryStatus]=useState<TreasuryStatus|null>(null);
  const [treasurySummary,setTreasurySummary]=useState<TreasurySummary|null>(null);
  const [operationalEconomy,setOperationalEconomy]=useState<OperationalEconomyView|null>(null);
  const [houseReconciliation,setHouseReconciliation]=useState<HouseReconciliationReport|null>(null);
  const [treasuryDelta,setTreasuryDelta]=useState('');
  const [treasuryReason,setTreasuryReason]=useState('');
  const [treasuryKey,setTreasuryKey]=useState<string|null>(null);
  const [paperSubtitle,setPaperSubtitle]=useState('');
  const [paperArticle,setPaperArticle]=useState('');
  const [paperKey,setPaperKey]=useState<string|null>(()=>{
    return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
      ?crypto.randomUUID():null;
  });
  const [originHouseId,setOriginHouseId]=useState('');
  const [mailRecipientKind,setMailRecipientKind]=useState<'house'|'narrator'>('house');
  const [mailRecipientHouse,setMailRecipientHouse]=useState('');
  const [mailSubject,setMailSubject]=useState('');
  const [mailContent,setMailContent]=useState('');
  const [replyLetter,setReplyLetter]=useState<MailEntry|null>(null);
  const [replyContent,setReplyContent]=useState('');
  const [replyKey,setReplyKey]=useState<string|null>(null);
  const [mailKey,setMailKey]=useState<string|null>(()=>
    typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
      ?crypto.randomUUID():null);

  async function load(){
    const profile=await readCloud<SessionView>('session');
    setView(profile);
    setNarratorLibraryOpen(false);
    const [catalog,date,letters,papers,mail,publishing]=await Promise.all([
      readCloud<House[]>('listHouses'),
      profile.profile==='editor'
        ?Promise.resolve(null):readCloud<Calendar>('getCalendar').catch(()=>null),
      profile.profile==='editor'
        ?Promise.resolve(null):readCloud<Inbox>('listMailbox').catch(()=>null),
      readCloud<{items:EditionSummary[]}>('listNewspaper').catch(()=>null),
      profile.profile==='editor'
        ?Promise.resolve(null):cloudMail<MailStatus>({action:'status'}).catch(()=>null),
      profile.profile==='jogador'
        ?Promise.resolve(null):cloudPaper<PaperStatus>({action:'status'}).catch(()=>null),
    ]);
    setHouses(catalog);
    setCalendar(date);
    setInbox(letters);
    setEditions(papers?.items??[]);
    setMailStatus(mail);
    setPaperStatus(publishing);
    setOriginHouseId(mail?.originHouseIds?.[0]??'');
    setMailRecipientKind('house');
    setMailRecipientHouse(catalog[0]?.id??'');
  }

  useEffect(()=>{
    let current=true;
    void firebaseAuth()?.getToken().then(async token=>{
      if(!token||!current)return;
      try{await load();}catch{
        if(current){firebaseAuth()?.signOut();setView(null);}
      }
    });
    return ()=>{current=false;};
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    setBusy(true);setMessage('');setRoleCheck(null);
    try{
      const auth=firebaseAuth();
      if(!auth)throw Error('Configuração Firebase indisponível.');
      await auth.signInWithPassword(email,password);
      setPassword('');
      await load();
    }catch{
      firebaseAuth()?.signOut();
      setView(null);
      setMessage('Não foi possível autorizar este acesso no Firebase. Confira sua conta e as permissões.');
    }finally{setBusy(false);}
  }

  async function checkOwnRole(){
    if(!view)return;
    setBusy(true);setRoleCheck(null);
    try{
      const token=await firebaseAuth()?.getToken();
      if(!token)throw Error('Sessão Firebase indisponível.');
      const report=await runFirebaseRoleSelfAcceptance({
        token,session:view,houses,
      });
      setRoleCheck(report);
    }catch{
      setRoleCheck({passed:false,scope:view.profile,checks:[
        {label:'Verificação indisponível',passed:false,httpStatus:null},
      ]});
    }finally{setBusy(false);}
  }

  async function selectHouse(id:string){
    setBusy(true);setMessage('');setHouse(null);
    setAgents(null);setDossiers(null);setBattles(null);
    setTreasuryStatus(null);setTreasurySummary(null);
    setOperationalEconomy(null);setHouseReconciliation(null);
    setTreasuryDelta('');setTreasuryReason('');
    setTreasuryKey(typeof crypto!=='undefined'&&
      typeof crypto.randomUUID==='function'?crypto.randomUUID():null);
    try{
      const [selected,spy,intelligence,treasury,summary,operational,audit,battleList]=await Promise.all([
        readCloud<HouseView>('getHouse',id),
        readCloud<{items:SpyAgent[]}>('listSpyAgents',id).catch(()=>null),
        readCloud<SpyDossierCatalog>('listSpyDossiers',id).catch(()=>null),
        view?.profile==='narrador'
          ?cloudTreasury<TreasuryStatus>({action:'status',houseId:id}).catch(()=>null)
          :Promise.resolve(null),
        view?.profile==='jogador'
          ?cloudTreasury<TreasurySummary>({action:'summary',houseId:id}).catch(()=>null)
          :Promise.resolve(null),
        view?.profile==='editor'?Promise.resolve(null)
          :cloudOperationalEconomy(id).catch(()=>null),
        view?.profile==='narrador'
          ?cloudHouseReconciliation(id).catch(()=>null):Promise.resolve(null),
        view?.profile==='editor'?Promise.resolve(null)
          :readCloud<BattleOverview>('listHouseBattles',id).catch(()=>null),
      ]);
      setHouse(selected);
      setAgents(spy?.items??null);
      setDossiers(intelligence);
      setBattles(battleList?.houseId===selected.id?battleList:null);
      setTreasuryStatus(treasury);
      setTreasurySummary(summary);
      setOperationalEconomy(operational?.houseId===selected.id?operational:null);
      setHouseReconciliation(audit?.houseId===selected.id?audit:null);
    }catch(e){setMessage(e instanceof Error?e.message:'Falha na leitura da Casa.');}
    finally{setBusy(false);}
  }

  async function openEdition(id:string){
    setBusy(true);setMessage('');setEdition(null);
    try{setEdition(await readCloud<Edition>('getNewspaper',undefined,id));}
    catch(e){setMessage(e instanceof Error?e.message:'Jornal indisponível.');}
    finally{setBusy(false);}
  }

  async function markMailRead(item:MailEntry){
    if(busy||!item.canMarkRead||item.readAt)return;
    setBusy(true);setMessage('');
    try{
      await cloudMail<{recorded:boolean;readAt:string}>({
        action:'markRead',source:item.source,letterId:item.id,
      });
      const updated=await readCloud<Inbox>('listMailbox');
      setInbox(updated);
      setMessage('Leitura registrada no Firebase.');
    }catch{
      setMessage('Não foi possível registrar a leitura. A mensagem original foi preservada.');
    }finally{setBusy(false);}
  }

  async function sendReply(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!replyLetter?.canReply||!mailStatus?.canSend||!replyKey||
       !replyContent.trim())return;
    setBusy(true);setMessage('');
    try{
      const result=await cloudMail<MailReply>({
        action:'reply',requestKey:replyKey,letterId:replyLetter.id,
        content:replyContent,
      });
      setMessage(result.duplicate
        ?'Esta resposta já havia sido enviada.'
        :'Resposta enviada pelo Firebase.');
      setReplyLetter(null);setReplyContent('');setReplyKey(null);
      try{setInbox(await readCloud<Inbox>('listMailbox'));}
      catch{setMessage('Resposta enviada. Atualize a caixa postal para vê-la.');}
    }catch(e){
      // Preserve the same retry key and draft if the server is unavailable.
      setMessage(e instanceof Error?e.message:'Não foi possível responder.');
    }finally{setBusy(false);}
  }

  async function submitTreasury(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!house||view?.profile!=='narrador'||
       !treasuryStatus?.canAdjust||treasuryStatus.version===null||
       !treasuryKey)return;
    const delta=Number(treasuryDelta);
    if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>10000||
       !treasuryReason.trim())return;
    setBusy(true);setMessage('');
    try{
      const result=await cloudTreasury<TreasuryReply>({
        action:'adjust',houseId:house.id,requestKey:treasuryKey,
        expectedVersion:treasuryStatus.version,delta,reason:treasuryReason,
      });
      setTreasuryStatus({...treasuryStatus,balance:result.balance,
        version:result.version});
      setMessage(result.duplicate?'Lançamento já registrado.':
        'Lançamento registrado no Tesouro operacional Firebase.');
      setTreasuryDelta('');setTreasuryReason('');
      setTreasuryKey(typeof crypto!=='undefined'&&
        typeof crypto.randomUUID==='function'?crypto.randomUUID():null);
    }catch(e){
      // Preserve the request key and input to permit safe network retries.
      setMessage(e instanceof Error?e.message:'Falha no lançamento do Tesouro.');
    }finally{setBusy(false);}
  }

  async function sendMail(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!mailKey||!mailStatus?.canSend||!view)return;
    setBusy(true);setMessage('');
    try{
      const result=await cloudMail<MailReply>({
        action:'send',requestKey:mailKey,
        originHouseId:view.profile==='narrador'?null:originHouseId,
        recipientKind:mailRecipientKind,
        recipientHouseId:mailRecipientKind==='house'?mailRecipientHouse:null,
        subject:mailSubject,content:mailContent,
      });
      setMessage(result.duplicate
        ?'Esta missiva já havia sido enviada.'
        :'Missiva enviada pelo Firebase nesta rodada.');
      setMailSubject('');setMailContent('');
      setMailKey(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
        ?crypto.randomUUID():null);
      // Refresh failures must never turn a successful send into a
      // misleading failure (which could invite a duplicate new submission).
      try{
        const updated=await readCloud<Inbox>('listMailbox');
        setInbox(updated);
      }catch{
        setMessage('Missiva enviada. Atualize a caixa postal para vê-la.');
      }
    }catch(e){
      // Preserve the original idempotency key and draft on send failure.
      setMessage(e instanceof Error?e.message:'Não foi possível enviar.');
    }finally{setBusy(false);}
  }

  async function publishPaper(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!paperStatus?.canPublish||!paperKey||busy)return;
    setBusy(true);setMessage('');
    try{
      const result=await cloudPaper<PaperReply>({
        action:'publish',requestKey:paperKey,title:paperTitle,
        subtitle:paperSubtitle,article:paperArticle,
      });
      setMessage(result.duplicate
        ?`Edição ${result.editionNo} já estava publicada no Firebase.`
        :`Edição ${result.editionNo} publicada no Firebase.`);
      setPaperTitle('');setPaperSubtitle('');setPaperArticle('');
      setPaperKey(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
        ?crypto.randomUUID():null);
      try{
        const available=await readCloud<{items:EditionSummary[]}>('listNewspaper');
        setEditions(available.items);
      }catch{setMessage('Edição publicada. Atualize a lista para vê-la.');}
    }catch(e){
      // Preserve draft and request key on failure to avoid duplicate editions.
      setMessage(e instanceof Error?e.message:'Publicação não concluída.');
    }finally{setBusy(false);}
  }

  function signOut(){
    firebaseAuth()?.signOut();
    setView(null);setHouse(null);setHouseReconciliation(null);setRoleCheck(null);
    setNarratorLibraryOpen(false);
    setHouses([]);setCalendar(null);
    setInbox(null);setEditions([]);setEdition(null);setAgents(null);
    setDossiers(null);
    setMailStatus(null);setPaperStatus(null);setPaperTitle('');
    setPaperSubtitle('');setPaperArticle('');setOriginHouseId('');setMailRecipientKind('house');
    setMailRecipientHouse('');setMailSubject('');setMailContent('');setEmail('');
    setPassword('');setMessage('');setReplyLetter(null);
    setReplyContent('');setReplyKey(null);
    setTreasuryStatus(null);setTreasurySummary(null);
    setTreasuryDelta('');setTreasuryReason('');
    setTreasuryKey(null);
  }

  const pilotStatus=view?describeFirebasePilotSignals({
    profile:view.profile,sessionConfirmed:view.authenticated===true,
    snapshotReconciliationPending:view.snapshotReconciliationPending===true,
    roleSelfTestPassed:roleCheck?.passed===true,
    houseLoaded:house!==null,calendarLoaded:calendar!==null,
    mailboxLoaded:inbox!==null,mailCanSend:mailStatus?.canSend===true,
  }):null;

  return <main className="mx-auto max-w-4xl p-6 space-y-5 text-foreground">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Cormyr — acesso Firebase</h1>
      <p className="text-sm">Acesso exclusivamente Firebase.
        As fichas, o jornal e a espionagem usam dados preservados do snapshot.
        {mailStatus?.canSend
          ?' O envio de missivas foi autorizado para esta rodada.'
          :' A escrita permanece bloqueada até a homologação dos serviços Cloud.'}</p>
    </header>
    {!configured&&<p role="alert">A configuração pública do Firebase Auth ainda
      não foi disponibilizada neste ambiente.</p>}
    {configured&&!view&&<form onSubmit={submit} className="max-w-sm space-y-3">
      <label className="block text-sm">E-mail
        <input type="email" required autoComplete="email"
          className="block w-full rounded border p-2"
          value={email} onChange={e=>setEmail(e.target.value)}/>
      </label>
      <label className="block text-sm">Senha
        <input type="password" required minLength={6} autoComplete="current-password"
          className="block w-full rounded border p-2"
          value={password} onChange={e=>setPassword(e.target.value)}/>
      </label>
      <button type="submit" disabled={busy}
        className="rounded border px-4 py-2">{busy?'Verificando…':'Entrar com Firebase'}</button>
    </form>}
    {view&&<section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p>Perfil validado: <strong>{view.profile}</strong></p>
        <button type="button" className="rounded border px-3 py-1"
          onClick={signOut}>Sair</button>
      </div>
      {pilotStatus&&<section className="rounded border border-current/25 p-4 space-y-3"
        aria-label="Situação dos serviços desta sessão">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Situação do acesso</h2>
          <p className="text-sm">Homologação em andamento. Estes indicadores
            representam apenas as consultas realizadas nesta sessão; não
            autorizam a abertura geral da campanha.</p>
        </div>
        <ul className="space-y-2 text-sm">
          {pilotStatus.signals.map(signal=><li key={signal.key}
            className="border-t border-current/15 pt-2">
            <span className="font-medium">{signal.label}: </span>
            <span>{signal.status==='conferido'?'Conferido nesta sessão':
              signal.status==='nao-aplicavel'?'Não se aplica':'Pendente'}</span>
            <p className="text-xs opacity-75">{signal.detail}</p>
          </li>)}
        </ul>
        <p className="text-xs font-medium">A liberação dos jogadores depende de
          aceite real entre contas diferentes, reconciliação e persistência
          das ações. Nenhum resultado aqui habilita usuários.</p>
      </section>}
      <section className="rounded border border-current/25 p-3 space-y-2"
        aria-label="Teste de isolamento Firebase da conta atual">
        <h2 className="font-semibold">Homologação de acesso desta conta</h2>
        <p className="text-xs">Comprova respostas reais do Firebase, incluindo
          bloqueio anônimo e acesso ou recusa entre Casas. Não libera
          automaticamente outros jogadores ou a produção.</p>
        <button type="button" disabled={busy}
          className="rounded border px-3 py-1 text-sm"
          onClick={()=>void checkOwnRole()}>Testar permissões agora</button>
        {roleCheck&&<div role="status" className="text-sm space-y-1">
          <p><strong>{roleCheck.passed
            ?'Esta conta passou nos testes.'
            :'Acesso desta conta não homologado.'}</strong></p>
          <ul className="list-disc pl-5">
            {roleCheck.checks.map((check,index)=><li key={index}>
              {check.passed?'Aprovado':'Pendente'}: {check.label}
              {check.httpStatus!==null?' (HTTP '+check.httpStatus+')':''}
            </li>)}
          </ul>
          <p className="text-xs">O relatório fica somente nesta sessão,
            não grava tokens, UIDs ou conteúdo de outras Casas.</p>
        </div>}
      </section>
      {view.profile==='narrador'&&
        <section aria-label="Acervo reservado do Narrador"
          className="rounded border border-current/25 p-4 space-y-3">
          <h2 className="font-semibold">Eventos e aventuras do Narrador</h2>
          <p className="text-sm">Conteúdo privado do Firebase, liberado apenas
            após a revisão dos dados e autorização desta conta.</p>
          <button type="button" className="rounded border px-3 py-1 text-sm"
            aria-expanded={narratorLibraryOpen}
            onClick={()=>setNarratorLibraryOpen(v=>!v)}>
            {narratorLibraryOpen?'Fechar acervo':'Consultar acervo privado'}
          </button>
          {narratorLibraryOpen&&<div className="space-y-4">
            <GmEventos/>
            <GmAventuras/>
          </div>}
        </section>}
      {view.profile==='narrador'&&
        <FirebaseHouseReconciliationOverview houses={houses}
          inspect={cloudHouseReconciliation}
          onSelectHouse={id=>{void selectHouse(id);}}/>}
      {calendar&&<FirebaseCalendarSnapshot date={calendar}/>} 
      {view.profile!=='editor'&&<div className="space-y-2">
        <label className="block text-sm">Consultar Casa autorizada</label>
        <select className="max-w-md rounded border p-2" value={house?.id??''}
          disabled={busy} onChange={e=>{if(e.target.value)void selectHouse(e.target.value);}}>
          <option value="">Escolha uma Casa</option>
          {houses.filter(h=>view.profile==='narrador'||
            view.memberHouseIds.includes(h.id)).map(h=>
              <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {house&&<FirebaseHouseSheet sheet={house}/>}
        {house&&<FirebaseHouseResources houseName={house.name} state={house.state}/>}
        {house&&<FirebaseHouseBalances houseName={house.name} state={house.state}/>}
        {house&&<FirebaseOperationalEconomy houseName={house.name}
          houseId={house.id} data={operationalEconomy}/>}
        {house&&view.profile==='narrador'&&
          <FirebaseHouseReconciliationAudit houseId={house.id}
            report={houseReconciliation}/>}
        {house&&view.profile==='jogador'&&
          <section aria-label="Tesouro operacional da Casa"
            className="rounded border border-current/25 p-4 space-y-2">
            <h2 className="text-lg font-semibold">Tesouro operacional</h2>
            {treasurySummary?.available&&
             treasurySummary.balance!==null&&
             treasurySummary.version!==null
              ?<>
                <p>Saldo conciliado: <strong>
                  {treasurySummary.balance.toLocaleString('pt-BR')}
                </strong></p>
                <p className="text-sm">Versão operacional: {treasurySummary.version}</p>
                <p className="text-xs">
                  Consulta da sua Casa no Firebase, sem acesso a lançamentos.
                  O Tesouro do snapshot é preservado separadamente.
                </p>
              </>
              :<p className="text-sm">
                O saldo operacional ainda não foi homologado para consulta.
                O Tesouro histórico permanece disponível na ficha.
              </p>}
          </section>}
        {house&&view.profile==='narrador'&&
          <section className="rounded border border-current/25 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Tesouro operacional · Narrador</h2>
            <p className="text-xs">
              O Tesouro do snapshot histórico não é editado. O lançamento
              separado exige saldo inicial e versão reconciliados no Firebase.
              Não modifica Defesa, Influência, Terras, Lei, População, Poder,
              Riqueza ou construções.
            </p>
            {!treasuryStatus?.canAdjust||treasuryStatus.version===null
              ?<p className="text-sm">
                Alterações de Tesouro bloqueadas até homologação do Firebase Cloud.
              </p>
              :<>
                <p className="text-sm">
                  Saldo operacional registrado: <strong>
                    {treasuryStatus.balance?.toLocaleString('pt-BR')}
                  </strong> · Versão {treasuryStatus.version}
                </p>
                <form onSubmit={submitTreasury} className="space-y-2">
                  <label className="block text-sm">Variação do Tesouro
                    <input type="number" required step={1} min={-10000}
                      max={10000} value={treasuryDelta}
                      onChange={e=>setTreasuryDelta(e.target.value)}
                      className="mt-1 block w-full rounded border p-2"
                      placeholder="Ex.: -10 ou 20"/>
                  </label>
                  <label className="block text-sm">Justificativa
                    <textarea required rows={3} maxLength={500}
                      value={treasuryReason}
                      onChange={e=>setTreasuryReason(e.target.value)}
                      className="mt-1 block w-full rounded border p-2"/>
                  </label>
                  <button type="submit" className="rounded border px-4 py-2"
                    disabled={busy||!treasuryKey||!treasuryReason.trim()||
                      !Number.isSafeInteger(Number(treasuryDelta))||
                      !Number(treasuryDelta)||
                      Math.abs(Number(treasuryDelta))>10000}>
                    {busy?'Registrando…':'Registrar lançamento'}
                  </button>
                </form>
              </>}
          </section>}
        {house&&<FirebaseArmyRoster houseName={house.name} state={house.state}/>}
        {house&&<section aria-label="Batalhas registradas da Casa"
          className="rounded-lg border border-current/25 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Batalhas registradas</h2>
          {!battles?<p className="text-sm">
            Batalhas do Firebase ainda não disponíveis para consulta.
          </p>:battles.items.length===0?<p className="text-sm">
            Nenhuma batalha registrada para esta Casa.
          </p>:<ul className="space-y-2">
            {battles.items.map(b=><li key={b.id}
              className="rounded border border-current/20 p-3">
              <p className="font-semibold">{b.title}</p>
              <p className="text-sm opacity-75">
                {b.status==='active'?'Em andamento':
                  b.status==='completed'?'Concluída':'Encerrada'}
                {' '}· versão {b.stateVersion}
              </p>
            </li>)}
          </ul>}
          {battles?.truncated&&<p className="text-sm">
            Lista parcial: existem mais registros no histórico preservado.
          </p>}
          <p className="text-xs opacity-75">
            Apenas confrontos envolvendo esta Casa, sem ordens,
            replays ou ações de combate.
          </p>
        </section>}
        {house&&<FirebaseHoldingsRoster houseName={house.name} state={house.state}/>}
        {house&&<FirebaseConstructionSchedule houseName={house.name}
          state={house.state} calendar={calendar}/>}
        {house&&<FirebaseConstructionQuote
          key={house.id} houseId={house.id} state={house.state}
          onQuote={cloudHouseQuote}/>}

        {house&&<FirebaseHouseCourtDomains houseName={house.name} state={house.state}/>}
        {house&&<FirebaseHouseChronicle houseName={house.name} state={house.state}/>}
      </div>}
      {agents&&house&&<section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Agentes da Casa</h2>
        {agents.length===0?<p>Não há agentes neste snapshot.</p>:
          <ul className="space-y-1">{agents.map(a=><li key={a.id}>
            {a.codename} — {a.status} · {a.missionSuccesses} sucessos
          </li>)}</ul>}
      </section>}
      {dossiers&&house&&dossiers.ownerHouseId===house.id&&
        <section className="rounded border p-4 space-y-3">
          <h2 className="text-lg font-semibold">Dossiês de Espionagem</h2>
          <p className="text-xs">Apenas informações já descobertas pela
            Casa selecionada. Consulta preservada, sem novas missões.</p>
          {dossiers.items.length===0
            ?<p>Nenhum dossiê de inteligência registrado para esta Casa.</p>
            :<div className="space-y-2">{dossiers.items.map(d=>{
              const name=houses.find(h=>h.id===d.targetHouseId)?.name
                ??'Casa investigada';
              return <details key={d.id} className="rounded border p-3">
                <summary className="cursor-pointer font-semibold">
                  {name} — Segredos {d.findings.length}
                </summary>
                {d.findings.length===0
                  ?<p className="pt-2 text-sm">Ainda não há segredos descobertos.</p>
                  :<ul className="space-y-3 pt-3">{d.findings.map((finding,i)=>
                    <li key={finding.objective+':'+finding.subjectKey+':'+i}
                      className="border-t pt-2 text-sm">
                      <p className="font-semibold">
                        {spyCategory(finding.objective)} · {finding.subjectKey}
                      </p>
                      <dl className="mt-1 space-y-1">
                        {Object.entries(finding.valueSnapshot).map(([key,value])=>
                          <div key={key} className="break-words">
                            <dt className="inline font-medium">{key}: </dt>
                            <dd className="inline whitespace-pre-wrap">
                              {spyValue(value)}
                            </dd>
                          </div>)}
                      </dl>
                      {finding.verifiedDateKey&&
                        <p className="mt-2 text-xs">Última verificação:
                          {' '}{finding.verifiedDateKey}</p>}
                    </li>)}</ul>}
              </details>;
            })}</div>}
        </section>}
      {view.profile!=='editor'&&<section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Escrever missiva</h2>
        {!mailStatus?.canSend&&<p className="text-sm">
          O envio ficará disponível após a autorização do Firebase Cloud.
          Você ainda pode consultar as cartas preservadas.
        </p>}
        {mailStatus?.canSend&&<form onSubmit={sendMail} className="space-y-3">
          {view.profile==='jogador'&&<label className="block text-sm">
            Casa remetente
            <select required className="block w-full rounded border p-2"
              value={originHouseId}
              onChange={e=>setOriginHouseId(e.target.value)}>
              {houses.filter(h=>mailStatus.originHouseIds.includes(h.id))
                .map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>}
          <label className="block text-sm">Destino
            <select className="block w-full rounded border p-2"
              value={mailRecipientKind}
              onChange={e=>setMailRecipientKind(e.target.value as 'house'|'narrator')}>
              <option value="house">Outra Casa</option>
              {view.profile==='jogador'&&<option value="narrator">Narrador</option>}
            </select>
          </label>
          {mailRecipientKind==='house'&&<label className="block text-sm">Casa destinatária
            <select className="block w-full rounded border p-2" required
              value={mailRecipientHouse}
              onChange={e=>setMailRecipientHouse(e.target.value)}>
              {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>}
          <label className="block text-sm">Assunto
            <input className="block w-full rounded border p-2" required
              maxLength={180} value={mailSubject}
              onChange={e=>setMailSubject(e.target.value)}/>
          </label>
          <label className="block text-sm">Texto da missiva
            <textarea rows={6} className="block w-full rounded border p-2" required
              maxLength={18000} value={mailContent}
              onChange={e=>setMailContent(e.target.value)}/>
          </label>
          <button type="submit" className="rounded border px-4 py-2"
            disabled={busy||!mailKey||!mailSubject.trim()||!mailContent.trim()||
              (view.profile==='jogador'&&!originHouseId)||
              (mailRecipientKind==='house'&&!mailRecipientHouse)}>
            {busy?'Enviando…':'Enviar missiva'}
          </button>
        </form>}
      </section>}
      {inbox&&<section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Missivas entregues</h2>
        <p className="text-xs">Exibindo {inbox.items.length} de {inbox.totalVisible}
          {inbox.truncated?' · Mais cartas disponíveis no acervo':''}</p>
        {inbox.items.map(m=><details key={m.source+':'+m.id}
          className="border-t py-2">
          <summary className="cursor-pointer">
            {m.canMarkRead&&!m.readAt&&<span className="mr-2 font-semibold">
              Nova
            </span>}
            {m.subject}{' '}· {m.campaignDate??m.createdAt.slice(0,10)}
          </summary>
          <p className="whitespace-pre-wrap text-sm">{m.content}</p>
          {m.canReply&&mailStatus?.canSend&&
            <button type="button" disabled={busy}
              className="mt-2 rounded border px-3 py-1 text-sm"
              onClick={()=>{
                setReplyLetter(m);setReplyContent('');setMessage('');
                setReplyKey(typeof crypto!=='undefined'&&
                  typeof crypto.randomUUID==='function'?crypto.randomUUID():null);
              }}>
              Responder
            </button>}
          {m.canMarkRead&&<div className="mt-2">
            {m.readAt?<p className="text-xs">Lida em {new Date(m.readAt).toLocaleString('pt-BR')}</p>:
              <button type="button" className="rounded border px-3 py-1 text-sm"
                disabled={busy} onClick={()=>void markMailRead(m)}>
                Marcar como lida
              </button>}
          </div>}
        </details>)}
        {replyLetter&&replyLetter.canReply&&mailStatus?.canSend&&
          <form onSubmit={sendReply} className="space-y-3 border-t pt-3">
            <h3 className="font-semibold">Responder: {replyLetter.subject}</h3>
            <p className="text-xs">Destino definido pelo Firebase a partir da missiva original.</p>
            <label className="block text-sm">Texto da resposta
              <textarea rows={5} required maxLength={18000}
                className="block w-full rounded border p-2"
                value={replyContent}
                onChange={e=>setReplyContent(e.target.value)}/>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="rounded border px-4 py-2"
                disabled={busy||!replyKey||!replyContent.trim()}>
                {busy?'Respondendo…':'Enviar resposta'}
              </button>
              <button type="button" className="rounded border px-4 py-2"
                disabled={busy}
                onClick={()=>{setReplyLetter(null);setReplyContent('');setReplyKey(null);}}>
                Cancelar
              </button>
            </div>
          </form>}
      </section>}
      <section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">A Folha Sem Selo</h2>
        {editions.length===0?<p>Nenhuma edição publicada disponível.</p>:
          <ul>{editions.map(e=><li key={e.id} className="py-1">
            <button type="button" disabled={busy}
              className="underline text-left" onClick={()=>void openEdition(e.id)}>
              Edição {e.editionNo} — {e.title}
            </button>
          </li>)}</ul>}
        {edition&&<div className="border-t pt-4">
          <FirebaseNewspaperReader edition={edition}/>
        </div>}
      </section>
      {(view.profile==='editor'||view.profile==='narrador')&&
        <section className="rounded border p-4 space-y-3">
          <h2 className="text-lg font-semibold">Publicar A Folha Sem Selo</h2>
          {!paperStatus?.canPublish
            ?<p className="text-sm">Publicação de novas edições bloqueada até a
              aprovação editorial e a reconciliação do Firebase Cloud.</p>
            :<form onSubmit={publishPaper} className="space-y-3">
              <label className="block text-sm">Título da edição
                <input required maxLength={180} value={paperTitle}
                  onChange={e=>setPaperTitle(e.target.value)}
                  className="mt-1 block w-full rounded border p-2"/>
              </label>
              <label className="block text-sm">Subtítulo
                <input maxLength={280} value={paperSubtitle}
                  onChange={e=>setPaperSubtitle(e.target.value)}
                  className="mt-1 block w-full rounded border p-2"/>
              </label>
              <label className="block text-sm">Artigo principal
                <textarea required rows={8} maxLength={12000}
                  value={paperArticle} onChange={e=>setPaperArticle(e.target.value)}
                  className="mt-1 block w-full rounded border p-2"/>
              </label>
              <button type="submit" className="rounded border px-4 py-2"
                disabled={busy||!paperKey||!paperTitle.trim()||!paperArticle.trim()}>
                {busy?'Publicando…':'Publicar edição'}
              </button>
              <p className="text-xs">Publicação imediata e permanente.
                Esta primeira etapa usa artigo em texto simples, sem revisão
                de rascunhos nem anexos privados.</p>
            </form>}
        </section>}
    </section>}
    {message&&<p role="alert" className="text-sm">{message}</p>}
  </main>;
}
