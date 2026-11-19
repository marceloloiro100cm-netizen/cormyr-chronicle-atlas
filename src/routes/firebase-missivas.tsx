import {createFileRoute} from '@tanstack/react-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CampaignShell} from '@/components/campaign-shell';
import {FirebaseOriginalMissivas} from '@/components/players/FirebaseOriginalMissivas';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Role='narrador'|'jogador';
type Session={authenticated:boolean;profile:string;memberHouseIds:string[]};
export const Route=createFileRoute('/firebase-missivas')({
  component:FirebaseOriginalMailRoute,
  head:()=>({meta:[{title:'Missivas do acervo real — Cormyr'}]}),
});

/**
 * Separate, authenticated Firebase-only destination for real historical mail.
 * Preserves ALL original Council JSX bytes under its parity lock. This route
 * is read-only until real live writes have been reconciled and accepted.
 */
function FirebaseOriginalMailRoute(){
  const [role,setRole]=useState<Role|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const generation=useRef(0);
  const verify=useCallback(async()=>{
    const id=++generation.current;
    const auth=firebasePilotAuth();
    setRole(null);setLoading(true);setMessage('');
    try{
      if(!auth)throw Error('Firebase não configurado neste ambiente.');
      const token=await auth.getToken();
      const uid=auth.current()?.uid;
      if(!token||!uid)throw Error('Entre pelo portal Firebase para consultar as missivas.');
      const response=await fetch('/api/firebase-cloud-read',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'session'}),
      });
      if(!response.ok)throw Error('Acesso ao acervo ainda não autorizado nesta conta.');
      const payload:unknown=await response.json();
      const raw=(payload&&typeof payload==='object'&&'result' in payload
        ?(payload as {result:Session}).result:null);
      if(!raw||raw.authenticated!==true||
         (raw.profile!=='jogador'&&raw.profile!=='narrador')||
         !Array.isArray(raw.memberHouseIds)||
         auth.current()?.uid!==uid)throw Error('Perfil ou sessão não confirmado pelo Firebase.');
      if(id===generation.current)setRole(raw.profile);
    }catch{
      if(id===generation.current)
        setMessage('As missivas reais não puderam ser abertas. Confira a sessão Firebase e as permissões da campanha.');
    }finally{
      if(id===generation.current)setLoading(false);
    }
  },[]);
  useEffect(()=>{
    void verify();
    const auth=firebasePilotAuth();
    let observedUid=auth?.current()?.uid??null;
    const stop=auth?.subscribe(next=>{
      if(!next||(observedUid!==null&&next.uid!==observedUid)){
        generation.current++;setRole(null);
        setMessage('A sessão Firebase mudou. Verifique seu acesso novamente.');
      }
      observedUid=next?.uid??null;
    });
    // Original mail queries independently recheck the live Firebase scope
    // on focus. Do not destroy filter state simply by changing tabs.
    return()=>{generation.current++;stop?.();};
  },[verify]);
  return <CampaignShell>
    <header className="campaign-heading">
      <div>
        <p className="campaign-eyebrow">SEGUNDA TEMPORADA · FIREBASE</p>
        <h1>Missivas do acervo original</h1>
        <p>Cartas e respostas reais, sob os filtros históricos do Conselho.</p>
      </div>
      <div className="campaign-actions">
        <a className="underline" href="/firebase-acervo">Ver demais módulos</a>
        <a className="underline" href="/firebase-access">Voltar ao Conselho</a>
      </div>
    </header>
    {loading&&<p role="status">Confirmando acesso no Firebase…</p>}
    {!loading&&message&&<div role="alert" className="campaign-status-banner">
      {message}
      <button type="button" className="ml-2 underline" onClick={()=>void verify()}>
        Verificar novamente
      </button>
    </div>}
    {!loading&&role&&<FirebaseOriginalMissivas profile={role}/>}
  </CampaignShell>;
}
