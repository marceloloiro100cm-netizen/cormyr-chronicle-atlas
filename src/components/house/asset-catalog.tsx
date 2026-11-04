import {useState} from 'react';
import {Castle,Coins,Hammer,Landmark,Mountain,Trees,Users,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {militaryPurchaseReadiness} from './military-assets';
import {SPY_HOLDING_ID_SET} from '@/lib/espionage/spy-defense';
import {spyCatalogExplanation} from '@/lib/espionage/spy-catalog-copy';
import {HouseAssetCard,HouseAssetGrid} from './asset-card';
import {legacyCatalogEffects} from '@/lib/house/holding-accounting';
import {acquiredFirst} from '@/lib/house/acquired-first';
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
function CatalogAssetCard({item,state,catalog,canEdit,busy,onBuy,onCondition,spyMode=false}:{item:CatalogItem;
 state:HouseState;catalog:readonly CatalogItem[];canEdit:boolean;busy:boolean;spyMode?:boolean;
 onBuy:(itemId:string)=>void;onCondition:(args:Record<string,unknown>,reason:string)=>Promise<boolean>;
}){
 const held=state.holdings.filter(h=>h.itemId===item.id&&['active','building'].includes(h.status));
 const owned=held.filter(h=>h.status==='active');
 const building=held.filter(h=>h.status==='building');
 const locations=locationsFor(item,state,owned);
 const acquired=locations.length>0||building.length>0;
 const status=locations.length?locations.join(' · '):
  building.length?'Em construção: '+building.map(h=>h.name).join(' · '):'Não adquirido';
 const spyCopy=spyMode?spyCatalogExplanation(item.id):null;
 const benefits=spyCopy?[...spyCopy.effects]:item.effects.map(e=>e.description).filter(Boolean);
 const summary=spyCopy?.summary??benefits[0]??item.description;
 const readiness=militaryPurchaseReadiness(item,state);
 const buttonText=readiness==='money'?'Sem recursos':
  readiness==='domain'?'Defina um domínio':
  readiness==='requirements'?'Pré-requisitos pendentes':'Comprar';
 return <HouseAssetCard title={item.name} icon={<AssetIcon item={item}/>}
   status={status} description={summary} inactive={!acquired}
   testId={'house-catalog-asset-'+item.id}>
  <h5>{spyCopy?'Para que serve':'Descrição'}</h5>
  <p>{spyCopy?.purpose??item.description}</p>
  {spyCopy&&<p className="house-caption"><strong>Onde funciona:</strong> {spyCopy.reach}</p>}
  <h5>Bônus, efeitos e habilidades</h5>
  {benefits.length?benefits.map((effect,i)=><p className="military-positive" key={i}>{effect}</p>):
   <p>Esta posse pode servir como pré-requisito de outras construções ou características.</p>}
  {!spyCopy&&owned.flatMap(h=>legacyCatalogEffects(h)).map((e,i)=>
   <p key={i}>{e.description}</p>)}
  {spyCopy?.note&&<p className="house-caption">{spyCopy.note}</p>}
  {spyMode&&item.id==='pros-secret-police'&&owned.some(h=>h.effects.some(e=>
   (e.kind==='gain'&&e.resource==='law')||
   (e.kind==='mitigation'&&e.resource==='law')))&&
   <p className="house-warning">Esta posse possui benefícios antigos gravados na ficha que
    diferem da regra confirmada no livro. O Narrador deve conciliar esses registros;
    nenhum valor histórico foi alterado automaticamente.</p>}
  <h5>Custo e regras de compra</h5>
  <p>{item.costs.length?item.costs.map(c=>
   c.amount+' '+RESOURCE_NAMES[c.resource]+' ('+
   (spyMode?(c.mode==='allocation'?'pontos investidos, sem devolução automática em caso de destruição':
    'gasto definitivo do recurso'):COST_TYPE[c.mode])+')').join(' + '):'Custo não definido.'}</p>
  <p>Prazo: {spyMode&&item.duration.months===0&&item.duration.dice
   ?item.duration.dice+(item.duration.dice===1?' dado':' dados')+
    ' de '+item.duration.sides+' faces, em meses'
   :item.duration.months+' meses'+(item.duration.dice?
    (spyMode?' + '+item.duration.dice+(item.duration.dice===1?' dado':' dados')+
     ' de '+item.duration.sides+' faces':' + '+item.duration.dice+'d'+item.duration.sides):'')}.{' '}
   {state.phase==='active'?'Benefícios de obras passam a valer após conclusão.':
    'Na criação, a posse é registrada como preexistente.'}</p>
  <p>{item.repeatable?'Aquisição repetível segundo as regras do local.':
   'Aquisição com restrição de repetição; a compra valida o domínio e os requisitos.'}</p>
  {item.requirements.length>0&&<ul>{item.requirements.map((r,i)=>
   <li key={i}>{formatRequirement(r,catalog)}</li>)}</ul>}
  <p className="house-caption">{spyMode?'Referência: suplemento Prosperidade · posses e melhorias de espionagem':item.source+' · '+item.section}</p>
  {item.pending&&!spyCopy&&<p className="house-warning">Observação da fonte: {item.pending}</p>}
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
 const acquiredIds=new Set(state.holdings.filter(h=>h.status==='active'||h.status==='building').map(h=>h.itemId));
 const visible=items.filter(item=>{
  // Building projects count as already purchased even if bonuses are pending.
  const acquired=acquiredIds.has(item.id);
  return (!category||item.category===category)&&
   (!['economy','spy'].includes(section)||acquisition==='all'||
    (acquisition==='acquired'?acquired:!acquired))&&
   [item.name,item.description,item.original,section==='spy'?spyCatalogExplanation(item.id)?.summary??'':''].join(' ').toLocaleLowerCase('pt-BR')
    .includes(search.toLocaleLowerCase('pt-BR'));
 });
 const orderedVisible=['economy','spy'].includes(section)
  ?acquiredFirst(visible,acquiredIds):visible;
 const acquired=items.filter(item=>locationsFor(item,state,
  state.holdings.filter(h=>h.itemId===item.id&&h.status==='active')).length>0).length;
 return <section className="military-assets house-assets" aria-label={'Catálogo de '+(
  section==='domains'?'Terras':section==='economy'?'Economia':section==='spy'?'Espionagem':'Fortificações')}>
  <div className="house-section-heading">
   <div><p className="campaign-eyebrow">POSSES E CONSTRUÇÕES</p>
    <h3>{section==='domains'?'Terrenos, características e comunidades':
     section==='economy'?'Economia e investimentos':section==='spy'?'Construções e melhorias de espionagem':'Fortificações e defesa'}</h3></div>
  </div>
  <p className="house-caption">{acquired} tipo(s) adquirido(s) · {items.length} opções.
   Selecione um quadro para consultar o que a posse faz, quais bônus concede,
   onde se aplica, custo, tempo de construção e condições.</p>
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
   <HouseAssetGrid>{orderedVisible.slice(0,limit).map(item=><CatalogAssetCard key={item.id}
    item={item} state={state} catalog={catalog} canEdit={canEdit} busy={busy}
    spyMode={section==='spy'} onBuy={onBuy} onCondition={onCondition}/>)}</HouseAssetGrid>}
  {visible.length>limit&&<Button type="button" variant="outline"
   onClick={()=>setLimit(n=>n+24)}>Mostrar mais ({visible.length-limit} restantes)
   <ChevronDown size={16}/></Button>}
  {section==='spy'&&<details className="house-ledger" style={{marginTop:14,padding:12}}>
   <summary>Entenda os termos usados nas construções de espionagem</summary>
   <p><strong>Astúcia:</strong> habilidade do espião usada nos testes. Os níveis
    Verde, Treinada, Veterana e Elite determinam quantos dados ele utiliza.</p>
   <p><strong>Contatos:</strong> rede de conhecidos e informantes que ajuda a obter
    informações. Um bônus de Contatos não equivale a um bônus de Astúcia.</p>
   <p><strong>Sorte da Casa:</strong> rolagem para determinar acontecimentos
    econômicos e políticos da Casa. Bônus de Sorte não são bônus de espionagem.</p>
   <p><strong>Mitigação:</strong> redução de uma perda de recurso quando ocorre
    a situação especificada na regra.</p>
   <p><strong>Recurso alocado:</strong> pontos reservados para manter uma posse.
    <strong> Gasto permanente:</strong> redução definitiva do recurso.</p>
   <p><strong>Dados de seis faces:</strong> quando a regra exige rolar dados para
    o tempo de construção, a quantidade de meses sorteada é adicionada ao prazo fixo.</p>
   <p><strong>Bônus local:</strong> funciona somente no domínio ou comunidade
    protegida. <strong>Bônus geral:</strong> funciona em todos os domínios da Casa,
    quando a construção estiver ativa.</p>
  </details>}
 </section>;
}
