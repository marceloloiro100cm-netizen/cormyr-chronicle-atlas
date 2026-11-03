import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {ShieldCheck,FileBadge,Coins} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {buySpyAgentUpgrade} from '@/lib/espionage/spy-agent-actions.functions';
import {SPY_AGENT_UPGRADES,type SpyAgentUpgrade} from '@/lib/espionage/spy-agent-progression';
import type {SpyManagement} from '@/lib/espionage/spy-management.functions';

type Agent=SpyManagement['agents'][number];
export function SpyAgentUpgrades({houseId,agent,houseVersion,wealth,canEdit}:{
 houseId:string;agent:Agent;houseVersion:number;wealth:number|null;canEdit:boolean;
}){
 const action=useServerFn(buySpyAgentUpgrade);
 const qc=useQueryClient();
 const [busy,setBusy]=useState<SpyAgentUpgrade|null>(null);
 const [error,setError]=useState('');
 const buy=async(code:SpyAgentUpgrade)=>{
  if(busy)return;
  setBusy(code);setError('');
  try{
   await action({data:{
    houseId,agentId:agent.id,code,expectedAgentVersion:agent.version,
    expectedHouseVersion:houseVersion,requestKey:crypto.randomUUID(),
   }});
   await Promise.all([
    qc.invalidateQueries({queryKey:['spy-house-management',houseId]}),
    qc.invalidateQueries({queryKey:['spy-mission-odds',houseId]}),
    qc.invalidateQueries({queryKey:['house',houseId]}),
   ]);
  }catch{
   setError('Compra não concluída: confira saldo, agente disponível e versão da ficha.');
  }finally{setBusy(null);}
 };
 const ownership:Record<SpyAgentUpgrade,boolean>={
  forged_documents:agent.forgedDocuments,ace_in_the_hole:agent.aceInTheHole,
 };
 const canBuy=canEdit&&agent.status==='available'&&(wealth===null||wealth>=1);
 return <section style={{display:'grid',gap:8,minWidth:200}} aria-label={'Compras do agente '+agent.codename}>
  {(Object.keys(SPY_AGENT_UPGRADES) as SpyAgentUpgrade[]).map(code=>{
   const owned=ownership[code],item=SPY_AGENT_UPGRADES[code];
   const Icon=code==='forged_documents'?FileBadge:ShieldCheck;
   return <div key={code} style={{
    border:'1px solid rgba(151,165,183,.3)',borderRadius:10,
    padding:9,display:'grid',gap:4,
   }}>
    <div style={{display:'flex',gap:6,alignItems:'center'}}>
     <Icon size={15}/>
     <strong style={{fontSize:12}}>{item.name}</strong>
    </div>
    <small>{item.description}</small>
    {owned?<small style={{fontWeight:700}}>Adquirido · ativo</small>:
      canEdit?<Button type="button" size="sm" variant="outline"
       disabled={!canBuy||busy!==null} onClick={()=>void buy(code)}>
       <Coins size={13}/>{busy===code?'Comprando…':
        wealth!==null&&wealth<1?'Sem recursos':'Comprar · 1 Riqueza'}
      </Button>:
      <small>Não adquirido · 1 Riqueza</small>}
   </div>;
  })}
  {error&&<small role="alert">{error}</small>}
 </section>;
}
