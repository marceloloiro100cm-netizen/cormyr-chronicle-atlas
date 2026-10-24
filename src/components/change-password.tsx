import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export function ChangePassword() {
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <details className="campaign-add"><summary>Alterar minha senha</summary><form className="campaign-form" onSubmit={async e=>{
    e.preventDefault();if(password!==confirmation){setMessage('As senhas não coincidem.');return;}setBusy(true);
    try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');setMessage('Senha alterada.');}
    catch(error){setMessage(error instanceof Error?error.message:'Não foi possível alterar a senha.');}finally{setBusy(false);}
  }}><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><Button disabled={busy}>Salvar senha</Button><p role="status">{message}</p></form></details>;
}