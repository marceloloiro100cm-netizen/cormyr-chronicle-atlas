import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';

export const NARRATOR_FIELDS=[
 ['ordem_recebida','1. Ordem recebida'],
 ['execucao','2. Execução'],
 ['resultado','3. Resultado'],
 ['conhecimento','4. Conhecimento'],
 ['pendencia','5. Pendência'],
] as const;
type Field=typeof NARRATOR_FIELDS[number][0];
type Notes=Record<Field,string>;
const empty=():Notes=>({ordem_recebida:'',execucao:'',resultado:'',conhecimento:'',pendencia:''});
export function NarratorMailNotes({letterId,replyId,userId}:{letterId?:string;replyId?:string;userId:string}){
 const id=replyId?'reply:'+replyId:'letter:'+letterId;
 const [open,setOpen]=useState(false),[notes,setNotes]=useState<Notes>(empty),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const client=useQueryClient();
 const {data,error}=useQuery({queryKey:['narrator-mail-notes',id],enabled:open,queryFn:async()=>{
  const result=await supabase.from('narrator_mail_notes').select('notes').eq('id',id).maybeSingle();
  if(result.error)throw result.error;
  return result.data?.notes??null;
 }});
 useEffect(()=>{if(data&&typeof data==='object'&&!Array.isArray(data)){
  const value=data as Record<string,unknown>;
  setNotes(Object.fromEntries(NARRATOR_FIELDS.map(([field])=>[field,typeof value[field]==='string'?value[field]:''])) as Notes);
 }},[data]);
 return <details onToggle={e=>setOpen(e.currentTarget.open)} className="campaign-narrator-notes">
  <summary>Registro do Mestre (privado)</summary>
  {open&&<form className="campaign-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');
   const result=await supabase.from('narrator_mail_notes').upsert({
    id,letter_id:replyId?null:letterId??null,reply_id:replyId??null,notes,updated_by:userId,updated_at:new Date().toISOString(),
   },{onConflict:'id'});
   setBusy(false);
   if(result.error)setMessage(result.error.message);else{setMessage('Registro privado salvo.');client.invalidateQueries({queryKey:['narrator-mail-notes',id]});}
  }}>
   {error&&<p role="alert">Não foi possível carregar as notas privadas.</p>}
   {NARRATOR_FIELDS.map(([field,label])=><label key={field}>{label}
    <textarea rows={2} value={notes[field]} onChange={e=>setNotes(curr=>({...curr,[field]:e.target.value}))}/>
   </label>)}
   <Button disabled={busy}>Salvar Registro do Mestre</Button><p role="status">{message}</p>
  </form>}
 </details>;
}
