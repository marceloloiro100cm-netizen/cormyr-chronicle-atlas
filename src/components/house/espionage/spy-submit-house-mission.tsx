import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Send,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import {readSpyHouseManagementBrowser,submitSpyHouseMissionBrowser}
 from '@/lib/espionage/spy-browser-client';
import {regionId} from '@/lib/house/regions';

/** Confirmation starts the mission immediately. Database validates route and
 * calendar; the Hub controls progression, and the Narrator handles outcomes. */
export function SpySubmitHouseMission({houseId,agentId,agentName,
 originRegion,destinationRegion,destinationName,targetHouseId,targetHouseName,
 travelRounds,calendarVersion,canSubmit,onSubmitted}:{
 houseId:string;agentId:string;agentName:string;
 originRegion:string;destinationRegion:string;destinationName:string;
 targetHouseId:string;targetHouseName:string;travelRounds:number;
 calendarVersion:number|null;canSubmit:boolean;
 onSubmitted?:(operationId:string)=>void;
}){
 const qc=useQueryClient();
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState<{id:string;status:'traveling'|'operating'|'pending_narrator_review'}|null>(null);
 const requestKey=useRef<string|null>(null);
 const agentVersion=useRef<number|null>(null);
 const ready=canSubmit&&calendarVersion!==null&&!receipt&&!busy;
 const total=travelRounds+1;
 const send=async()=>{
  if(!ready||calendarVersion===null)return;
  setBusy(true);setError('');
  try{
   const key=requestKey.current??crypto.randomUUID();
   requestKey.current=key;
   // Obtain the version from the authoritative agent roster instead of using
   // the preview's unversioned strategic copy.
   if(agentVersion.current===null){
    const roster=await readSpyHouseManagementBrowser(houseId);
    const agent=roster.agents.find(a=>a.id===agentId);
    if(!agent||agent.status!=='available'||
       regionId(agent.currentRegion??'')!==originRegion)
     throw new Error('A posição ou a situação do espião mudou.');
    agentVersion.current=agent.version;
   }
   const result=await submitSpyHouseMissionBrowser({
    houseId,agentId,targetHouseId,destinationRegion,
    expectedAgentVersion:agentVersion.current,
    expectedCalendarVersion:calendarVersion,requestKey:key,
   });
   setReceipt({id:result.operationId,status:result.status});
   setOpen(false);
   await Promise.allSettled([
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-mission-odds',houseId]}),
   ]);
   onSubmitted?.(result.operationId);
  }catch(e){
   setError(e instanceof Error?e.message:
    'Não foi possível registrar a ordem. Atualize a ficha e tente novamente.');
  }finally{setBusy(false);}
 };
 return <div className="spy-planner-execution">
  {receipt?<div className="spy-planner-execution-confirmed" role="status">
   <ShieldCheck size={18} aria-hidden="true"/>
   <span>{receipt.status==='traveling'
    ?'Missão iniciada. O espião está em viagem; a contagem acompanha o Hub Temporal.'
    :'Missão iniciada. O espião já está investigando a Casa na região atual.'}</span>
  </div>:<Button type="button" className="spy-planner-execution-button"
   disabled={!ready} onClick={()=>{setError('');setOpen(true);}}>
   <Send size={16} aria-hidden="true"/> Iniciar missão
  </Button>}
  {!receipt&&!ready&&<small role="status">
   Selecione um espião disponível, uma Casa e aguarde o carregamento do calendário.
  </small>}
  <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}>
   <DialogContent className="spy-mission-confirm-dialog sm:max-w-lg">
    <DialogHeader>
     <DialogTitle>Confirmar início da missão</DialogTitle>
     <DialogDescription>
      A missão começa imediatamente após a confirmação. A viagem e a
      investigação seguem os prazos do Hub Temporal, sem autorização adicional.
     </DialogDescription>
    </DialogHeader>
    <div className="spy-planner-execution-details">
     <p><strong>Espião:</strong> {agentName}</p>
     <p><strong>Casa-alvo:</strong> {targetHouseName}</p>
     <p><strong>Região:</strong> {destinationName}</p>
     <p><strong>Viagem estimada:</strong> {travelRounds} désdia(s) · {travelRounds*10} dias</p>
     <p><strong>Missão estimada:</strong> {total} désdia(s) · {total*10} dias</p>
     <small>O servidor valida a região, a rota e o prazo antes de iniciar.
      O resultado da espionagem será definido ao término da investigação.</small>
    </div>
    {error&&<p className="house-warning" role="alert">{error}</p>}
    <DialogFooter>
     <Button type="button" variant="outline" disabled={busy}
      onClick={()=>setOpen(false)}>Cancelar</Button>
     <Button type="button" disabled={!ready} onClick={()=>void send()}>
      <Send size={15} aria-hidden="true"/>
      {busy?'Iniciando missão…':'Confirmar início'}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
