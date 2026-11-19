import {useState,type FormEvent} from 'react';
import {firebaseAccountRequest} from '@/lib/firebase-workspace/account-client';

export function FirebaseFirstAccessPassword({onDone,onSignOut}:{
 onDone:()=>void;onSignOut:()=>void;
}){
 const [password,setPassword]=useState('');
 const [confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [key]=useState(()=>globalThis.crypto?.randomUUID?.()??'');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy||!key)return;
  if(password!==confirmation){setMessage('As senhas não coincidem.');return;}
  setBusy(true);setMessage('');
  try{
    const result=await firebaseAccountRequest<{changed:boolean;loginRequired:boolean}>(
      'completePassword',{password,requestKey:key});
    setPassword('');setConfirmation('');
    if(!result.changed||!result.loginRequired)
      throw Error('Não foi possível confirmar a troca de senha.');
    onDone();
  }catch(e){
    setMessage(e instanceof Error?e.message:'Não foi possível trocar a senha.');
  }finally{setBusy(false);}
 }
 return <section aria-label="Troca obrigatória de senha Firebase"
   className="mx-auto max-w-xl rounded border p-6 space-y-3">
   <h1 className="text-xl font-semibold">Alterar senha para entrar no Conselho</h1>
   <p className="text-sm">
     A primeira senha precisa ser substituída. Até completar esta etapa,
     nenhum conteúdo privado da campanha fica acessível.
   </p>
   <form className="campaign-form" onSubmit={e=>void submit(e)}>
    <label>Nova senha<input type="password" autoComplete="new-password"
      minLength={10} maxLength={128} required disabled={busy}
      value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label>Confirmar senha<input type="password" autoComplete="new-password"
      required disabled={busy} value={confirmation}
      onChange={e=>setConfirmation(e.target.value)}/></label>
    <button className="rounded border px-4 py-2" disabled={busy||!key}>
      {busy?'Salvando…':'Alterar senha'}
    </button>
   </form>
   <button type="button" className="text-sm underline" onClick={onSignOut}>
     Sair
   </button>
   {message&&<p role="alert">{message}</p>}
 </section>;
}
