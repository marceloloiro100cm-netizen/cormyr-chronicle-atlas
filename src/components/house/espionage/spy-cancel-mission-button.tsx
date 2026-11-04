import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Ban} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import {cancelSpyMissionBrowser} from '@/lib/espionage/spy-browser-client';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';

type Mission=SpyManagement['operations'][number];

export function SpyCancelMissionButton({houseId,operation,agentName,canEdit}:{
 houseId:string;operation:Mission;agentName:string;canEdit:boolean;
}){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const key=useRef<string|null>(null);
 const qc=useQueryClient();
 const cancellable=['traveling','operating','pending_narrator_review','planned']
  .includes(operation.status)&&Boolean(operation.version);
 if(!canEdit||!cancellable)return null;
 const cancel=async()=>{
  if(busy||!operation.version)return;
  setBusy(true);setError('');
  try{
   const requestKey=key.current??crypto.randomUUID();
   key.current=requestKey;
   await cancelSpyMissionBrowser({
    houseId,operationId:operation.id,
    expectedVersion:operation.version,requestKey,
   });
   // The database has already released the agent. Reflect that immediately in
   // the current card, without showing a cancelled receipt or stale mission.
   // The subsequent refetch reconciles versions and location with PostgreSQL.
   qc.setQueryData<SpyManagement>(['spy-house-management',houseId],current=>
    current?{
     ...current,
     agents:current.agents.map(agent=>agent.id===operation.assetId
      ?{...agent,status:'available' as const,version:agent.version+1}:agent),
     operations:current.operations.map(item=>item.id===operation.id
      ?{...item,status:'cancelled' as const,version:(item.version??operation.version!)+1}:item),
    }:current);
   setOpen(false);
   await Promise.allSettled([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
   ]);
  }catch(e){
   setError(e instanceof Error?e.message:
    'Não foi possível cancelar a missão. Atualize a ficha.');
  }finally{setBusy(false);}
 };
 return <>
  <Button type="button" variant="outline" size="sm"
   className="spy-agent-cancel-mission" onClick={()=>{setError('');setOpen(true);}}>
   <Ban size={15} aria-hidden="true"/> Cancelar missão
  </Button>
  <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}>
   <DialogContent className="spy-mission-confirm-dialog sm:max-w-lg">
    <DialogHeader>
     <DialogTitle>Cancelar missão de {agentName}?</DialogTitle>
     <DialogDescription>
      A missão será encerrada e o espião ficará disponível novamente, na
      última localização confirmada. A missão e seu histórico serão preservados.
     </DialogDescription>
    </DialogHeader>
    <p className="spy-cancel-mission-info">
     Casa investigada: <strong>{operation.targetHouseName??operation.targetId}</strong>.
     O tempo já transcorrido não será revertido.
    </p>
    {error&&<p className="house-warning" role="alert">{error}</p>}
    <DialogFooter>
     <Button type="button" variant="outline" disabled={busy}
      onClick={()=>setOpen(false)}>Voltar</Button>
     <Button type="button" disabled={busy} onClick={()=>void cancel()}>
      <Ban size={15} aria-hidden="true"/>
      {busy?'Cancelando…':'Confirmar cancelamento'}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </>;
}
