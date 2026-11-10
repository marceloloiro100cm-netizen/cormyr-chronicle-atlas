import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Send,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import {readSpyHouseManagementBrowser,submitSpyHouseMissionBrowser}
 from '@/lib/espionage/spy-browser-client';
import {regionId} from '@/lib/house/regions';
import {getCampaignTime,CAMPAIGN_TIME_QUERY_KEY} from '@/lib/calendar/campaign-time';
import {SpyMissionError} from '@/lib/espionage/spy-mission-errors';
import {formatDate} from '@/lib/calendar/harptos';
import {spyPlayerMissionSummary} from '@/lib/espionage/spy-player-journey';
import {SPY_INTELLIGENCE_OBJECTIVES,type SpyIntelligenceObjective}
 from '@/lib/espionage/spy-intelligence-rules';

/** Confirmation starts the mission immediately. Database validates route and
 * calendar; the Hub controls progression, and the Narrator handles outcomes. */
export function SpySubmitHouseMission({houseId,agentId,agentName,
 originRegion,destinationRegion,destinationName,targetHouseId,targetHouseName,
 travelRounds,calendarVersion,canSubmit,objective,
 departureDate,arrivalDate,completionDate,onSubmitted}:{
 houseId:string;agentId:string;agentName:string;
 originRegion:string;destinationRegion:string;destinationName:string;
 targetHouseId:string;targetHouseName:string;travelRounds:number;
 calendarVersion:number|null;canSubmit:boolean;
 objective:SpyIntelligenceObjective;
 departureDate:string|null;arrivalDate:string|null;completionDate:string|null;
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
 const summary=spyPlayerMissionSummary({
  objective,travelRounds,arrivalDate,endDate:completionDate,
 });
 const objectiveDetails=SPY_INTELLIGENCE_OBJECTIVES.find(item=>item.id===objective);
 const send=async()=>{
  if(!ready||calendarVersion===null)return;
  setBusy(true);setError('');
  try{
   // Check the authoritative Hub date immediately before sending the order.
   // A previously open confirmation dialog must never submit stale deadlines.
   const latest=await getCampaignTime();
   if(latest.version!==calendarVersion){
    requestKey.current=null;agentVersion.current=null;
    await Promise.allSettled([
     qc.invalidateQueries({queryKey:CAMPAIGN_TIME_QUERY_KEY}),
     qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    ]);
    throw new SpyMissionError('calendar_changed');
   }
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
    houseId,agentId,targetHouseId,destinationRegion,objective,
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
   if(e instanceof SpyMissionError&&e.problem==='calendar_changed'){
    requestKey.current=null;agentVersion.current=null;
    void Promise.allSettled([
     qc.invalidateQueries({queryKey:CAMPAIGN_TIME_QUERY_KEY}),
     qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    ]);
   }
   // A perda de conexão mantém a chave original para uma retentativa idempotente.
   // Apenas erros conhecidos podem aparecer na interface; erros crus de RPC são reservados.
   const locationChanged=e instanceof Error&&e.message==='A posição ou a situação do espião mudou.';
   if(locationChanged){requestKey.current=null;agentVersion.current=null;}
   setError(e instanceof SpyMissionError?e.message:
    locationChanged?'A posição ou a situação do espião mudou. Atualize a ficha.':
    'Não foi possível confirmar a missão. Atualize os agentes antes de reenviar.');
  }finally{setBusy(false);}
 };
 return <div className="spy-planner-execution">
  {receipt?<div className="spy-planner-execution-confirmed" role="status">
   <ShieldCheck size={18} aria-hidden="true"/>
   <span>{receipt.status==='traveling'
    ?'Missão iniciada. O espião está em viagem; a contagem acompanha o Hub Temporal.'
    :receipt.status==='operating'
     ?'Missão iniciada. O espião já está investigando a Casa.'
     :'Missão em andamento: o prazo terminou e o resultado aguarda o Narrador.'}</span>
  </div>:<Button type="button" className="spy-planner-execution-button"
   disabled={!ready} onClick={()=>{setError('');setOpen(true);}}>
   <Send size={16} aria-hidden="true"/> Iniciar missão
  </Button>}
  {!receipt&&!ready&&!busy&&<small role="status">
   Selecione um espião disponível, uma Casa e aguarde o carregamento do calendário.
  </small>}
  <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}>
   <DialogContent className="spy-mission-confirm-dialog sm:max-w-lg">
    <DialogHeader>
     <DialogTitle>Confirmar início da missão</DialogTitle>
     <DialogDescription>
      A missão começa após confirmar. O HUB controla o prazo; o Narrador decide o resultado.
     </DialogDescription>
    </DialogHeader>
    <div className="spy-planner-execution-details">
     <p><strong>Espião:</strong> {agentName}</p>
     <p><strong>Casa-alvo:</strong> {targetHouseName}</p>
     <p><strong>Região:</strong> {destinationName}</p>
     <p><strong>Objetivo:</strong> {objectiveDetails?.label??objective}</p>
     <p><strong>Prazo estimado:</strong> {summary.durationDesdias}
      {' '}{summary.durationDesdias===1?'désdia':'désdias'}
      {' '}({summary.durationOrdinaryDays} dias ordinários;
      {' '}{summary.travelDesdias} {summary.travelDesdias===1?'désdia':'désdias'} de viagem).</p>
     {departureDate&&<p><strong>Partida:</strong> {formatDate(departureDate)}</p>}
     {summary.endDate&&<p><strong>Conclusão prevista:</strong>
      {' '}{formatDate(summary.endDate)}</p>}
     <small>O resultado será apresentado após a decisão do Narrador.</small>
    </div>
    {error&&<div className="house-warning" role="alert">
     <p>{error}</p>
     <Button type="button" variant="outline" size="sm" disabled={busy}
      onClick={()=>void Promise.allSettled([
       qc.invalidateQueries({queryKey:CAMPAIGN_TIME_QUERY_KEY}),
       qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
       qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
      ])}>Atualizar previsão e agentes</Button>
    </div>}
    <DialogFooter className="spy-mission-confirm-actions">
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
