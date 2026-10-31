import {useState} from 'react';
import {Castle,ShieldCheck,GraduationCap,PenTool} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {activeHoldings} from '@/lib/house/engine';
import {MILITARY_HOLDINGS} from '@/lib/house/unit-progression';
import type {HouseState,Holding} from '@/lib/house/types';

function NamedAsset({holding,canEdit,busy,onRename}:{holding:Holding;canEdit:boolean;busy:boolean;
 onRename:(args:Record<string,unknown>)=>Promise<boolean>}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(holding.name);
 const info=CORE_CATALOG.find(x=>x.id===holding.itemId);
 return <article className="military-asset-card">
  <div className="military-asset-icon">{holding.itemId.includes('academy')?<GraduationCap/>:holding.itemId.includes('master')?<ShieldCheck/>:<Castle/>}</div>
  <div className="military-asset-details"><small>{info?.name??'Estrutura militar'}</small><strong>{holding.name}</strong>
   <p>{info?.description||'Benefício militar adquirido pela Casa.'}</p>
   {holding.itemId==='pros-master-of-arms'&&<p className="military-positive">Primeira melhoria de equipamento gratuita por unidade; +1 em Sobreviventes, calculado automaticamente.</p>}
   {holding.itemId==='pros-military-academy'&&<p>Conversão Riqueza → Poder 1:1; redução de perdas de habilidades por dano de Guerra conforme decisão de combate.</p>}
   {holding.itemId==='pros-military-academy--core-training'&&<p className="house-warning">Escolha a habilidade beneficiada na fonte/decisão do Narrador antes de aplicá-la às fichas. Não criar bônus arbitrário.</p>}
   {editing&&<form className="military-rename" onSubmit={async e=>{e.preventDefault();if(await onRename({holdingId:holding.id,name}))setEditing(false);}}>
      <label>Nome do cargo ou da construção<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
      <Button disabled={busy||!name.trim()} size="sm">Salvar nome</Button>
      <Button type="button" variant="outline" size="sm" onClick={()=>setEditing(false)}>Cancelar</Button>
    </form>}
   {canEdit&&!editing&&<Button type="button" size="sm" variant="ghost" onClick={()=>{setName(holding.name);setEditing(true);}}><PenTool size={14}/>Dar nome</Button>}
  </div>
 </article>;
}
export function MilitaryAssets({state,canEdit,busy,onRename}:{state:HouseState;canEdit:boolean;busy:boolean;
 onRename:(args:Record<string,unknown>)=>Promise<boolean>}){
 const assets=activeHoldings(state).filter(h=>MILITARY_HOLDINGS.includes(h.itemId));
 return <section className="military-assets">
  <div className="house-section-heading"><div><p className="campaign-eyebrow">BÔNUS E INSTALAÇÕES</p><h3>Gestão militar da Casa</h3></div></div>
  {assets.length?<div className="military-assets-grid">{assets.map(h=><NamedAsset key={h.id} holding={h} canEdit={canEdit} busy={busy} onRename={onRename}/>)}</div>:
   <div className="military-assets-grid">
    <article className="military-asset-card military-asset-inactive"><div className="military-asset-icon"><ShieldCheck/></div><div className="military-asset-details"><small>Mestre de Armas</small><strong>Não adquirido</strong><p>Adquira no patrimônio para liberar a primeira melhoria gratuita por unidade e o bônus de sobrevivência.</p></div></article>
    <article className="military-asset-card military-asset-inactive"><div className="military-asset-icon"><GraduationCap/></div><div className="military-asset-details"><small>Academia Militar</small><strong>Não adquirida</strong><p>Benefícios de treinamento só se aplicam após compra e conciliação das especializações.</p></div></article>
   </div>}
 </section>;
}
