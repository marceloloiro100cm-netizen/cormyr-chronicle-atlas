import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState,type FormEvent} from 'react';
import {createFirebaseRestAuth} from '@/integrations/auth/firebase-rest-auth';
import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';

/**
 * Firebase-only pilot: read-only, no Supabase, no emulator and no direct
 * browser access to private Firestore migration collections.
 */
export const Route=createFileRoute('/firebase-access')({
  ssr:false,
  component:FirebaseAccess,
  head:()=>({meta:[{title:'Acesso Firebase — Cormyr'}]}),
});

type Auth=ReturnType<typeof createFirebaseRestAuth>;
type SessionView={authenticated:boolean;profile:'jogador'|'narrador'|'editor';
  memberHouseIds:string[];editHouseIds:string[];mailWriteAvailable:boolean;
  readOnly:boolean;snapshotReconciliationPending:boolean};
type House={id:string;name:string;castle:string|null;crest:string|null};
type HouseView={id:string;name:string;castle:string|null;crest:string|null;
  state:Record<string,unknown>;version:number;readOnly:boolean};
type Calendar={year:number;month:number;day:number;festival:string|null;version:number};
type MailEntry={id:string;subject:string;content:string;senderName:string|null;
  recipientHouseId:string|null;createdAt:string;campaignDate:string|null};
type Inbox={items:MailEntry[];totalVisible:number;truncated:boolean};
type EditionSummary={id:string;title:string;subtitle:string;editionNo:number;
  publishedAt:string;campaignDate:string|null};
type Edition={id:string;title:string;subtitle:string;blocks:unknown[];editionNo:number};
type SpyAgent={id:string;codename:string;status:string;missionSuccesses:number};

let singleton:Auth|null=null;

function firebaseAuth():Auth|null{
  if(typeof window==='undefined')return null;
  // Firebase Web configuration is public by design; use the owner's project
  // identifiers without requiring any secret or Cloud Shell environment.
  const key=FIREBASE_PUBLIC_CONFIG.apiKey;
  const project=FIREBASE_PUBLIC_CONFIG.projectId;
  if(!key||project!=='cormyr')return null;
  if(singleton)return singleton;
  const storageKey='cormyr:firebase-cloud-pilot:refresh';
  let memory:string|null=null;
  singleton=createFirebaseRestAuth({
    apiKey:key,
    storage:{
      get(){try{return window.sessionStorage.getItem(storageKey);}catch{return memory;}},
      set(value){
        memory=value;
        try{
          if(value===null)window.sessionStorage.removeItem(storageKey);
          else window.sessionStorage.setItem(storageKey,value);
        }catch{/* Session remains tab-local in memory. */}
      },
    },
  });
  return singleton;
}

async function readCloud<T>(action:'session'|'listHouses'|'getHouse'|'getCalendar'|
  'listMailbox'|'listNewspaper'|'getNewspaper'|'listSpyAgents',
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

function FirebaseAccess(){
  const [configured]=useState(()=>firebaseAuth()!==null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [view,setView]=useState<SessionView|null>(null);
  const [houses,setHouses]=useState<House[]>([]);
  const [house,setHouse]=useState<HouseView|null>(null);
  const [calendar,setCalendar]=useState<Calendar|null>(null);
  const [inbox,setInbox]=useState<Inbox|null>(null);
  const [editions,setEditions]=useState<EditionSummary[]>([]);
  const [edition,setEdition]=useState<Edition|null>(null);
  const [agents,setAgents]=useState<SpyAgent[]|null>(null);
  const [mailOrigin,setMailOrigin]=useState('');
  const [mailRecipient,setMailRecipient]=useState('');
  const [mailSubject,setMailSubject]=useState('');
  const [mailContent,setMailContent]=useState('');
  const [lastMailKey,setLastMailKey]=useState<string|null>(null);

  async function load(){
    const profile=await readCloud<SessionView>('session');
    setView(profile);
    const [catalog,date,letters,papers]=await Promise.all([
      readCloud<House[]>('listHouses'),
      profile.profile==='editor'
        ?Promise.resolve(null):readCloud<Calendar>('getCalendar').catch(()=>null),
      profile.profile==='editor'
        ?Promise.resolve(null):readCloud<Inbox>('listMailbox').catch(()=>null),
      readCloud<{items:EditionSummary[]}>('listNewspaper').catch(()=>null),
    ]);
    setHouses(catalog);
    setCalendar(date);
    setInbox(letters);
    setEditions(papers?.items??[]);
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
    setBusy(true);setMessage('');
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

  async function sendFirebaseMail(event:FormEvent){
    event.preventDefault();
    if(!view?.mailWriteAvailable||busy)return;
    if(!mailRecipient||!mailSubject.trim()||!mailContent.trim()){
      setMessage('Preencha o destinatário, assunto e conteúdo.');
      return;
    }
    if(view.profile==='jogador'&&!view.editHouseIds.includes(mailOrigin)){
      setMessage('Selecione uma Casa em que tenha permissão de escrita.');
      return;
    }
    const toNarrator=mailRecipient==='narrator';
    const auth=firebaseAuth();
    const token=await auth?.getToken();
    if(!token){setMessage('Sua sessão Firebase expirou. Entre novamente.');return;}
    setBusy(true);setMessage('');
    const key=lastMailKey??window.crypto.randomUUID();
    setLastMailKey(key);
    try{
      const res=await fetch('/api/firebase-cloud-mail',{
        method:'POST',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({
          action:'send',
          request:{
            requestKey:key,
            originHouseId:view.profile==='narrador'?null:mailOrigin,
            recipientHouseId:toNarrator?null:mailRecipient,
            toNarrator,subject:mailSubject,content:mailContent,
          },
        }),
      });
      if(!res.ok){
        throw Error(res.status===429?'Limite de envio atingido. Tente novamente depois.':
          res.status===409?'Esta chave de envio já pertence a outra mensagem.':
          res.status===403?'Você não tem permissão para enviar esta missiva.':
          'Envio Firebase indisponível. Nenhuma nova tentativa automática foi feita.');
      }
      setLastMailKey(null);setMailSubject('');setMailContent('');
      setMessage('Missiva registrada com sucesso no Firebase.');
      try{await load();}catch{/* A carta já foi confirmada pelo servidor. */}
    }catch(error){
      setMessage(error instanceof Error?error.message:'Não foi possível confirmar o envio.');
    }finally{setBusy(false);}
  }

  async function selectHouse(id:string){
    setBusy(true);setMessage('');setHouse(null);
    try{
      const [selected,spy]=await Promise.all([
        readCloud<HouseView>('getHouse',id),
        readCloud<{items:SpyAgent[]}>('listSpyAgents',id).catch(()=>null),
      ]);
      setHouse(selected);
      setAgents(spy?.items??null);
    }catch(e){setMessage(e instanceof Error?e.message:'Falha na leitura da Casa.');}
    finally{setBusy(false);}
  }

  async function openEdition(id:string){
    setBusy(true);setMessage('');setEdition(null);
    try{setEdition(await readCloud<Edition>('getNewspaper',undefined,id));}
    catch(e){setMessage(e instanceof Error?e.message:'Jornal indisponível.');}
    finally{setBusy(false);}
  }

  function signOut(){
    firebaseAuth()?.signOut();
    setView(null);setHouse(null);setHouses([]);setCalendar(null);
    setInbox(null);setEditions([]);setEdition(null);setAgents(null);setEmail('');
    setPassword('');setMessage('');
    setMailOrigin('');setMailRecipient('');setMailSubject('');
    setMailContent('');setLastMailKey(null);
  }

  return <main className="mx-auto max-w-4xl p-6 space-y-5 text-foreground">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Cormyr — acesso Firebase</h1>
      <p className="text-sm">Sem Supabase. {view?.mailWriteAvailable
        ?'Missivas operacionais habilitadas no Firebase; os demais módulos permanecem em leitura.'
        :'Prévia somente leitura de um snapshot privado, ainda não atualizado em tempo real.'}</p>
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
      {calendar&&<p>Calendário: {calendar.day}/{calendar.month+1}/{calendar.year}
        {calendar.festival?' · '+calendar.festival:''}
        {' '}· versão {calendar.version}</p>}
      {view.profile!=='editor'&&<div className="space-y-2">
        <label className="block text-sm">Consultar Casa autorizada</label>
        <select className="max-w-md rounded border p-2" value={house?.id??''}
          disabled={busy} onChange={e=>{if(e.target.value)void selectHouse(e.target.value);}}>
          <option value="">Escolha uma Casa</option>
          {houses.filter(h=>view.profile==='narrador'||
            view.memberHouseIds.includes(h.id)).map(h=>
              <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {house&&<article className="rounded border p-4 space-y-2">
          <h2 className="text-lg font-semibold">{house.name}</h2>
          <p>{house.castle??'Sem castelo cadastrado'} · Versão {house.version}</p>
          <details><summary className="cursor-pointer">Consultar ficha preservada</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(house.state,null,2)}
            </pre>
          </details>
        </article>}
      </div>}
      {agents&&house&&<section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Agentes da Casa</h2>
        {agents.length===0?<p>Não há agentes neste snapshot.</p>:
          <ul className="space-y-1">{agents.map(a=><li key={a.id}>
            {a.codename} — {a.status} · {a.missionSuccesses} sucessos
          </li>)}</ul>}
      </section>}
      {view.mailWriteAvailable&&view.profile!=='editor'&&<section
        className="rounded border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Escrever missiva</h2>
        <p className="text-xs">Envio registrado diretamente no Firebase.
          Não é possível editar ou cancelar uma carta já entregue.</p>
        <form onSubmit={sendFirebaseMail} className="space-y-3">
          {view.profile==='jogador'&&<label className="block text-sm">
            Casa remetente
            <select required value={mailOrigin} disabled={busy}
              onChange={e=>{setMailOrigin(e.target.value);setLastMailKey(null);}}
              className="block rounded border p-2 w-full">
              <option value="">Escolha sua Casa</option>
              {houses.filter(h=>view.editHouseIds.includes(h.id)).map(h=>
                <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>}
          <label className="block text-sm">Destinatário
            <select required value={mailRecipient} disabled={busy}
              onChange={e=>{setMailRecipient(e.target.value);setLastMailKey(null);}}
              className="block rounded border p-2 w-full">
              <option value="">Escolha o destinatário</option>
              {view.profile==='jogador'&&
                <option value="narrator">Narrador</option>}
              {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Assunto
            <input required maxLength={180} value={mailSubject} disabled={busy}
              onChange={e=>{setMailSubject(e.target.value);setLastMailKey(null);}}
              className="block w-full rounded border p-2"/>
          </label>
          <label className="block text-sm">Conteúdo da missiva
            <textarea required rows={5} maxLength={10000} value={mailContent}
              disabled={busy} onChange={e=>{
                setMailContent(e.target.value);setLastMailKey(null);
              }} className="block w-full rounded border p-2"/>
          </label>
          <button type="submit" disabled={busy}
            className="rounded border px-4 py-2">
            {busy?'Enviando…':'Enviar missiva'}
          </button>
        </form>
      </section>}
      {inbox&&<section className="rounded border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Missivas entregues</h2>
        <p className="text-xs">Exibindo {inbox.items.length} de {inbox.totalVisible}
          {inbox.truncated?' · Mais cartas disponíveis no acervo':''}</p>
        {inbox.items.map(m=><details key={m.id} className="border-t py-2">
          <summary className="cursor-pointer">{m.subject}
            {' '}· {m.campaignDate??m.createdAt.slice(0,10)}</summary>
          <p className="whitespace-pre-wrap text-sm">{m.content}</p>
        </details>)}
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
        {edition&&<article className="border-t pt-3">
          <h3 className="font-semibold">{edition.title}</h3>
          <p>{edition.subtitle}</p>
          <pre className="mt-2 text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(edition.blocks,null,2)}
          </pre>
        </article>}
      </section>
    </section>}
    {message&&<p role="alert" className="text-sm">{message}</p>}
  </main>;
}
