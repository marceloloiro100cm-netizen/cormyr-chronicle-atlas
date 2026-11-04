import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {removeSpyAgentBrowser} from '@/lib/espionage/spy-browser-client';

type Agent=SpyManagement['agents'][number];

/** This is an archival removal: PostgreSQL keeps missions/history intact.
 * The RPC guarantees an atomic, idempotent refund and portrait/slot release.
 */
export function SpyRemoveAgentButton({houseId,agent,houseVersion,canEdit,hasActiveMission}:{
 houseId:string;agent:Agent;houseVersion:number;canEdit:boolean;hasActiveMission:boolean;
}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef<string|null>(null),qc=useQueryClient();
 const allowed=agent.status==='available'&&!hasActiveMission;
 const refund=(agent.forgedDocuments?1:0)+(agent.aceInTheHole?1:0);
 if(!canEdit)return null;

 const remove=async()=>{
  if(!allowed||busy)return;
  setBusy(true);setError('');
  try{
   const requestKey=key.current??crypto.randomUUID();
   key.current=requestKey;
   const result=await removeSpyAgentBrowser({
    houseId,agentId:agent.id,expectedAgentVersion:agent.version,
    expectedHouseVersion:houseVersion,requestKey,
   });
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    qc.invalidateQueries({queryKey:['spy-mission-odds',houseId]}),
    qc.invalidateQueries({queryKey:['noble-house']}),
    qc.invalidateQueries({queryKey:['house',houseId]}),
   ]);
   setOpen(false);key.current=null;
   toast.success('Espião excluído: '+result.refundedWealth+
    ' Riqueza devolvida. Vaga e retrato liberados.');
  }catch{
   setError('Não foi possível concluir a exclusão. Confirme que a ficha está atualizada e não há missão pendente. Nenhuma devolução parcial é aplicada.');
  }finally{setBusy(false);}
 };
 return <>
  <Button type="button" variant="outline" size="sm" disabled={!allowed}
   title={!allowed?'Somente agentes disponíveis e sem missão ativa podem ser excluídos':'Excluir espião'}
   onClick={()=>{key.current=null;setError('');setOpen(true);}}>
   <Trash2 size={15}/> Excluir
  </Button>
  <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}>
   <DialogContent className="sm:max-w-lg">
    <DialogHeader>
     <DialogTitle>Excluir {agent.codename}?</DialogTitle>
     <DialogDescription>
      O espião será retirado do elenco da Casa. A vaga de recrutamento e o
      retrato ficarão disponíveis novamente. Missões concluídas e histórico
      permanecerão preservados para auditoria.
     </DialogDescription>
    </DialogHeader>
    <div className="house-ledger" style={{padding:12}}>
     <p><strong>Riqueza a devolver: {refund}</strong> ponto(s), referente(s)
      a equipamentos adquiridos.</p>
     <p>O recrutamento original não possui custo de Riqueza.</p>
    </div>
    {error&&<p role="alert" className="house-warning">{error}</p>}
    <DialogFooter>
     <Button type="button" variant="outline" disabled={busy}
      onClick={()=>setOpen(false)}>Cancelar</Button>
     <Button type="button" disabled={!allowed||busy}
      onClick={()=>void remove()}><Trash2 size={15}/>
      {busy?'Excluindo…':'Confirmar exclusão'}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </>;
}
