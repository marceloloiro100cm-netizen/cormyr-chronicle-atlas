import {useState,type FormEvent} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {inspectLeonardoAccess,manageEditorialAccount} from '@/lib/player-admin.functions';

/** O perfil Editor-Chefe é independente de Casas e Missivas.
 * O Narrador administra identidade e senha, nunca uma filiação fictícia.
 */
export function LeonardoAccountProvision({onSave}:{onSave:()=>unknown}){
 const save=useServerFn(manageEditorialAccount);
 const inspect=useServerFn(inspectLeonardoAccess);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [ready,setReady]=useState(false);
 const run=async(action:()=>Promise<void>)=>{
  setBusy(true);setMessage('');setReady(false);
  try{await action();}
  catch(error){setMessage(error instanceof Error?error.message:'Não foi possível conferir o perfil editorial.');}
  finally{setBusy(false);}
 };
 const verify=async()=>{
  const result=await inspect({data:{email:email.trim()}});
  setReady(result.state==='ready');
  if(result.state==='missing')setMessage('Nenhuma conta encontrada. Defina a senha inicial e cadastre Leonardo.');
  else if(result.state==='incomplete')
   setMessage('Conta existente, mas o perfil Editor-Chefe ainda não está isolado das Casas.');
  else setMessage(result.passwordChangeRequired?
   'Acesso editorial confirmado. Leonardo deverá alterar a senha antes de entrar.':
   'Acesso editorial confirmado, sem Casa, Ficha ou Missivas.');
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void run(async()=>{
   const result=await save({data:{email:email.trim(),...(password?{password}:{})}});
   setPassword('');
   await onSave();
   await verify();
   setMessage(result.message);
  });
 };
 return <details className="campaign-add">
  <summary>Gerenciar acesso editorial · Leonardo (Editor-Chefe)</summary>
  <p className="house-caption">
   O Editor-Chefe usa sua própria conta e acessa exclusivamente A Folha Sem Selo.
   Não possui Casa nobre, ficha, Missivas, batalhas nem permissões do Narrador.
  </p>
  <form className="campaign-form" onSubmit={submit}>
   <label>E-mail do Editor-Chefe
    <input type="email" required autoComplete="off" value={email}
     onChange={e=>{setEmail(e.target.value);setReady(false);}}/>
   </label>
   <label>Senha (opcional para conta existente)
    <input type="password" autoComplete="new-password" minLength={8}
     value={password} onChange={e=>setPassword(e.target.value)}/>
   </label>
   <p className="house-caption">
    Em novo cadastro, informe uma senha inicial. Em contas existentes, deixe em branco
    para manter a senha atual. Nenhuma credencial é salva no GitHub.
   </p>
   <div className="campaign-actions">
    <Button type="button" variant="outline" disabled={busy||!email.trim()}
     onClick={()=>void run(verify)}>Verificar perfil</Button>
    <Button type="submit" disabled={busy||!email.trim()}>
     {busy?'Conferindo…':'Ativar ou corrigir Editor-Chefe'}
    </Button>
   </div>
   {message&&<p role={ready?'status':'alert'}>{message}</p>}
  </form>
 </details>;
}
