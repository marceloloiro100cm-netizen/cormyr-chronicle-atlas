import {useEffect,useState,type FormEvent} from 'react';
import {firebaseAccountRequest} from '@/lib/firebase-workspace/account-client';

type House={id:string;name:string;season?:number|null};
type Account={
 uid:string;playerId:string|null;name:string|null;email:string|null;
 profile:'jogador'|'editor'|null;active:boolean;memberHouseIds:string[];
 editHouseIds:string[];attrHouseIds:string[];version:number;
 requirePasswordChange:boolean;
};
const key=()=>globalThis.crypto?.randomUUID?.()??'';
const sorted=(list:string[])=>[...list].sort();

export function FirebaseAccountManager({houses}: {houses:House[]}){
 const [items,setItems]=useState<Account[]>([]);
 const [selected,setSelected]=useState('');
 const [name,setName]=useState('');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [role,setRole]=useState<'jogador'|'editor'>('jogador');
 const [members,setMembers]=useState<string[]>([]);
 const [edits,setEdits]=useState<string[]>([]);
 const [attrs,setAttrs]=useState<string[]>([]);
 const [active,setActive]=useState(true);
 const [requireChange,setRequireChange]=useState(true);
 const [requestKey,setRequestKey]=useState(key);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [loaded,setLoaded]=useState(false);
 const allowedHouses=houses.filter(h=>h.season===2);
 const record=items.find(a=>a.uid===selected);
 const dirty=()=>{setRequestKey(key());setMessage('');};
 async function refresh(){
  setBusy(true);setMessage('');
  try{
   const result=await firebaseAccountRequest<{items:Account[]}>('list');
   setItems(result.items);setLoaded(true);
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível consultar as contas.');}
  finally{setBusy(false);}
 }
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{
  const a=items.find(x=>x.uid===selected);
  setName(a?.name??'');setEmail(a?.email??'');
  setRole(a?.profile==='editor'?'editor':'jogador');
  setMembers(a?.memberHouseIds??[]);
  setEdits(a?.editHouseIds??[]);
  setAttrs(a?.attrHouseIds??[]);
  setActive(a?.active??true);
  setRequireChange(a?.requirePasswordChange??true);
  setPassword('');dirty();
 },[selected,items]);
 const toggle=(id:string,checked:boolean)=>{
  dirty();
  setMembers(v=>checked?sorted([...v,id]):v.filter(x=>x!==id));
  if(!checked){
   setEdits(v=>v.filter(x=>x!==id));
   setAttrs(v=>v.filter(x=>x!==id));
  }
 };
 async function save(e:FormEvent){
  e.preventDefault();if(busy||!requestKey)return;
  if(role==='jogador'&&members.length===0){
   setMessage('Selecione ao menos uma Casa ativa.');return;
  }
  if(!selected&&password.length<10){
   setMessage('Defina uma senha inicial de pelo menos 10 caracteres.');return;
  }
  setBusy(true);setMessage('');
  try{
   const result=await firebaseAccountRequest<{uid:string;duplicate:boolean}>('submit',{
    ...(selected?{targetUid:selected}:{}),
    expectedVersion:record?.version??0,
    requestKey,name:name.trim(),email:email.trim(),
    ...(password?{password}:{}),profile:role,active,requireChange,
    memberHouseIds:role==='editor'?[]:members,
    editHouseIds:role==='editor'?[]:edits,
    attrHouseIds:role==='editor'?[]:attrs,
   });
   setPassword('');setSelected(result.uid);setRequestKey(key());
   setMessage(result.duplicate?'Operação já registrada.':
    'Conta registrada no Firebase. O histórico importado foi preservado.');
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar a conta.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Gerenciamento de contas Firebase"
   className="rounded border border-current/25 p-4 space-y-3">
   <h2 className="text-lg font-semibold">Gerenciar contas Firebase</h2>
   <p className="text-sm">
    Cadastro, desativação e vínculos conferidos no servidor pelo Narrador.
    Contas novas exigem troca de senha. Nenhum acesso ao acervo é concedido
    pela seleção de uma Casa nesta tela.
   </p>
   <button type="button" disabled={busy} onClick={()=>void refresh()}
    className="rounded border px-3 py-1 text-sm">Atualizar contas</button>
   <label className="block">Conta
    <select className="block rounded border p-2 w-full" value={selected}
      disabled={busy} onChange={e=>setSelected(e.target.value)}>
      <option value="">Cadastrar nova conta</option>
      {items.map((a,i)=><option key={a.uid} value={a.uid}>
        {a.name??a.email??`Conta ${i+1}`} · {a.profile} ·
        {a.active?' ativa':' inativa'}
      </option>)}
    </select>
   </label>
   {loaded&&<form className="campaign-form" onSubmit={e=>void save(e)}>
    <label>Nome<input required maxLength={160} value={name} disabled={busy}
      onChange={e=>{dirty();setName(e.target.value);}}/></label>
    <label>E-mail<input type="email" required value={email} disabled={busy}
      onChange={e=>{dirty();setEmail(e.target.value);}}/></label>
    <label>{selected?'Nova senha (opcional)':'Senha inicial'}
      <input type="password" autoComplete="new-password" minLength={10}
       maxLength={128} required={!selected} value={password} disabled={busy}
       onChange={e=>{dirty();setPassword(e.target.value);}}/>
    </label>
    <label>Perfil<select value={role} disabled={busy||Boolean(record?.profile)}
      onChange={e=>{dirty();setRole(e.target.value as 'jogador'|'editor');
        setMembers([]);setEdits([]);setAttrs([]);}}>
      <option value="jogador">Jogador</option>
      <option value="editor">Editor-Chefe (sem Casa)</option>
    </select></label>
    {role==='jogador'&&<fieldset>
      <legend>Casas e permissões de edição</legend>
      {allowedHouses.map(h=><div key={h.id}
        className="grid grid-cols-3 gap-2 text-sm py-1">
        <label><input type="checkbox" disabled={busy}
         checked={members.includes(h.id)}
         onChange={e=>toggle(h.id,e.target.checked)}/> {h.name}</label>
        <label><input type="checkbox" disabled={busy||!members.includes(h.id)}
         checked={edits.includes(h.id)} onChange={e=>{
          dirty();setEdits(v=>e.target.checked?sorted([...v,h.id]):v.filter(x=>x!==h.id));
          if(!e.target.checked)setAttrs(v=>v.filter(x=>x!==h.id));
         }}/> Editar</label>
        <label><input type="checkbox" disabled={busy||!edits.includes(h.id)}
         checked={attrs.includes(h.id)} onChange={e=>{
          dirty();setAttrs(v=>e.target.checked?sorted([...v,h.id]):v.filter(x=>x!==h.id));
         }}/> Atributos</label>
      </div>)}
    </fieldset>}
    <label><input type="checkbox" checked={active} disabled={busy}
       onChange={e=>{dirty();setActive(e.target.checked);}}/> Conta ativa</label>
    <label><input type="checkbox" checked={requireChange} disabled={busy}
       onChange={e=>{dirty();setRequireChange(e.target.checked);}}/>
       Exigir troca de senha</label>
    <p className="text-xs">
      Versão atual: {record?.version??0}. O servidor recusa versões
      desatualizadas. Alterações de e-mail e transferência de perfil
      existentes exigem revisão administrativa separada.
    </p>
    <button className="rounded border px-4 py-2" disabled={busy||!requestKey}>
      {busy?'Conferindo…':'Salvar conta Firebase'}
    </button>
   </form>}
   {message&&<p role="status">{message}</p>}
 </section>;
}
