import {useState} from 'react';
import {Anchor,Castle,ChevronDown,Coins,GraduationCap,Hammer,PenTool,ShieldCheck,Swords} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {HouseAssetCard,HouseAssetGrid} from './asset-card';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {acquiredFirst} from '@/lib/house/acquired-first';
import {activeHoldings,quote,UNIT_TYPES} from '@/lib/house/engine';
import {MILITARY_HOLDINGS,MILITARY_HOLDING_BENEFITS} from '@/lib/house/unit-progression';
import {RESOURCE_NAMES,SKILLS,SKILL_NAMES,type CatalogItem,type HouseState,type Holding,type Requirement} from '@/lib/house/types';

const militaryItems=CORE_CATALOG.filter(item=>MILITARY_HOLDINGS.includes(item.id));
const militaryItemIds=new Set(MILITARY_HOLDINGS);

const COST_TYPE={allocation:'alocação',permanent:'permanente'} as const;
const REQUIREMENTS:Record<Requirement['kind'],string>={
 terrain:'Terreno',feature:'Característica',community:'Comunidade',parent:'Posse principal',
 resource:'Recurso mínimo',water:'Acesso à água',fortification:'Fortificação',
 max_community:'Comunidade máxima',max_resource:'Limite de recurso',
 forbidden_feature:'Característica proibida',holding:'Posse necessária',
 forbidden_season:'Estação proibida',any_of:'Uma das alternativas',
};
function requirementDescription(rule:Requirement){
 const values=rule.values?.map(id=>CORE_CATALOG.find(x=>x.id===id)?.name??id).join(', ');
 const resource=rule.resource?RESOURCE_NAMES[rule.resource]:'';
 const limit=rule.minimum!==undefined?'mínimo '+rule.minimum:rule.maximum!==undefined?'máximo '+rule.maximum:'';
 return [REQUIREMENTS[rule.kind],values,resource,limit].filter(Boolean).join(' · ');
}
function purchaseOptions(item:CatalogItem,state:HouseState){
 return state.domains.flatMap(domain=>{
  const parents=item.requirements.filter(r=>r.kind==='parent').flatMap(r=>
   state.holdings.filter(h=>h.domainId===domain.id&&h.status==='active'&&r.values?.includes(h.itemId)).map(h=>h.id));
  const parentIds=item.category==='improvement'?(parents.length?parents:[undefined]):[undefined];
  const supportIds=item.category==='settlement'?
   [undefined,...state.holdings.filter(h=>h.domainId===domain.id&&h.status==='active'&&
    ['tower','hall','castle','small-castle','superior-castle','pros-trading-inn'].includes(h.itemId)).map(h=>h.id)]:[undefined];
  const upgradeIds=item.category==='fortification'?
   [undefined,...state.holdings.filter(h=>h.domainId===domain.id&&['active','building'].includes(h.status)&&
    ['tower','hall','small-castle','castle','superior-castle'].includes(h.itemId)).map(h=>h.id)]:[undefined];
  return parentIds.flatMap(parentId=>supportIds.flatMap(supportId=>upgradeIds.map(replaceId=>
   quote(item,state,domain.id,parentId,supportId,replaceId))));
 });
}
export function militaryPurchaseReadiness(item:CatalogItem,state:HouseState):'ready'|'money'|'requirements'|'domain'{
 if(!state.domains.length)return 'domain';
 const offers=purchaseOptions(item,state);
 if(offers.some(q=>q.errors.length===0))return 'ready';
 if(offers.length&&!offers.some(q=>q.errors.every(e=>!e.startsWith('Saldo insuficiente:'))))return 'money';
 return 'requirements';
}
function AssetIcon({item}:{item:CatalogItem}){
 if(item.id.includes('academy'))return <GraduationCap/>;
 if(item.id.includes('master-of-arms'))return <ShieldCheck/>;
 if(item.id.includes('port')||item.id.includes('ship')||item.id.includes('dock'))return <Anchor/>;
 if(item.category==='fortification')return <Castle/>;
 if(item.id.includes('engineer')||item.id.includes('stonemason'))return <Hammer/>;
 if(item.id.includes('dog')||item.id.includes('war')||item.id.includes('military'))return <Swords/>;
 if(item.category==='improvement')return <Coins/>;
 return <Castle/>;
}
function RenameAsset({holding,busy,onRename}:{holding:Holding;busy:boolean;onRename:(args:Record<string,unknown>)=>Promise<boolean>}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(holding.name);
 if(!editing)return <Button type="button" size="sm" variant="ghost" disabled={busy}
   onClick={()=>{setName(holding.name);setEditing(true);}}><PenTool size={14}/>Dar nome</Button>;
 return <form className="military-rename" onSubmit={async e=>{
  e.preventDefault();if(await onRename({holdingId:holding.id,name}))setEditing(false);
 }}>
  <label>Nome do cargo ou da construção<input required minLength={2} maxLength={160}
   value={name} onChange={e=>setName(e.target.value)}/></label>
  <Button disabled={busy||!name.trim()} size="sm">Salvar nome</Button>
  <Button type="button" variant="outline" size="sm" onClick={()=>setEditing(false)}>Cancelar</Button>
 </form>;
}
function MilitaryAssetCard({item,holdings,state,canEdit,busy,onRename,onBuy,onConfigure}:{
 item:CatalogItem;holdings:Holding[];state:HouseState;canEdit:boolean;busy:boolean;
 onRename:(args:Record<string,unknown>)=>Promise<boolean>;
 onBuy:(itemId:string)=>void;onConfigure:(args:Record<string,unknown>)=>Promise<boolean>;
}){
 const owned=holdings.filter(h=>h.status==='active');
 const building=holdings.filter(h=>h.status==='building');
 const acquired=owned.length+building.length>0;
 const mayBuy=!acquired||item.repeatable;
 const readiness=mayBuy?militaryPurchaseReadiness(item,state):'requirements';
 const prerequisites=militaryItems.filter(other=>other.requirements.some(r=>r.kind==='parent'&&r.values?.includes(item.id)));
 const civilianParents=item.requirements.filter(r=>r.kind==='parent').flatMap(r=>r.values??[]).filter(id=>!militaryItemIds.has(id));
 const status=owned.length?owned.map(h=>h.name).join(' · '):
  building.length?'Em construção: '+building.map(h=>h.name).join(' · '):item.id==='pros-military-academy'?'Não adquirida':'Não adquirido';
 const buttonLabel=readiness==='money'?'Sem recursos':
  readiness==='domain'?'Defina um domínio':
  readiness==='requirements'?'Pré-requisitos pendentes':'Comprar';
 return <HouseAssetCard title={item.name} status={status}
  description={MILITARY_HOLDING_BENEFITS[item.id]??item.description}
  icon={<AssetIcon item={item}/>} inactive={!acquired}>
   <h5>Descrição</h5><p>{item.description}</p>
   <h5>Efeito militar</h5><p className="military-positive">{MILITARY_HOLDING_BENEFITS[item.id]}</p>
   <h5>Demais efeitos e regras da fonte</h5>
   {item.effects.length?item.effects.map((effect,i)=><p key={i}>{effect.description}</p>):
    <p>Esta posse é necessária para adquirir ou melhorar instalações militares associadas.</p>}
   {prerequisites.length>0&&<p>Desbloqueia: {prerequisites.map(x=>x.name).join(', ')}.</p>}
   {civilianParents.length>0&&<p className="house-caption">Pré-requisito civil: {civilianParents.map(id=>CORE_CATALOG.find(x=>x.id===id)?.name??id).join(', ')}. Adquira-o em Economia e investimentos; não aparece entre as posses militares.</p>}
   <h5>Custo e regras de compra</h5>
   <p>{item.costs.length?item.costs.map(c=>c.amount+' '+RESOURCE_NAMES[c.resource]+' ('+COST_TYPE[c.mode]+')').join(' + '):'Custo não definido.'}</p>
   <p>Prazo: {item.duration.months} meses{item.duration.dice?' + '+item.duration.dice+'d'+item.duration.sides:''}. {state.phase==='active'?'O bônus só fica ativo após a conclusão da obra.':'Na criação, a posse é registrada como preexistente.'}</p>
   <p>{item.repeatable?'Compra repetível conforme as regras locais.':'Uma compra por local ou posse principal, conforme as regras.'}</p>
   {item.requirements.length>0&&<ul>{item.requirements.map((r,i)=><li key={i}>{requirementDescription(r)}</li>)}</ul>}
   <p className="house-caption">{item.source} · {item.section}</p>
   {item.pending&&<p className="house-warning">Observação da fonte: {item.pending}</p>}
   {building.map(h=><p className="house-caption" key={h.id}>{h.name}: em construção; bônus ainda não ativo.</p>)}
   {canEdit&&owned.map(h=><RenameAsset key={h.id} holding={h} busy={busy} onRename={onRename}/>)}
   {canEdit&&owned.map(h=>h.itemId==='pros-military-academy--core-training'?<form className="campaign-form" key={'skill-'+h.id} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void onConfigure({holdingId:h.id,kind:'skill',value:String(f.get('skill'))});}}><label>Habilidade concedida a todas as unidades<select name="skill" defaultValue={h.militarySkill??''} required><option value="">Escolha uma habilidade</option>{SKILLS.map(id=><option key={id} value={id}>{SKILL_NAMES[id]} +1</option>)}</select></label><Button disabled={busy} size="sm">Aplicar treinamento fundamental</Button></form>:null)}
   {canEdit&&owned.map(h=>h.itemId==='pros-master-of-arms--field-master'?<form className="campaign-form" key={'type-'+h.id} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void onConfigure({holdingId:h.id,kind:'type',value:String(f.get('type'))});}}><label>Especialidade do Mestre de Campo<select name="type" defaultValue={h.militaryTypeId??''} required><option value="">Escolha tipo de unidade</option>{UNIT_TYPES.map(t=><option key={t.id} value={t.id}>{t.name} (−1 Poder ao recrutar)</option>)}</select></label><Button disabled={busy} size="sm">Definir especialidade</Button></form>:null)}
   {canEdit&&owned.filter(h=>['pros-abbey--warrior-brotherhood','pros-trading-inn'].includes(h.itemId)).map(h=><form className="campaign-form" key={'unit-'+h.id} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void onConfigure({holdingId:h.id,kind:'unit',value:String(f.get('unit'))});}}><label>Unidade protegida por esta instalação (+2 Defesa)<select name="unit" defaultValue={h.militaryUnitId??''}><option value="">Nenhuma unidade</option>{state.units.filter(u=>!u.destroyed&&u.domainId===h.domainId).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><Button disabled={busy} size="sm">Vincular defesa</Button></form>)}
   {canEdit&&mayBuy&&<Button size="sm" type="button" disabled={busy||readiness!=='ready'}
     onClick={()=>onBuy(item.id)}>{buttonLabel}</Button>}
 </HouseAssetCard>;
}
export function MilitaryAssets({state,canEdit,busy,onRename,onBuy,onConfigure=async()=>false}:{
 state:HouseState;canEdit:boolean;busy:boolean;
 onRename:(args:Record<string,unknown>)=>Promise<boolean>;
 onBuy:(itemId:string)=>void;onConfigure?:(args:Record<string,unknown>)=>Promise<boolean>;
}){
 const [expanded,setExpanded]=useState(true);
 const holdings=state.holdings.filter(h=>militaryItemIds.has(h.itemId)&&['active','building'].includes(h.status));
 const activeIds=new Set(activeHoldings(state).filter(h=>militaryItemIds.has(h.itemId)).map(h=>h.itemId));
 const acquiredIds=new Set(holdings.map(h=>h.itemId));
 const orderedItems=acquiredFirst(militaryItems,acquiredIds);
 return <section className="military-assets">
  <div className="house-section-heading military-assets-heading">
   <div><p className="campaign-eyebrow">BÔNUS E INSTALAÇÕES</p><h3>Gestão militar da Casa</h3></div>
   <Button type="button" variant="outline" size="sm" aria-expanded={expanded}
    aria-controls="military-assets-list" onClick={()=>setExpanded(v=>!v)}>
    <ChevronDown size={17} className={expanded?'military-asset-chevron-open':''}/>
    {expanded?'Minimizar':'Expandir'}
   </Button>
  </div>
  {expanded&&<div id="military-assets-list">
   <p className="house-caption">{activeIds.size} tipo(s) ativo(s) · {militaryItems.length} construções, especialistas e melhorias com efeito militar direto. Selecione um card para consultar seus detalhes.</p>
   <HouseAssetGrid>{orderedItems.map(item=>
    <MilitaryAssetCard key={item.id} item={item} holdings={holdings.filter(h=>h.itemId===item.id)}
     state={state} canEdit={canEdit} busy={busy} onRename={onRename} onBuy={onBuy} onConfigure={onConfigure}/>)}</HouseAssetGrid>
  </div>}
 </section>;
}
