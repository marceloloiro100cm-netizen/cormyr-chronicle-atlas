import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState,type FormEvent} from 'react';
import {createFirebaseRestAuth,type FirebaseSession} from '@/integrations/auth/firebase-rest-auth';

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
  memberHouseIds:string[];readOnly:boolean;snapshotReconciliationPending:boolean};
type House={id:string;name:string;castle:string|null;crest:string|null};
type HouseView={id:string;name:string;castle:string|null;crest:string|null;
  state:Record<string,unknown>;version:number;readOnly:boolean};
type Calendar={year:number;month:number;day:number;festival:string|null;version:number};
let singleton:Auth|null=null;

function firebaseAuth():Auth|null{
  if(typeof window==='undefined')return null;
  const key=import.meta.env['VITE_FIREBASE_API_KEY'] as string|undefined;
  const project=import.meta.env['VITE_FIREBASE_PROJECT_ID'] as string|undefined;
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

async function readCloud<T>(action:'session'|'listHouses'|'getHouse'|'getCalendar',
  houseId?:string):Promise<T>{
  const token=await firebaseAuth()?.getToken();
  if(!token)throw Error('Entre novamente com sua conta Firebase.');
  const response=await fetch('/api/firebase-cloud-read',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action,...(houseId?{houseId}:{})}),
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

  async function load(){
    const profile=await readCloud<SessionView>('session');
    setView(profile);
    const [catalog,date]=await Promise.all([
      readCloud<House[]>('listHouses'),
      profile.profile==='editor'
        ?Promise.resolve(null):readCloud<Calendar>('getCalendar'),
    ]);
    setHouses(catalog);
    setCalendar(date);
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

  async function selectHouse(id:string){
    setBusy(true);setMessage('');setHouse(null);
    try{setHouse(await readCloud<HouseView>('getHouse',id));}
    catch(e){setMessage(e instanceof Error?e.message:'Falha na leitura da Casa.');}
    finally{setBusy(false);}
  }

  function signOut(){
    firebaseAuth()?.signOut();
    setView(null);setHouse(null);setHouses([]);setCalendar(null);setEmail('');
    setPassword('');setMessage('');
  }

  return <main className="mx-auto max-w-4xl p-6 space-y-5 text-foreground">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Cormyr — acesso Firebase</h1>
      <p className="text-sm">Prévia somente leitura. Sem Supabase. Os dados vêm de um
        snapshot privado e ainda não são atualizados em tempo real.</p>
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
    </section>}
    {message&&<p role="alert" className="text-sm">{message}</p>}
  </main>;
}
