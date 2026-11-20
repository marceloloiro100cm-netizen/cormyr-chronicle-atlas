import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@/lib/visual-preview/server-fn';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter}
 from '@/components/ui/dialog';
import {assignSpyPortrait} from '@/lib/espionage/spy-agent-actions.functions';
import {readSpyRecruitmentOptionsBrowser} from '@/lib/espionage/spy-browser-client';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SpyAvatar,SpyPortraitPicker} from './spy-portrait-picker';
import {CustomImageUpload} from '../custom-image-upload';
type Agent=SpyManagement['agents'][number];
export function SpyAgentPortraitControl({houseId,agent,portraits,canEdit,customUrl=null,onCustomImage}:{
 houseId:string;agent:Agent;portraits:SpyManagement['portraits'];canEdit:boolean;
 /** Retrato enviado pela Casa: tem prioridade sobre o da galeria. */
 customUrl?:string|null;onCustomImage?:((image:string)=>Promise<boolean>)|undefined;
}){
 const [open,setOpen]=useState(false),[previewOpen,setPreviewOpen]=useState(false),
  [selected,setSelected]=useState(agent.portraitId);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const action=useServerFn(assignSpyPortrait);const qc=useQueryClient();
 const gallery=portraits.find(p=>p.id===agent.portraitId);
 const imageUrl=customUrl??gallery?.imageUrl??null;
 // Only the opened picker polls the global catalogue. Other agent cards
 // do not create background requests or expose foreign House identities.
 const options=useQuery({
  queryKey:['spy-recruitment-options',houseId],
  queryFn:()=>readSpyRecruitmentOptionsBrowser(houseId),
  enabled:open,staleTime:0,retry:1,
  refetchInterval:open?10_000:false,refetchIntervalInBackground:false,
 });
 const currentPortraits=open&&options.data?options.data.portraits:portraits;
 const available=currentPortraits.filter(p=>
  (!p.occupied&&!p.assignedAgentId)||p.assignedAgentId===agent.id);
 const save=async()=>{
  if(!selected||busy)return;
  setBusy(true);setError('');
  try{
   await action({data:{houseId,agentId:agent.id,portraitId:selected,
    expectedVersion:agent.version}});
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
   ]);
   setOpen(false);
  }catch{
   await Promise.allSettled([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-recruitment-options',houseId]}),
   ]);
   setError('Esta foto já está reservada por outro agente ou a ficha mudou. Atualize a galeria e escolha outra imagem.');
  }finally{setBusy(false);}
 };
 return <div className="spy-agent-portrait">
  {imageUrl?<button type="button" className="spy-agent-portrait-zoom"
    aria-label={'Ampliar retrato de '+agent.codename}
    title="Ampliar retrato" onClick={()=>setPreviewOpen(true)}>
   <SpyAvatar name={agent.codename} url={imageUrl} size={68}/>
  </button>:<SpyAvatar name={agent.codename} url={null} size={68}/>}
  <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
   <DialogContent className="sm:max-w-xl">
    <DialogHeader><DialogTitle>Retrato de {agent.codename}</DialogTitle></DialogHeader>
    <div className="spy-agent-portrait-large">
     {imageUrl?<img src={imageUrl} alt={'Retrato ampliado de '+agent.codename}
      loading="lazy" style={{width:'100%',maxHeight:'70vh',objectFit:'contain'}}/>:
      <SpyAvatar name={agent.codename} url={null} size={120}/>}
    </div>
   </DialogContent>
  </Dialog>
  {canEdit&&portraits.length>0&&agent.status!=='dead'&&
   <Button type="button" variant="ghost" size="sm" className="spy-agent-portrait-pick" disabled={!available.length}
    onClick={()=>{setSelected(agent.portraitId);setError('');setOpen(true);
     void qc.invalidateQueries({queryKey:['spy-house-management',houseId]});}}>
    {agent.portraitId?'Alterar foto':'Escolher foto'}
   </Button>}
  {canEdit&&onCustomImage&&agent.status!=='dead'&&
   <CustomImageUpload label={'o espião '+agent.codename} hasImage={Boolean(customUrl)} onSave={onCustomImage}/>}
  <Dialog open={open} onOpenChange={next=>{if(busy)return;setOpen(next);}}>
   <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Retrato de {agent.codename}</DialogTitle></DialogHeader>
    <SpyPortraitPicker portraits={currentPortraits} selected={selected}
     onChange={setSelected} currentAgentId={agent.id}/>
    {error&&<p className="house-warning" role="alert">{error}</p>}
    <DialogFooter>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</Button>
     <Button type="button" disabled={!selected||busy||
      !available.some(p=>p.id===selected)} onClick={()=>void save()}>
      {busy?'Salvando…':'Confirmar retrato'}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
