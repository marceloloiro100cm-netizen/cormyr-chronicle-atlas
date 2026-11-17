import {createFileRoute} from '@tanstack/react-router';
import {useEffect,useState,type FormEvent} from 'react';
import {CampaignShell} from '@/components/campaign-shell';
import {Button} from '@/components/ui/button';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

const RESET_CODE=/^[A-Za-z0-9_-]{8,4096}$/;

export const Route=createFileRoute('/reset-password')({
  head:()=>({meta:[
    {title:'Redefinir senha Firebase — Cormyr Chronicle'},
    {name:'description',content:'Recuperação segura da conta Firebase.'},
    {name:'referrer',content:'no-referrer'},
    {property:'og:title',content:'Redefinir senha — Cormyr Chronicle'},
    {property:'og:description',content:'Defina uma nova senha para sua conta Firebase.'},
    {property:'og:type',content:'website'},
    {name:'twitter:card',content:'summary'},
  ]}),
  component:Reset,
});

function Reset(){
  const [checked,setChecked]=useState(false);
  const [resetCode,setResetCode]=useState<string|null>(null);
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [message,setMessage]=useState('');
  const [success,setSuccess]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    // Firebase action URLs use mode=resetPassword and one-time oobCode.
    // Supabase recovery fragments are deliberately not accepted.
    const params=new URLSearchParams(window.location.search);
    const code=params.get('oobCode');
    if(params.get('mode')==='resetPassword'&&code&&RESET_CODE.test(code))
      setResetCode(code);
    // Remove one-time codes and all other query/fragment parameters from
    // address bar/history; never put them in app logs or navigation URLs.
    try{
      window.history.replaceState(window.history.state,'',window.location.pathname);
    }catch{/* The form still works if history is restricted. */}
    setChecked(true);
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    if(busy||!resetCode)return;
    if(password!==confirmPassword){
      setMessage('As senhas não coincidem.');return;
    }
    setBusy(true);setMessage('');
    try{
      const auth=firebasePilotAuth();
      if(!auth)throw Error('firebase_not_available');
      await auth.confirmPasswordReset(resetCode,password);
      auth.signOut();
      setPassword('');setConfirmPassword('');
      setResetCode(null);setSuccess(true);
      setMessage('Senha redefinida. Entre novamente com sua conta Firebase.');
    }catch{
      // No provider error details or reset codes in the user-facing response.
      setMessage('Não foi possível redefinir a senha. Solicite um novo link de recuperação.');
    }finally{setBusy(false);}
  }

  return <CampaignShell publicTime>
    <h1>Redefinir senha Firebase</h1>
    {!checked&&<p role="status">Verificando o link de recuperação…</p>}
    {checked&&!resetCode&&!success&&<p role="status">
      Abra o link de recuperação enviado pelo Firebase para definir sua senha.
      Se o link expirou, peça outro pela página de entrada.
    </p>}
    {checked&&resetCode&&<form className="campaign-form campaign-auth" onSubmit={submit}>
      <label>Nova senha
        <input required type="password" minLength={8} maxLength={128}
          autoComplete="new-password" value={password}
          onChange={e=>setPassword(e.target.value)}/>
      </label>
      <label>Confirmar nova senha
        <input required type="password" minLength={8} maxLength={128}
          autoComplete="new-password" value={confirmPassword}
          onChange={e=>setConfirmPassword(e.target.value)}/>
      </label>
      <Button disabled={busy} type="submit">{busy?'Salvando…':'Salvar senha'}</Button>
    </form>}
    {message&&<p role="status">{message}</p>}
    {success&&<p><a href="/auth">Entrar no Atlas com Firebase</a></p>}
  </CampaignShell>;
}
