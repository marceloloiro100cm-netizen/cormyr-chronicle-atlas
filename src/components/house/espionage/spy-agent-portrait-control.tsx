import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter}
 from '@/components/ui/dialog';
import {assignSpyPortrait} from '@/lib/espionage/spy-agent-actions.functions';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';
import {SpyAvatar,SpyPortraitPicker} from './spy-portrait-picker';
type Agent=SpyManagement['agents'][number];
export function SpyAgentPortraitControl({houseId,agent,portraits,canEdit}:{
 houseId:string;agent:Agent;portraits:SpyManagement['portraits'];canEdit:boolean;
}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(agent.portraitId);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const action=useServerFn(assignSpyPortrait);const qc=useQueryClient();
 const own=portraits.find(p=>p.id===agent.portraitId);
 const available=portraits.filter(p=>!p.assignedAgentId||p.assignedAgentId===agent.id);
 const save=async()=>{
  if(!selected||busy)return;
  setBusy(true);setError('');
  try{
   await action({data:{houseId,agentId:agent.id,portraitId:selected,
    expectedVersion:agent.version}});
   await qc.invalidateQueries({queryKey:['spy-house-management',houseId]});
   setOpen(false);
  }catch{
   setError('Esta foto já está ocupada ou o registro do agente foi atualizado. Recarregue os agentes.');
  }finally{setBusy(false);}
 };
 return <div style={{display:'flex',alignItems:'center',gap:8}}>
  <SpyAvatar name={agent.codename} url={own?.imageUrl??null}/>
  {canEdit&&portraits.length>0&&agent.status!=='dead'&&
   <Button type="button" variant="ghost" size="sm" disabled={!available.length}
    onClick={()=>{setSelected(agent.portraitId);setError('');setOpen(true);}}>
    {agent.portraitId?'Alterar foto':'Escolher foto'}
   </Button>}
  <Dialog open={open} onOpenChange={next=>{if(busy)return;setOpen(next);}}>
   <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Retrato de {agent.codename}</DialogTitle></DialogHeader>
    <SpyPortraitPicker portraits={portraits} selected={selected}
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
