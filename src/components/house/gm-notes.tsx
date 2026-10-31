import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import type {Json} from '@/integrations/supabase/types';

type NoteForm={notes:string;cells:string;plots:string;pending:string};
const join=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string').join('\n'):'';
const lines=(text:string)=>text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

export function GmHouseNotes({houseId}:{houseId:string}){
 const qc=useQueryClient(),[form,setForm]=useState<NoteForm|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const query=useQuery({queryKey:['gm-house-notes',houseId],queryFn:async()=>{
  const result=await supabase.from('noble_house_gm_notes').select('house_id,notes,secret_state,updated_at').eq('house_id',houseId).maybeSingle();
  if(result.error)throw result.error;
  return result.data;
 }});
 const raw=query.data?.secret_state;
 const saved=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,Json>:{};
 const initial:NoteForm={notes:query.data?.notes??'',cells:join(saved['spyCells']),plots:join(saved['plots']),pending:join(saved['pending'])};
 const value=form??initial;
 async function save(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const secret_state={...saved,spyCells:lines(value.cells),plots:lines(value.plots),pending:lines(value.pending)};
   const result=await supabase.from('noble_house_gm_notes').upsert({house_id:houseId,notes:value.notes,secret_state},{onConflict:'house_id'});
   if(result.error)throw result.error;
   setForm(null);await qc.invalidateQueries({queryKey:['gm-house-notes',houseId]});setMessage('Anotações privadas do Narrador atualizadas.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar anotações privadas.');}
  finally{setBusy(false);}
 }
 if(query.isPending)return <p role="status">Carregando caderno reservado…</p>;
 if(query.error)return <p role="alert">Caderno reservado indisponível: {query.error.message}</p>;
 return <section className="house-panel"><h3>Caderno secreto do Narrador</h3>
 <p>Somente administradores da campanha podem ler e gravar este caderno. As informações não compõem a exportação do jogador.</p>
 <form className="campaign-form" onSubmit={e=>{e.preventDefault();void save();}}>
 <label>Notas secretas da Casa<textarea rows={5} value={value.notes} onChange={e=>setForm({...value,notes:e.target.value})}/></label>
 <label>Células de espionagem e infiltrações (uma por linha)<textarea value={value.cells} onChange={e=>setForm({...value,cells:e.target.value})}/></label>
 <label>Conspirações e vassalos (uma por linha)<textarea value={value.plots} onChange={e=>setForm({...value,plots:e.target.value})}/></label>
 <label>Pendências privadas do Narrador (uma por linha)<textarea value={value.pending} onChange={e=>setForm({...value,pending:e.target.value})}/></label>
 <Button disabled={busy}>{busy?'Salvando…':'Salvar caderno reservado'}</Button><p role="status">{message}</p>
 </form></section>;
}
