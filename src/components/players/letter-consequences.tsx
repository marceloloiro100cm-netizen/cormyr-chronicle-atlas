import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource} from '@/lib/house/types';

export type LetterConsequenceRow={
 id:string;letter_id:string;house_id:string;changes:unknown;active:boolean;created_at:string;
};

function safeChanges(value:unknown):Partial<Record<Resource,number>>{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const row=value as Record<string,unknown>;
 return Object.fromEntries(RESOURCE_KEYS.filter(k=>Number.isInteger(row[k])&&Number.isFinite(row[k]))
  .map(k=>[k,Number(row[k])])) as Partial<Record<Resource,number>>;
}
export function consequenceLabel(changes:unknown){
 const values=safeChanges(changes);
 return RESOURCE_KEYS.filter(resource=>values[resource]!==undefined&&values[resource]!==0)
  .map(resource=>RESOURCE_NAMES[resource]+' '+(values[resource]!>0?'+':'')+values[resource]).join('; ');
}

type Props={
 letterId:string;houses:{id:string;name:string}[];suggestedHouse:string;
 admin:boolean;items:LetterConsequenceRow[];disabled?:boolean;
 onSaved:()=>void;onError:(message:string)=>void;
};
const empty=Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])) as Record<Resource,number>;

export function LetterConsequences({letterId,houses,suggestedHouse,admin,items,disabled,onSaved,onError}:Props){
 const [open,setOpen]=useState(false),[house,setHouse]=useState(suggestedHouse);
 const [changes,setChanges]=useState<Record<Resource,number>>({...empty});
 const [explanation,setExplanation]=useState('');
 const [busy,setBusy]=useState(false);
 const [reverseId,setReverseId]=useState<string|null>(null);
 const [reverseReason,setReverseReason]=useState('');
 const operationKey=useRef<string|null>(null);
 const reverseKey=useRef<string|null>(null);
 const client=useQueryClient();

 const notify=()=>{
  void client.invalidateQueries({queryKey:['letter-consequences']});
  onSaved();
 };
 async function currentVersion(houseId:string){
  const r=await supabase.from('noble_house_sheets').select('version').eq('house_id',houseId).single();
  if(r.error||!r.data)throw new Error('Ficha não encontrada ou sem permissão de leitura.');
  return r.data.version;
 }
 async function apply(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  if(!house){onError('Selecione a Casa que sofrerá a consequência.');return;}
  const effective=Object.fromEntries(RESOURCE_KEYS.filter(k=>changes[k]!==0).map(k=>[k,changes[k]]));
  if(!Object.keys(effective).length){onError('Defina ao menos uma alteração de recurso.');return;}
  if(RESOURCE_KEYS.some(k=>!Number.isInteger(changes[k])||Math.abs(changes[k])>100)){
   onError('Use apenas valores inteiros de −100 a +100.');return;
  }
  if(explanation.trim().length<10){onError('Descreva o evento em pelo menos dez caracteres.');return;}
  setBusy(true);
  try{
   operationKey.current??=crypto.randomUUID();
   const version=await currentVersion(house);
   const r=await supabase.rpc('apply_letter_consequence',{
    p_letter:letterId,p_house:house,p_changes:effective,p_explanation:explanation.trim(),
    p_key:operationKey.current,p_expected_version:version
   });
   if(r.error)throw r.error;
   operationKey.current=null;setOpen(false);setExplanation('');setChanges({...empty});notify();
  }catch(err){onError(err instanceof Error?err.message:'Erro ao registrar consequência.');}
  finally{setBusy(false);}
 }
 async function reverse(event:LetterConsequenceRow){
  if(busy||reverseReason.trim().length<10){onError('Justifique o estorno em pelo menos dez caracteres.');return;}
  setBusy(true);
  try{
   reverseKey.current??=crypto.randomUUID();
   const version=await currentVersion(event.house_id);
   const r=await supabase.rpc('reverse_letter_consequence',{
    p_id:event.id,p_key:reverseKey.current,p_expected_version:version,p_reason:reverseReason.trim()
   });
   if(r.error)throw r.error;
   reverseKey.current=null;setReverseId(null);setReverseReason('');notify();
  }catch(err){onError(err instanceof Error?err.message:'Erro ao estornar consequência.');}
  finally{setBusy(false);}
 }

 const active=items.filter(x=>x.active);
 const inactive=items.filter(x=>!x.active);
 return <section className="campaign-letter-consequences" aria-label="Consequências da missiva">
  {active.map(event=><div key={event.id} className="campaign-consequence-band" role="status">
   <strong>Consequências:</strong>
   <span>{consequenceLabel(event.changes)}</span>
   {admin&&<small>Casa {houses.find(h=>h.id===event.house_id)?.name??event.house_id}</small>}
   {admin&&!disabled&&<Button type="button" size="sm" variant="outline" disabled={busy}
    onClick={()=>{setReverseId(reverseId===event.id?null:event.id);reverseKey.current=null;}}>Estornar</Button>}
   {admin&&reverseId===event.id&&<div className="campaign-consequence-reverse">
    <label>Justificativa do estorno
     <input value={reverseReason} maxLength={2000} onChange={e=>setReverseReason(e.target.value)}
      placeholder="Motivo da correção pelo Narrador"/>
    </label>
    <Button type="button" disabled={busy||reverseReason.trim().length<10} onClick={()=>void reverse(event)}>Confirmar estorno</Button>
    <Button type="button" variant="ghost" onClick={()=>{setReverseId(null);setReverseReason('');}}>Cancelar</Button>
   </div>}
  </div>)}
  {admin&&inactive.map(event=><p key={event.id} className="campaign-consequence-history">
   Consequência estornada · Casa {houses.find(h=>h.id===event.house_id)?.name??event.house_id} · {consequenceLabel(event.changes)}
  </p>)}
  {admin&&!disabled&&<div className="campaign-consequence-editor">
   <Button type="button" className="campaign-consequence-button" aria-expanded={open} onClick={()=>setOpen(!open)}>
    Consequências
   </Button>
   {open&&<form className="campaign-consequence-form" onSubmit={e=>void apply(e)}>
    <p className="text-sm">Apenas o Narrador aplica eventos. Perdas ficam alocadas na ficha, ganhos são bônus do evento; não alteram os pontos-base.</p>
    <label>Casa afetada
     <select required value={house} onChange={e=>{setHouse(e.target.value);operationKey.current=null;}}>
      <option value="">Selecione a Casa</option>
      {houses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
     </select>
    </label>
    <div className="campaign-consequence-grid">
     {RESOURCE_KEYS.map(resource=><label key={resource}>{RESOURCE_NAMES[resource]}
      <input type="number" step="1" min="-100" max="100" value={changes[resource]}
       onChange={e=>{setChanges(v=>({...v,[resource]:Number(e.target.value)}));operationKey.current=null;}}
       aria-label={'Alteração de '+RESOURCE_NAMES[resource]}/>
     </label>)}
    </div>
    <label>Descrição do evento
     <textarea rows={2} required minLength={10} maxLength={2000} value={explanation}
      onChange={e=>{setExplanation(e.target.value);operationKey.current=null;}}
      placeholder="Ex.: venda clandestina de grãos causou fome na região"/>
    </label>
    <p className="campaign-consequence-preview">Prévia: {consequenceLabel(changes)||'Nenhuma alteração selecionada'}</p>
    <div className="campaign-actions">
     <Button disabled={busy||!house||!consequenceLabel(changes)||explanation.trim().length<10}>
      {busy?'Registrando…':'Aplicar na ficha'}
     </Button>
     <Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
    </div>
   </form>}
  </div>}
 </section>;
}
