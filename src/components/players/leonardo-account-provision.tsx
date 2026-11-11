import {useState,type FormEvent} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {inspectLeonardoAccess,managePlayerAccount} from '@/lib/player-admin.functions';
import type {Panel} from './panel-data';

/** The login dropdown cannot provision a Supabase identity.
 * This form is visible only in narrator administration. Credentials are
 * submitted only to an authenticated, narrator-gated server function.
 */
export function LeonardoAccountProvision({players,onSave}:{
 players:Panel['players'];onSave:()=>unknown;
}){
 const save=useServerFn(managePlayerAccount);
 const inspect=useServerFn(inspectLeonardoAccess);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [ready,setReady]=useState(false);
 const candidates=players.filter(p=>p.roster_house_id==='espiao'||
  p.name.trim().toLocaleLowerCase('pt-BR')==='leonardo');
 const existing=candidates.length===1&&candidates[0]?.roster_house_id==='espiao'?
  candidates[0]:undefined;
 const conflicting=candidates.length>1||(candidates.length===1&&!existing);
 const verify=async()=>{
  const state=await inspect({data:{email:email.trim()}});
  setReady(state.state==='ready');
  if(state.state==='missing')setMessage('Conta ainda não cadastrada neste Supabase. Crie o acesso abaixo.');
  else if(state.state==='incomplete')setMessage('Conta encontrada, mas o vínculo ou as permissões de Espião estão incompletos. Corrija o acesso abaixo.');
  else setMessage(state.passwordChangeRequired?
   'Conta e vínculo confirmados. Leonardo deverá escolher uma nova senha ao entrar.':
   'Conta e vínculo confirmados no Supabase. Faça o teste de login em uma sessão separada.');
 };
 const run=async(task:()=>Promise<void>)=>{
  setBusy(true);setMessage('');setReady(false);
  try{await task();}
  catch(cause){setMessage(cause instanceof Error?cause.message:'Não foi possível validar o acesso.');}
  finally{setBusy(false);}
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  void run(async()=>{
   if(conflicting)throw new Error('Existe um cadastro Leonardo conflitante. Revise-o antes de criar outra conta.');
   if(password.length<6)throw new Error('Informe a senha inicial do jogador.');
   const result=await save({data:{
    ...(existing?{playerId:existing.id}:{}),
    name:'Leonardo',email:email.trim(),password,
    houseId:'espiao',active:true,canEdit:false,canEditAttributes:false,
    requireChange:true,folderId:null,
   }});
   setPassword('');await verify();await onSave();
   setMessage(previous=>previous+' '+result.message);
  });
 };
 return <details className="campaign-add">
  <summary>Ativar ou corrigir login de Leonardo (Espião)</summary>
  <p className="house-caption">A opção Leonardo no login não cria a conta.
   Aqui o Narrador registra ou redefine a senha inicial diretamente no Supabase,
   sem conceder acesso às fichas das Casas ou às funções de Narrador.</p>
  <form className="campaign-form" onSubmit={submit}>
   <label>E-mail de Leonardo
    <input type="email" required autoComplete="off" value={email}
     onChange={e=>{setEmail(e.target.value);setReady(false);}}/>
   </label>
   <label>Senha inicial (será alterada no primeiro acesso)
    <input type="password" autoComplete="new-password" minLength={6}
     value={password} onChange={e=>setPassword(e.target.value)}/>
   </label>
   <p className="house-caption">Não compartilhe a senha em documentos ou repositórios.
    A verificação consulta apenas o Supabase configurado para este ambiente.</p>
   {conflicting&&<p role="alert">Há um cadastro Leonardo associado a outra Casa
    ou registros duplicados. Revise-o antes de conceder o acesso.</p>}
   <div className="campaign-actions">
    <Button type="button" variant="outline" disabled={busy||!email.trim()}
     onClick={()=>void run(verify)}>Verificar cadastro</Button>
    <Button type="submit" disabled={busy||conflicting||!email.trim()||!password}>
     {busy?'Conferindo…':'Criar ou corrigir acesso'}
    </Button>
   </div>
   {message&&<p role={ready?'status':'alert'}>{message}</p>}
  </form>
 </details>;
}
