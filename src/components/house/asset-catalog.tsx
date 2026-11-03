import {useState} from 'react';
import {Castle,Coins,Hammer,Landmark,Mountain,Trees,Users,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {militaryPurchaseReadiness} from './military-assets';
import {SPY_HOLDING_ID_SET} from '@/lib/espionage/spy-defense';
import {HouseAssetCard,HouseAssetGrid} from './asset-card';
import {legacyCatalogEffects} from '@/lib/house/holding-accounting';
import {RESOURCE_NAMES,type CatalogItem,type HouseState,type Holding,type Requirement} from '@/lib/house/types';

type Section='domains'|'fortifications'|'economy'|'spy';
type Run=(action:'condition'|'domain_edit'|'domain_delete',args:Record<string,unknown>,reason:string)=>Promise<boolean>;
const LABELS:Record<CatalogItem['category'],string>={
 terrain:'Terrenos',feature:'Características',community:'Comunidades',
 fortification:'Fortificações',estate:'Explorações',lifestyle:'Estilo de vida',
 personage:'Especialistas',settlement:'Assentamentos',improvement:'Melhorias',
 equipment:'Equipamentos',vassal:'Vassalos',
};
const CATEGORY_BY_SECTION:Record<Section,readonly CatalogItem['category'][]>={
 domains:['terrain','feature','community'],fortifications:['fortification'],
 economy:['estate','lifestyle','personage','settlement','improvement','equipment','vassal'],
 spy:['estate','personage','improvement','settlement'],
};
const COST_TYPE={allocation:'alocação',permanent:'permanente'} as const;
const REQUIREMENT_LABELS:Record<Requirement['kind'],string>={
 terrain:'Terreno',feature:'Característica',community:'Comunidade',parent:'Posse principal',
 resource:'Recurso mínimo',water:'Água',fortification:'Fortificação',
 max_community:'Limite de comunidade',max_resource:'Limite de recurso',
 forbidden_feature:'Característica proibida',holding:'Posse necessária',
 forbidden_season:'Estação proibida',any_of:'Uma das opções',
};
function formatRequirement(r:Requirement,catalog:readonly CatalogItem[]){
 const names=r.values?.map(id=>catalog.find(x=>x.id===id)?.name??id).join(', ');
 const amount=r.minimum!==undefined?'mínimo '+r.minimum:r.maximum!==undefined?'máximo '+r.maximum:'';
 return [REQUIREMENT_LABELS[r.kind],names,r.resource?RESOURCE_NAMES[r.resource]:'',amount].filter(Boolean).join(' · ');
}
function AssetIcon({item}:{item:CatalogItem}){
 if(item.category==='terrain')return <Mountain/>;
 if(item.category==='feature')return <Trees/>;
 if(item.category==='community'||item.category==='settlement')return <Users/>;
 if(item.category==='fortification')return <Castle/>;
 if(item.category==='personage')return <Landmark/>;
 if(item.category==='improvement')return <Hammer/>;
 return <Coins/>;
}
function locationsFor(item:CatalogItem,state:HouseState,holdings:Holding[]):string[]{
 const direct=state.domains.filter(d=>(
  item.category==='terrain'&&d.terrain===item.id||
  item.category==='feature'&&d.features.includes(item.id)||
  item.category==='community'&&d.community===item.id
 )).map(d=>d.name);
 const held=holdings.map(h=>h.name);
 return [...new Set([...direct,...held])];
}
function CatalogAssetCard({item,state,catalog,canEdit,busy,onBuy,onCondition}:{item:CatalogItem;
 state:HouseState;catalog:readonly CatalogItem[];canEdit:boolean;busy:boolean;
 onBuy:(itemId:string)=>void;onCondition:(args:Record<string,unknown>,reason:string)=>Promise<boolean>;
}){
 const held=state.holdings.filter(h=>h.itemId===item.id&&['active','building'].includes(h.status));
 const owned=held.filter(h=>h.status==='active');
 const building=held.filter(h=>h.status==='building');
 const locations=locationsFor(item,state,owned);
 const acquired=locations.length>0||building.length>0;
 const status=locations.length?locations.join(' · '):
  building.length?'Em construção: '+building.map(h=>h.name).join(' · '):'Não adquirido';
 const benefits=item.effects.map(e=>e.description).filter(Boolean);
 const summary=benefits[0]??item.description;
 const readiness=militaryPurchaseReadiness(item,state);
 const buttonText=readiness==='money'?'Sem recursos':
  readiness==='domain'?'Defina um domínio':
  readiness==='requirements'?'Pré-requisitos pendentes':'Comprar';
 return <HouseAssetCard title={item.name} icon={<AssetIcon item={item}/>}
   status={status} description={summary} inactive={!acquired}
   testId={'house-catalog-asset-'+item.id}>
  <h5>Descrição</h5>
  <p>{item.description}</p>
  <h5>Bônus, efeitos e habilidades</h5>
  {benefits.length?benefits.map((effect,i)=><p className="military-positive" key={i}>{effect}</p>):
   <p>Esta posse pode servir como pré-requisito de outras construções ou características.</p>}
  {owned.flatMap(h=>legacyCatalogEffects(h)).map((e,i)=>
   <p key={i}>{e.description}</p>)}
  <h5>Custo e regras de compra</h5>
  <p>{item.costs.length?item.costs.map(c=>
   c.amount+' '+RESOURCE_NAMES[c.resource]+' ('+COST_TYPE[c.mode]+')').join(' + '):'Custo não definido.'}</p>
  <p>Prazo: {item.duration.months} meses{item.duration.dice?
   ' + '+item.duration.dice+'d'+item.duration.sides:''}.{' '}
   {state.phase==='active'?'Benefícios de obras passam a valer após conclusão.':
    'Na criação, a posse é registrada como preexistente.'}</p>
  <p>{item.repeatable?'Aquisição repetível segundo as regras do local.':
   'Aquisição com restrição de repetição; a compra valida o domínio e os requisitos.'}</p>
  {item.requirements.length>0&&<ul>{item.requirements.map((r,i)=>
   <li key={i}>{formatRequirement(r,catalog)}</li>)}</ul>}
  <p className="house-caption">{item.source} · {item.section}</p>
  {item.pending&&<p className="house-warning">Observação da fonte: {item.pending}</p>}
  {building.map(h=><p className="house-caption" key={h.id}>
   {h.name}: em construção; efeito não ativo.</p>)}
  {canEdit&&owned.map(h=><details key={h.id} className="house-asset-conditions">
   <summary>Condição de {h.name}</summary>
   <Button variant="outline" type="button" disabled={busy} onClick={()=>void onCondition({
    id:h.id,status:'destroyed'},'Destruição registrada; sem restituição automática.')}>
    Registrar destruição</Button>
   <Button variant="ghost" type="button" disabled={busy} onClick={()=>void onCondition({
    id:h.id,status:'abandoned'},'Abandono registrado; sem restituição automática.')}>
    Abandonar</Button>
  </details>)}
  {canEdit&&<Button type="button" size="sm" disabled={busy||readiness!=='ready'}
   onClick={()=>onBuy(item.id)}>{buttonText}</Button>}
 </HouseAssetCard>;
}
export function HouseAssetCatalog({section,state,catalog,canEdit,busy,onBuy,onCondition}:{
 section:Section;state:HouseState;catalog:readonly CatalogItem[];
 canEdit:boolean;busy:boolean;onBuy:(itemId:string)=>void;
 onCondition:(args:Record<string,unknown>,reason:string)=>Promise<boolean>;
}){
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('');
 const [acquisition,setAcquisition]=useState<'all'|'acquired'|'unacquired'>('all');
 const [limit,setLimit]=useState(24);
 const choices=CATEGORY_BY_SECTION[section];
 const items=catalog.filter(item=>choices.includes(item.category)&&
  (section!=='spy'||SPY_HOLDING_ID_SET.has(item.id)));
 const visible=items.filter(item=>{
  // Construction already commits this asset to the House, but does not grant benefits yet.
  const acquired=state.holdings.some(h=>h.itemId===item.id&&
   (h.status==='active'||h.status==='building'));
  return (!category||item.category===category)&&
   (!['economy','spy'].includes(section)||acquisition==='all'||
    (acquisition==='acquired'?acquired:!acquired))&&
   [item.name,item.description,item.original].join(' ').toLocaleLowerCase('pt-BR')
    .includes(search.toLocaleLowerCase('pt-BR'));
 });
 const acquired=items.filter(item=>locationsFor(item,state,
  state.holdings.filter(h=>h.itemId===item.id&&h.status==='active')).length>0).length;
 return <section className="military-assets house-assets" aria-label={'Catálogo de '+(
  section==='domains'?'Terras':section==='economy'?'Economia':section==='spy'?'Espionagem':'Fortificações')}>
  <div className="house-section-heading">
   <div><p className="campaign-eyebrow">POSSES E CONSTRUÇÕES</p>
    <h3>{section==='domains'?'Terrenos, características e comunidades':
     section==='economy'?'Economia e investimentos':section==='spy'?'Posses de Espionagem':'Fortificações e defesa'}</h3></div>
  </div>
  <p className="house-caption">{acquired} tipo(s) adquirido(s) · {items.length} opções.
   Selecione um quadro para consultar descrição, bônus, custo e condições.</p>
  <div className="house-input-grid house-asset-filters">
   <label>Buscar quadro<input type="search" value={search} placeholder="Nome, benefício ou descrição"
    onChange={e=>{setSearch(e.target.value);setLimit(24);}}/></label>
   <label>Categoria<select value={category} onChange={e=>{setCategory(e.target.value);setLimit(24);}}>
    <option value="">Todas as categorias</option>
    {choices.map(c=><option key={c} value={c}>{LABELS[c]}</option>)}
   </select></label>
   {(section==='economy'||section==='spy')&&<label>Aquisição<select value={acquisition}
    onChange={e=>{setAcquisition(e.target.value as 'all'|'acquired'|'unacquired');setLimit(24);}}>
    <option value="all">Todos</option>
    <option value="acquired">Adquiridos</option>
    <option value="unacquired">Não adquiridos</option>
   </select></label>}
  </div>
  {visible.length===0?<p className="campaign-empty">Nenhuma posse encontrada para estes filtros.</p>:
   <HouseAssetGrid>{visible.slice(0,limit).map(item=><CatalogAssetCard key={item.id}
    item={item} state={state} catalog={catalog} canEdit={canEdit} busy={busy}
    onBuy={onBuy} onCondition={onCondition}/>)}</HouseAssetGrid>}
  {visible.length>limit&&<Button type="button" variant="outline"
   onClick={()=>setLimit(n=>n+24)}>Mostrar mais ({visible.length-limit} restantes)
   <ChevronDown size={16}/></Button>}
 </section>;
}
