import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {CAMPAIGN_ACCESS_SCOPE_KEY} from '@/lib/auth/campaign-access-scope';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useServerFn } from '@tanstack/react-start';
import { completePasswordChange } from '@/lib/player-admin.functions';

function PasswordForm() {
  const change=useServerFn(completePasswordChange);
  const queryClient=useQueryClient();
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <form className="campaign-form" onSubmit={async e=>{
    e.preventDefault();if(password!==confirmation){setMessage('As senhas não coincidem.');return;}setBusy(true);
    try{await change({data:{password}});setPassword('');setConfirmation('');setMessage('Senha alterada.');
      await queryClient.invalidateQueries({queryKey:CAMPAIGN_ACCESS_SCOPE_KEY});
      await queryClient.invalidateQueries({queryKey:['campaign-panel']});}
    catch(error){setMessage(error instanceof Error?error.message:'Não foi possível alterar a senha.');}finally{setBusy(false);}
  }}><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><Button disabled={busy}>Salvar senha</Button><p role="status">{message}</p></form>;
}
export function ChangePassword() {
  return <details className="campaign-add"><summary>Alterar minha senha</summary><PasswordForm/></details>;
}
export function ChangePasswordButton() {
  return <Dialog><DialogTrigger asChild><Button variant="outline"><KeyRound size={16}/>Alterar senha</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Alterar minha senha</DialogTitle></DialogHeader><PasswordForm/></DialogContent></Dialog>;
}
