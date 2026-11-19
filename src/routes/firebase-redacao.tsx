import {createFileRoute} from '@tanstack/react-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CampaignShell} from '@/components/campaign-shell';
import {FirebaseEditorialDesk} from '@/components/newspaper/FirebaseEditorialDesk';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Session={authenticated:boolean;profile:string};
type EditorialStatus={enabled:boolean;canPublish:boolean;readOnly:boolean};
export const Route=createFileRoute('/firebase-redacao')({
  component:FirebaseRealEditorialRoute,
  head:()=>({meta:[{title:'Redação Firebase — A Folha Sem Selo'}]}),
});

/**
 * Operational Firebase editorial adapter is an independent route, leaving the
 * full original NewspaperHub and its nine editorial tabs byte-identical.
 * All actions are enforced by existing Firebase server transaction gates.
 */
function FirebaseRealEditorialRoute(){
  const [allowed,setAllowed]=useState(false);
  const [available,setAvailable]=useState(false);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState('');
  const generation=useRef(0);
  const verify=useCallback(async()=>{
    const index=++generation.current;
    setBusy(true);setAllowed(false);setAvailable(false);setMessage('');
    try{
      const auth=firebasePilotAuth();
      const token=await auth?.getToken();
      const uid=auth?.current()?.uid;
      if(!token||!uid)throw Error('auth');
      const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
      const response=await fetch('/api/firebase-cloud-read',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers,body:JSON.stringify({action:'session'}),
      });
      if(!response.ok)throw Error('scope');
      const json:unknown=await response.json();
      const session=json&&typeof json==='object'&&'result' in json
        ?(json as {result:Session}).result:null;
      if(session?.authenticated!==true||
         !['editor','narrador'].includes(session.profile)||
         auth?.current()?.uid!==uid)throw Error('scope');
      if(index!==generation.current)return;
      setAllowed(true);
      const readiness=await fetch('/api/firebase-cloud-newspaper',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers,body:JSON.stringify({action:'status'}),
      });
      if(!readiness.ok)throw Error('not_ready');
      const statusJson:unknown=await readiness.json();
      const status=statusJson&&typeof statusJson==='object'&&'result' in statusJson
        ?(statusJson as {result:EditorialStatus}).result:null;
      if(status?.enabled!==true||status.canPublish!==true)
        throw Error('not_ready');
      if(auth?.current()?.uid!==uid)throw Error('scope');
      if(index===generation.current)setAvailable(true);
    }catch{
      if(index===generation.current)setMessage('A redação Firebase ainda não está habilitada nesta conta ou nesta rodada. As edições históricas permanecem preservadas para consulta.');
    }finally{if(index===generation.current)setBusy(false);}
  },[]);
  useEffect(()=>{
    void verify();
    const auth=firebasePilotAuth();
    const unsubscribe=auth?.subscribe(next=>{
      if(!next){generation.current++;setAvailable(false);setAllowed(false);
        setMessage('Sessão encerrada. Faça login novamente.');}
    });
    const onFocus=()=>{void verify();};
    window.addEventListener('focus',onFocus);
    return()=>{generation.current++;unsubscribe?.();window.removeEventListener('focus',onFocus);};
  },[verify]);
  return <CampaignShell>
    <header className="campaign-heading">
      <div>
        <p className="campaign-eyebrow">A FOLHA SEM SELO · FIREBASE</p>
        <h1>Redação operacional</h1>
        <p>Editor e Narrador autorizados. Histórico importado preservado e
          publicado somente após aprovação dos controles Firebase.</p>
      </div>
      <div className="campaign-actions">
        <a className="underline" href="/firebase-acervo">Consultar edições originais</a>
        <a className="underline" href="/firebase-access">Voltar ao Conselho</a>
      </div>
    </header>
    {busy&&<p role="status">Validando seu perfil e a disponibilidade editorial…</p>}
    {!busy&&!available&&<section role="alert" className="campaign-status-banner">
      {message}
      <button type="button" className="ml-2 underline" onClick={()=>void verify()}>
        Verificar novamente
      </button>
    </section>}
    {!busy&&allowed&&available&&
      <FirebaseEditorialDesk onChanged={()=>{}}/>}
  </CampaignShell>;
}
