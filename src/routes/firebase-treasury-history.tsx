import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {createFirebaseRestAuth} from '@/integrations/auth/firebase-rest-auth';
import {FIREBASE_PUBLIC_CONFIG} from '@/integrations/firebase/public-config';

/** Separate Firebase-only view. The JWT is never placed in a URL, local
 * storage, hidden input or a public Firestore client.
 */
export const Route=createFileRoute('/firebase-treasury-history')({
  ssr:false,component:FirebaseTreasuryHistory,
  head:()=>({meta:[{title:'Histórico de Tesouro — Cormyr'}]}),
});
type Profile='narrador'|'jogador'|'editor';
type Session={authenticated:boolean;profile:Profile;memberHouseIds:string[]};
type House={id:string;name:string};
type Event={
  version:number;delta:number;before:number;after:number;
  campaignDate:string;createdAt:string;
  reason?:string;actorUid?:string;
};
type History={
  houseId:string;balance:number;version:number;total:number;
  truncated:boolean;verifiedChain:boolean;readOnly:boolean;
  items:Event[];
};
let client:ReturnType<typeof createFirebaseRestAuth>|null=null;
function firebase(){
  if(typeof window==='undefined'||!FIREBASE_PUBLIC_CONFIG.apiKey||
     FIREBASE_PUBLIC_CONFIG.projectId!=='cormyr')return null;
  if(client)return client;
  let memory:string|null=null;
  const key='cormyr:firebase-cloud-pilot:refresh';
  client=createFirebaseRestAuth({
    apiKey:FIREBASE_PUBLIC_CONFIG.apiKey,
    storage:{
      get(){try{return sessionStorage.getItem(key);}catch{return memory;}},
      set(v){memory=v;try{
        if(v===null)sessionStorage.removeItem(key);
        else sessionStorage.setItem(key,v);
      }catch{/* tab-scoped memory only */}},
    },
  });
  return client;
}
async function request<T>(path:string,body:Record<string,unknown>):Promise<T>{
  const jwt=await firebase()?.getToken();
  if(!jwt)throw Error('Acesse sua conta pela página principal do Firebase.');
  const res=await fetch(path,{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt}`},
    body:JSON.stringify(body),
  });
  if(!res.ok)throw Error(res.status===401
    ?'Sua sessão Firebase expirou; entre novamente.':
    res.status===403?'Sua Casa não tem acesso a este histórico.':
    res.status===503?'Histórico ainda não homologado ou indisponível.':
    'Não foi possível consultar o histórico.');
  const raw:unknown=await res.json();
  if(!raw||typeof raw!=='object'||!('result' in raw))
    throw Error('Resposta inválida do Firebase.');
  return (raw as {result:T}).result;
}
const number=(value:number)=>value.toLocaleString('pt-BR');
function FirebaseTreasuryHistory(){
  const [session,setSession]=useState<Session|null>(null);
  const [houses,setHouses]=useState<House[]>([]);
  const [houseId,setHouseId]=useState('');
  const [history,setHistory]=useState<History|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const [current,available]=await Promise.all([
          request<Session>('/api/firebase-cloud-read',{action:'session'}),
          request<House[]>('/api/firebase-cloud-read',{action:'listHouses'}),
        ]);
        if(!active)return;
        setSession(current);
        setHouses(available.filter(h=>current.profile==='narrador'||
          current.memberHouseIds.includes(h.id)));
      }catch(e){if(active)setError(e instanceof Error?e.message:'Falha ao carregar.');}
    })();
    return()=>{active=false;};
  },[]);
  async function load(id:string){
    setHouseId(id);setHistory(null);setError('');
    if(!id)return;
    setBusy(true);
    try{
      const result=await request<History>('/api/firebase-treasury-audit',{
        action:'history',houseId:id,
      });
      if(result.houseId!==id||!result.verifiedChain||!result.readOnly)
        throw Error('Histórico não pôde ser verificado.');
      setHistory(result);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao consultar o Tesouro.');}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl p-6 space-y-5 text-foreground">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">Cormyr · Histórico de Tesouro</h1>
      <p className="text-sm">Somente leitura, com conferência da cadeia de
        lançamentos no Firebase. Não altera fichas ou saldos.</p>
      <a className="underline text-sm" href="/firebase-access">
        Voltar ao acesso Firebase
      </a>
    </header>
    {session&&session.profile==='editor'&&
      <p role="alert">O perfil editorial não tem acesso ao Tesouro.</p>}
    {session&&session.profile!=='editor'&&
      <section className="space-y-3">
        <label className="block text-sm">Casa autorizada
          <select value={houseId} disabled={busy}
            onChange={e=>{void load(e.target.value);}}
            className="mt-1 block w-full max-w-md rounded border p-2">
            <option value="">Selecione uma Casa</option>
            {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      </section>}
    {busy&&<p role="status">Consultando registros verificados…</p>}
    {error&&<p role="alert">{error}</p>}
    {history&&<section className="rounded border p-4 space-y-3">
      <h2 className="text-lg font-semibold">Lançamentos auditados</h2>
      <p className="text-sm">
        Saldo operacional: <strong>{number(history.balance)}</strong>
        {' '}· Versão {history.version} · {history.total} lançamentos conferidos
      </p>
      {history.truncated&&<p className="text-xs">
        Exibindo os últimos 50 lançamentos. Toda a sequência foi verificada.
      </p>}
      {!history.items.length?<p>Nenhum lançamento registrado neste Tesouro.</p>:
        <ol className="space-y-2">
          {history.items.map(item=><li key={item.version}
            className="rounded border border-current/20 p-3 space-y-1 text-sm">
            <p className="font-semibold">
              Versão {item.version} · {item.campaignDate}
            </p>
            <p>
              {number(item.before)} {item.delta>0?'+':''}
              {number(item.delta)} = <strong>{number(item.after)}</strong>
            </p>
            {session?.profile==='narrador'&&item.reason&&
              <p className="break-words whitespace-pre-wrap">
                Justificativa: {item.reason}
              </p>}
            {session?.profile==='narrador'&&item.actorUid&&
              <p className="break-words">Responsável (UID): {item.actorUid}</p>}
          </li>)}
        </ol>}
      <p className="text-xs opacity-75">A consulta não permite editar,
        reverter, excluir ou criar lançamentos.</p>
    </section>}
  </main>;
}
