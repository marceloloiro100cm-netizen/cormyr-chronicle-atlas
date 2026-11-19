import {createFileRoute} from '@tanstack/react-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CampaignShell} from '@/components/campaign-shell';
import {FirebaseNarratorWeekDraft} from '@/components/calendar/FirebaseNarratorWeekDraft';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Session={authenticated:boolean;profile:string;memberHouseIds:string[]};
export const Route=createFileRoute('/firebase-hub')({
  component:FirebaseNarratorHubRoute,
  head:()=>({meta:[{title:'HUB Temporal do Narrador — Cormyr'}]}),
});

/**
 * Dedicated real Firebase narrator week draft and explicit publication UI.
 * The immutable original Narrator Calendar remains unchanged. No automatic
 * writes: save and publish require separate, deliberate Narrator actions.
 */
function FirebaseNarratorHubRoute(){
  const [approved,setApproved]=useState(false);
  const [checking,setChecking]=useState(true);
  const [message,setMessage]=useState('');
  const sequence=useRef(0);
  const verify=useCallback(async()=>{
    const id=++sequence.current;
    const auth=firebasePilotAuth();
    setApproved(false);setChecking(true);setMessage('');
    try{
      if(!auth)throw Error('Firebase não configurado');
      const token=await auth.getToken();
      const uid=auth.current()?.uid;
      if(!token||!uid)throw Error('Sessão não encontrada');
      const response=await fetch('/api/firebase-cloud-read',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'session'}),
      });
      if(!response.ok)throw Error('Firebase negou o acesso');
      const body:unknown=await response.json();
      const session=body&&typeof body==='object'&&'result' in body
        ?(body as {result:Session}).result:null;
      if(session?.authenticated!==true||
         session.profile!=='narrador'||auth.current()?.uid!==uid)
        throw Error('Perfil de Narrador não confirmado');
      if(id===sequence.current)setApproved(true);
    }catch{
      if(id===sequence.current)
        setMessage('HUB protegido: entre com uma conta de Narrador autorizada e confirme as permissões do Firebase.');
    }finally{
      if(id===sequence.current)setChecking(false);
    }
  },[]);
  useEffect(()=>{
    void verify();
    const auth=firebasePilotAuth();
    let observedUid=auth?.current()?.uid??null;
    const unsubscribe=auth?.subscribe(next=>{
      if(!next||(observedUid!==null&&next.uid!==observedUid)){
        sequence.current++;setApproved(false);
        setMessage('A identidade Firebase mudou. Verifique o acesso ao HUB novamente.');
      }
      observedUid=next?.uid??null;
    });
    // Preserve unsaved calendar/round fields when returning to the tab.
    // Server-side Firebase Auth and optimistic versions still guard every write.
    return()=>{sequence.current++;unsubscribe?.();};
  },[verify]);
  return <CampaignShell>
    <header className="campaign-heading">
      <div>
        <p className="campaign-eyebrow">SEGUNDA TEMPORADA · NARRADOR</p>
        <h1>HUB Temporal · Firebase oficial</h1>
        <p>Configure e confira a semana do Reino no Firebase, sem alterar
          as telas históricas do Conselho.</p>
      </div>
      <div className="campaign-actions">
        <a href="/firebase-acervo" className="underline">Conferir acervo</a>
        <a href="/firebase-access" className="underline">Voltar ao Conselho</a>
      </div>
    </header>
    {checking&&<p role="status">Verificando as permissões do Narrador…</p>}
    {!checking&&!approved&&<div role="alert" className="campaign-status-banner">
      {message||'Acesso administrativo indisponível.'}
      <button type="button" className="ml-3 underline"
        onClick={()=>void verify()}>Verificar novamente</button>
    </div>}
    {!checking&&approved&&<FirebaseNarratorWeekDraft/>}
  </CampaignShell>;
}
