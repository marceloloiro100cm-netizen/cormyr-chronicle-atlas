import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Plus,Coins,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle}
 from '@/components/ui/dialog';
import {createSpyAgent} from '@/lib/espionage/spy-agent-actions.functions';
import {loadSpyRecruitmentOptions} from '@/lib/espionage/spy-recruitment.functions';
import {SPY_AGENT_UPGRADES,type SpyAgentUpgrade} from '@/lib/espionage/spy-agent-progression';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SpyPortraitPicker} from './spy-portrait-picker';

/** Unified creation transaction. Do not call recruit and purchase separately:
 * that would leave half-created agents when the House runs out of Wealth.
 */
export function SpyCreateAgentDialog({houseId,data,canEdit}:{
 houseId:string;data:SpyManagement|null;canEdit:boolean;
}){
 const [open,setOpen]=useState(false);
 const requestKey=useRef<string|null>(null);
 const [name,setName]=useState('');
 const [sourceId,setSourceId]=useState('');
 const [portraitId,setPortraitId]=useState<string|null>(null);
 const [upgrades,setUpgrades]=useState<SpyAgentUpgrade[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const create=useServerFn(createSpyAgent);
 const loadOptions=useServerFn(loadSpyRecruitmentOptions);
 const qc=useQueryClient();
 const {data:options,isPending:loadingOptions,isError:optionsError,refetch}=useQuery({
  queryKey:['spy-recruitment-options',houseId],
  queryFn:()=>loadOptions({data:{houseId}}),
  enabled:open,staleTime:0,retry:1,
 });
 const slots=options?.recruitment.filter(r=>r.vacancies>0)??[];
 const source=sourceId?slots.find(r=>r.sourceHoldingId===sourceId):slots[0];
 const portraits=options?.portraits??[];
 const cost=upgrades.length;
 const enoughWealth=cost===0||data?.availableWealth===null||
  (data?.availableWealth??0)>=cost;
 const pictureOk=portraits.length===0||Boolean(portraitId&&
  portraits.some(p=>p.id===portraitId&&!p.assignedAgentId));
 const valid=Boolean(options&&!loadingOptions&&!optionsError&&source&&name.trim().length>=2&&
  name.trim().length<=80&&pictureOk&&enoughWealth&&!busy);
 const reset=()=>{requestKey.current=null;setName('');setSourceId('');setPortraitId(null);setUpgrades([]);
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
   const result=await create({data:{
    houseId,sourceHoldingId:source.sourceHoldingId,codename:name.trim(),
    portraitId:portraits.length?portraitId:null,upgrades,
    requestKey:key,
   }});
   setSuccess('Espião '+result.codename+' criado como Verde (Astúcia 3).');
   reset();setOpen(false);
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
    qc.invalidateQueries({queryKey:['espionage-regional-strategy',houseId]}),
    qc.invalidateQueries({queryKey:['noble-house']}),
    qc.invalidateQueries({queryKey:['spy-mission-odds',houseId]}),
   ]);
  }catch{
   setError('Não foi possível criar o espião. Verifique as vagas disponíveis, a foto e a Riqueza da Casa.');
  }finally{setBusy(false);}
 };
 if(!canEdit)return null;
 return <>
  <Button type="button" onClick={()=>setOpen(true)}><Plus size={16}/>Criar espião</Button>
  {success&&<span role="status" className="house-caption">{success}</span>}
  <Dialog open={open} onOpenChange={next=>{if(busy)return;setOpen(next);
    if(!next)reset();}}>
   <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader>
     <DialogTitle><UserRound size={20} style={{display:'inline',verticalAlign:'middle'}}/>
      {' '}Criar espião</DialogTitle>
     <DialogDescription>O novo agente começa no nível Verde, com Astúcia 3.
      As melhorias e o retrato são definidos antes de confirmar sua criação.</DialogDescription>
    </DialogHeader>
    <form onSubmit={e=>void submit(e)} style={{display:'grid',gap:16}}>
     {loadingOptions&&<p className="house-caption" role="status">
      Consultando as vagas da Rede de Espiões desta Casa…</p>}
     {optionsError&&<div role="alert" className="house-warning">
      Não foi possível consultar as vagas. A falta de dados não significa
      que a Casa não possua uma Rede de Espiões.
      <Button type="button" variant="outline" size="sm"
       onClick={()=>void refetch()}>Tentar novamente</Button>
     </div>}
     <label style={{display:'grid',gap:5}}>Nome do espião <span aria-hidden>*</span>
      <input required autoFocus minLength={2} maxLength={80}
       placeholder="Ex.: O Corvo" value={name}
       onChange={e=>{requestKey.current=null;setName(e.target.value);}}/>
     </label>
     <label style={{display:'grid',gap:5}}>Vaga da Rede de Espiões
      <select value={source?.sourceHoldingId??''} required
       onChange={e=>{requestKey.current=null;setSourceId(e.target.value);}} disabled={!slots.length}>
       {loadingOptions&&<option value="">Consultando vagas…</option>}
       {optionsError&&<option value="">Vagas não carregadas</option>}
       {!loadingOptions&&!optionsError&&!slots.length&&<option value="">Nenhuma vaga disponível</option>}
       {slots.map(s=><option key={s.sourceHoldingId} value={s.sourceHoldingId}>
        {s.name} · {s.vacancies} {s.vacancies===1?'vaga':'vagas'}
       </option>)}
      </select>
     </label>
     {Boolean(options)&&!loadingOptions&&!optionsError&&!slots.length&&<p className="house-caption" role="status">
      Não há vaga livre nesta Casa. É necessário possuir uma Rede de Espiões
      ativa ou construir uma Rede Ampliada para liberar novos agentes.</p>}
     <div style={{display:'grid',gap:7}}>
      <strong>Melhorias individuais (opcionais)</strong>
      {(Object.keys(SPY_AGENT_UPGRADES) as SpyAgentUpgrade[]).map(code=>{
       const u=SPY_AGENT_UPGRADES[code];
       return <label key={code} style={{display:'flex',alignItems:'flex-start',
        gap:10,padding:10,border:'1px solid rgba(140,150,170,.35)',borderRadius:9}}>
        <input type="checkbox" style={{marginTop:4}}
         checked={upgrades.includes(code)}
         onChange={e=>toggle(code,e.target.checked)}/>
        <span><strong>{u.name} — 1 Riqueza</strong>
         <small style={{display:'block'}}>{u.description}</small></span>
       </label>;
      })}
      <span style={{display:'flex',alignItems:'center',gap:6}}>
       <Coins size={16}/> Custo selecionado: <strong>{cost} Riqueza</strong>
       {data?.availableWealth!==null&&data?.availableWealth!==undefined&&
        <small>· disponível: {data.availableWealth}</small>}
      </span>
      {!enoughWealth&&<small role="alert">Riqueza insuficiente para as melhorias escolhidas.</small>}
     </div>
     <SpyPortraitPicker portraits={portraits} selected={portraitId}
      onChange={id=>{requestKey.current=null;setPortraitId(id);}}/>
     {portraits.length>0&&!pictureOk&&<small role="status">
      Escolha uma das fotos disponíveis. As imagens em cinza já estão ocupadas.</small>}
     <p className="house-caption">O recrutamento, a reserva da foto e o desconto
      de Riqueza das melhorias serão confirmados juntos. Se qualquer etapa
      falhar, nenhuma delas será aplicada.</p>
     {error&&<p role="alert" className="house-warning">{error}</p>}
     <DialogFooter>
      <Button type="button" variant="outline" disabled={busy}
       onClick={()=>{setOpen(false);reset();}}>Cancelar</Button>
      <Button type="submit" disabled={!valid}>
       {busy?'Criando…':'Confirmar criação'}
      </Button>
     </DialogFooter>
    </form>
   </DialogContent>
  </Dialog>
 </>;
}
