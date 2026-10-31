import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {readHouseGmNotes,saveHouseGmNotes} from '@/lib/house/gm-management.functions';

/** Deliberately mount only for Narrators. Hidden notes never enter the house state or player export. */
export function HouseGmNotes({houseId}:{houseId:string}) {
 const read=useServerFn(readHouseGmNotes),save=useServerFn(saveHouseGmNotes),qc=useQueryClient();
 const data=useQuery({queryKey:['house-gm-notes',houseId],queryFn:()=>read({data:{houseId}})});
 const [draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const notes=draft??data.data?.notes??'';
 return <details className="house-ledger"><summary>Caderno Secreto do Narrador e Células Ocultas</summary>
   <p className="house-caption">Visível somente para administração. Não é incorporado ao JSON nem aos relatórios dos jogadores.</p>
   {data.isPending?<p>Consultando notas privadas…</p>:data.error?<p role="alert">Notas privadas indisponíveis.</p>:<>
    <label>Segredos, infiltrações, conspirações e pendências
     <textarea rows={9} value={notes} onChange={e=>setDraft(e.target.value)} maxLength={60000}/>
    </label>
    <Button disabled={busy||notes.length>60000} onClick={async()=>{setBusy(true);
     try{await save({data:{houseId,notes}});setDraft(null);setMessage('Notas privadas salvas.');
       await qc.invalidateQueries({queryKey:['house-gm-notes',houseId]});}
     catch(e){setMessage(e instanceof Error?e.message:'Falha no registro privado.');}
     finally{setBusy(false);}
    }}>Salvar notas do Narrador</Button>
    {message&&<p role="status">{message}</p>}
   </>}
 </details>;
}
