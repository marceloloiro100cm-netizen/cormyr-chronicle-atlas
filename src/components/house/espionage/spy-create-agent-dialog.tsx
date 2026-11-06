import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Plus,Coins,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import {createSpyAgentBrowser,readSpyRecruitmentOptionsBrowser} from '@/lib/espionage/spy-browser-client';
import {SPY_AGENT_UPGRADES,type SpyAgentUpgrade} from '@/lib/espionage/spy-agent-progression';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SpyPortraitPicker} from './spy-portrait-picker';
import {SpyCreationError} from '@/lib/espionage/spy-creation-diagnostics';
import '../creation-dialog-theme.css';

/** Unified creation transaction. Do not call recruit and purchase separately:
 * that would leave half-created agents when the House runs out of Wealth.
 */
export function SpyCreateAgentDialog({houseId,data,canEdit}:{
 houseId:string;data:SpyManagement|null;canEdit:boolean;
}){
 const [open,setOpen]=useState(false);
 const requestKey=useRef<string|null>(null);
 const [name,setName]=useState('');
 const [portraitId,setPortraitId]=useState<string|null>(null);
 const [upgrades,setUpgrades]=useState<SpyAgentUpgrade[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const qc=useQueryClient();
 const {data:options,isPending:loadingOptions,isError:optionsError,refetch}=useQuery({
  queryKey:['spy-recruitment-options',houseId],
  queryFn:()=>readSpyRecruitmentOptionsBrowser(houseId),
  enabled:open,staleTime:0,retry:1,
  // A portrait claimed by another House becomes unavailable while open.
  refetchInterval:open?10_000:false,refetchIntervalInBackground:false,
 });
 const slots=options?.recruitment.filter(r=>r.vacancies>0)??[];
 const source=slots[0];
 const totalVacancies=options?.recruitment.reduce((sum,r)=>sum+r.vacancies,0)??0;
 const portraits=options?.portraits??[];
 const cost=upgrades.length;
 const enoughWealth=cost===0||data?.availableWealth===null||
  data?.availableWealth===undefined||(data.availableWealth>=cost);
 const pictureOk=portraits.length===0||Boolean(portraitId&&
  portraits.some(p=>p.id===portraitId&&!p.occupied&&!p.assignedAgentId));
 const valid=Boolean(options&&!loadingOptions&&!optionsError&&source&&name.trim().length>=2&&
  name.trim().length<=80&&pictureOk&&enoughWealth&&!busy);
 const reset=()=>{requestKey.current=null;setName('');setPortraitId(null);setUpgrades([]);
  setError('');};
 const toggle=(code:SpyAgentUpgrade,checked:boolean)=>{
  requestKey.current=null;
  setUpgrades(old=>checked?[...old.filter(x=>x!==code),code]:old.filter(x=>x!==code));
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!valid||!source)return;
  setBusy(true);setError('');
  try{
   const key=requestKey.current??crypto.randomUUID();
   requestKey.current=key;
   const result=await createSpyAgentBrowser({
    houseId,sourceHoldingId:source.sourceHoldingId,codename:name.trim(),
    portraitId:portraits.length?portraitId:null,upgrades,
    requestKey:key,
   });
   setSuccess('Espião '+result.codename+' criado como Verde (Astúcia 3).');
   reset();setOpen(false);
   // A cache refresh error must not turn an already committed recruitment into
   // a false creation failure. It never rolls the successful RPC back.
   void Promise.allSettled([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    qc.invalidateQueries({queryKey:['noble-house']}),
    qc.invalidateQueries({queryKey:['spy-mission-odds',houseId]}),
   ]);
  }catch(cause){
   // Keep the same idempotency key on retry with unchanged input. If the
   // network timed out after committing, the server can safely return the
   // original outcome rather than create a second spy.
   await Promise.allSettled([
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
   ]);
   setError(cause instanceof SpyCreationError
    ?cause.message
    :new SpyCreationError('unconfirmed').message);
  }finally{setBusy(false);}
 };
 if(!canEdit)return null;
 return <>
  <Button type="button" onClick={()=>{setOpen(true);
   void qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]});}}>
   <Plus size={16}/>Criar espião</Button>
  {success&&<span role="status" className="house-caption">{success}</span>}
  <Dialog open={open} onOpenChange={next=>{if(busy)return;setOpen(next);
    if(!next)reset();}}>
   <DialogContent className="cormyr-creation-dialog cormyr-creation-dialog--spy max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader>
     <DialogTitle><UserRound size={20} style={{display:'inline',verticalAlign:'middle'}}/>
      {' '}Criar espião</DialogTitle>
     <DialogDescription>O novo agente começa no nível Verde, com Astúcia 3.
      As melhorias e o retrato são definidos antes de confirmar sua criação.</DialogDescription>
    </DialogHeader>
    <form className="cormyr-creation-form cormyr-creation-form--spy" onSubmit={e=>void submit(e)}>
     {loadingOptions&&<p className="house-caption" role="status">
      Consultando as vagas da Rede de Espiões desta Casa…</p>}
     {optionsError&&<div role="alert" className="house-warning">
      Não foi possível consultar as vagas. A falta de dados não significa
      que a Casa não possua uma Rede de Espiões.
      <Button type="button" variant="outline" size="sm"
       onClick={()=>void refetch()}>Tentar novamente</Button>
     </div>}
     <label className="cormyr-creation-section"><span>Nome do espião <span aria-hidden>*</span></span>
      <input required autoFocus minLength={2} maxLength={80}
       placeholder="Ex.: O Corvo" value={name}
       onChange={e=>{requestKey.current=null;setName(e.target.value);}}/>
     </label>
     <div className="house-ledger cormyr-creation-summary" role="status" aria-label="Vagas disponíveis para criar espiões">
      <strong>Vagas de espionagem da Casa</strong>
      <p style={{margin:'6px 0'}}><strong>{totalVacancies}</strong> {totalVacancies===1?'vaga livre':'vagas livres'} para novos agentes.</p>
      {options?.recruitment.map(slot=><small key={slot.sourceHoldingId}
       style={{display:'block',marginTop:3}}>
       {slot.name}: {slot.vacancies} de {slot.capacity} {slot.capacity===1?'vaga':'vagas'} disponíveis.
      </small>)}
      <small className="house-caption">Ao confirmar um agente, uma vaga da rede com espaço
       é ocupada automaticamente. A disponibilidade é recalculada pelo servidor para a próxima criação.</small>
     </div>
     {Boolean(options)&&!loadingOptions&&!optionsError&&!slots.length&&<p className="house-caption" role="status">
      Não há vaga livre nesta Casa. É necessário possuir uma Rede de Espiões
      ativa ou construir uma Rede Ampliada para liberar novos agentes.</p>}
     <div className="cormyr-creation-section">
      <strong>Melhorias individuais (opcionais)</strong>
      {(Object.keys(SPY_AGENT_UPGRADES) as SpyAgentUpgrade[]).map(code=>{
       const u=SPY_AGENT_UPGRADES[code];
       return <label key={code} className="cormyr-creation-choice">
        <input type="checkbox"
         checked={upgrades.includes(code)}
         onChange={e=>toggle(code,e.target.checked)}/>
        <span><strong>{u.name} — 1 Riqueza</strong>
         <small style={{display:'block'}}>{u.description}</small></span>
       </label>;
      })}
      <span className="cormyr-creation-cost">
       <Coins size={16}/> Custo selecionado: <strong>{cost} Riqueza</strong>
       {data?.availableWealth!==null&&data?.availableWealth!==undefined&&
        <small>· disponível: {data.availableWealth}</small>}
      </span>
      {!enoughWealth&&<small role="alert">Riqueza insuficiente para as melhorias escolhidas.</small>}
     </div>
     <div className="cormyr-creation-section cormyr-creation-portraits">
      <SpyPortraitPicker portraits={portraits} selected={portraitId}
       onChange={id=>{requestKey.current=null;setPortraitId(id);}}/>
     </div>
     {portraits.length>0&&!pictureOk&&<small role="status">
      Escolha uma foto disponível. As imagens em cinza já estão reservadas por outro agente da campanha.</small>}

     {error&&<p role="alert" className="house-warning">{error}</p>}
     <DialogFooter className="cormyr-creation-footer">
      <Button type="button" variant="outline" disabled={busy}
       onClick={()=>{setOpen(false);reset();}}>Cancelar</Button>
      <Button type="submit" className="cormyr-creation-primary" disabled={!valid}>
       {busy?'Criando…':'Confirmar criação'}
      </Button>
     </DialogFooter>
    </form>
   </DialogContent>
  </Dialog>
 </>;
}
