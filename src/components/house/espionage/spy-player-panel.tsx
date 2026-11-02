import {useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {balances} from '@/lib/house/engine';
import type {CatalogItem,HouseState} from '@/lib/house/types';
import {deriveSpyCapacity,quoteSpyContractor,quoteSpyPurchase} from '@/lib/espionage/economy';
import {SPY_MISSIONS} from '@/lib/espionage/missions';
import {SPY_REQUEST_FIELDS,type SpyOperation} from '@/lib/espionage/contracts';
import {REGIONS} from '@/lib/house/regions';

type Tab='overview'|'agents'|'missions'|'routes'|'dossiers'|'reports'|'holdings';
const TABS:[Tab,string][]=[
 ['overview','Visão geral'],['agents','Agentes'],['missions','Missões'],['routes','Rotas'],
 ['dossiers','Dossiês'],['reports','Relatórios'],['holdings','Estruturas'],
];
type Props={
 houseName:string;state:HouseState;catalog:CatalogItem[];houses:{id:string;name:string}[];
 canEdit:boolean;onOpenPurchase:(itemId:string)=>void;
};
type MissionKind=SpyOperation['missionKind'];
type TargetKind=SpyOperation['targetType'];
type Mode='foot'|'horse'|'caravan'|'ship';

/** Modo de prévia: sem storage de missão, sem consulta a casas-alvo e sem fingir que há missiva liberada. */
export function SpyPlayerPanel({houseName,state,catalog,houses,canEdit,onOpenPurchase}:Props){
 const [tab,setTab]=useState<Tab>('overview');
 const [kind,setKind]=useState<MissionKind>('regional_recon');
 const [targetType,setTargetType]=useState<TargetKind>('region');
 const [targetId,setTargetId]=useState('');
 const [requested,setRequested]=useState<string[]>([]);
 const [draftMessage,setDraftMessage]=useState('');
 const [origin,setOrigin]=useState('');
 const [destination,setDestination]=useState('');
 const [mode,setMode]=useState<Mode>('horse');
 const [stops,setStops]=useState<string[]>([]);
 const [showSampleLetter,setShowSampleLetter]=useState(false);
 const [routeMessage,setRouteMessage]=useState('');
 const cap=deriveSpyCapacity(state);
 const bal=balances(state);
 const contractor=quoteSpyContractor(state);
 const mission=SPY_MISSIONS[kind];
 const regions=Object.entries(REGIONS).map(([id,r])=>({id,name:r.name}));
 const domains=state.domains.map(d=>({id:d.id,name:d.name}));
 const destinations=targetType==='region'?regions:targetType==='house'?houses:[];
 const buyable=useMemo(()=>{
  const domainId=state.domains[0]?.id;
  if(!domainId)return {canPurchase:false,errors:['Cadastre um domínio antes de adquirir uma Rede.']};
  const q=quoteSpyPurchase(state,{itemId:'pros-spy-network',domainId},catalog);
  return {canPurchase:q.canPurchase,errors:q.errors};
 },[state,catalog]);
 const changeMission=(value:MissionKind)=>{
  setKind(value);setTargetType(SPY_MISSIONS[value].targets[0]!);
  setRequested([]);setTargetId('');setDraftMessage('');
 };
 const setTarget=(value:TargetKind)=>{setTargetType(value);setTargetId('');setRequested([]);setDraftMessage('');};
 const choices=mission.fields.filter(f=>{
  const item=SPY_REQUEST_FIELDS.find(x=>x.code===f);
  return targetType==='region'?item?.kind==='region':targetType==='person'?
   ['noble_family','house_family_succession','house_lord'].includes(f):item?.kind==='house'||f==='noble_family';
 });
 function missionPreview(){
  if(!targetId||!requested.length){setDraftMessage('Informe um alvo e selecione ao menos um tópico.');return;}
  if(!cap.confirmedNetworkCells){setDraftMessage('A Casa ainda não possui agentes confirmados; a missão não pode ser enviada.');return;}
  setDraftMessage('Prévia montada: '+requested.length+' tópico(s) para '+targetId+
    '. Dificuldade sob avaliação. Envio e designação aguardam a integração segura do Lote 10.');
 }
 const cardStyle={border:'1px solid var(--border, #9996)',borderRadius:10,padding:14,minWidth:0} as const;
 return <section className="house-panel" aria-label={'Espionagem da Casa '+houseName}>
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">INTELIGÊNCIA DA CASA</p>
   <h3>Rede de Espiões</h3>
  </div></div>
  <p role="note" className="house-caption">Marco B · prévia interativa. Compras de posses existentes usam o fluxo da Casa; missões, rotas, contratações avulsas e dossiês ainda não são gravados nem publicados.</p>
  <nav aria-label="Seções de espionagem" style={{display:'flex',flexWrap:'wrap',gap:8,marginBlock:12}}>
   {TABS.map(([id,label])=><Button key={id} size="sm" variant={tab===id?'default':'outline'} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</Button>)}
  </nav>
  {(tab==='overview'||tab==='agents')&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))',gap:12}}>
   <div style={cardStyle}><small>Agentes de Rede habilitados</small><h3>{cap.confirmedNetworkCells}</h3><p>{cap.confirmedBaseCells} da Rede + {cap.confirmedExpandedCells} de melhorias ativas</p></div>
   <div style={cardStyle}><small>Riqueza da Casa</small><h3>{bal.available.wealth} disponível</h3><p>{bal.allocated.wealth} alocada · {bal.total.wealth} total</p></div>
   <div style={cardStyle}><small>Contratação avulsa</small><h3>5 Riqueza / 2 agentes</h3><p>Repetível · {contractor.status==='preview_only'?'saldo preliminar suficiente':'sem saldo preliminar'} · compra ainda indisponível</p></div>
   <div style={cardStyle}><small>Registro operacional</small><h3>Conciliação necessária</h3><p>As vagas habilitadas não são agentes designáveis até a confirmação de IDs e localidades.</p></div>
  </div>}
  {tab==='agents'&&<div style={{marginTop:16}}>
   <h4>Origem dos agentes</h4>
   {cap.slots.length===0?<p>Sem vagas de espionagem em posses ativas.</p>:
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>
    {cap.slots.map(slot=><div style={cardStyle} key={slot.sourceKind+slot.sourceHoldingId+slot.slot}>
     <strong>{slot.sourceKind==='base'?'Agente inicial':'Agente da Rede Ampliada '+(slot.slot+1)}</strong>
     <p>Domínio: {domains.find(d=>d.id===slot.domainId)?.name??'Não identificado'}</p>
     <p>Estado: aguardando conciliação com registro operacional</p>
    </div>)}</div>}
  </div>}
  {tab==='missions'&&<div style={{display:'grid',gap:12,maxWidth:750}}>
   <h4>Planejar investigação</h4>
   <label>Tipo de missão <select value={kind} onChange={e=>changeMission(e.target.value as MissionKind)}>
    {Object.entries(SPY_MISSIONS).map(([id,m])=><option key={id} value={id}>{m.title}</option>)}
   </select></label>
   <p>{mission.description}</p>
   <label>Tipo de alvo <select value={targetType} onChange={e=>setTarget(e.target.value as TargetKind)}>
    {mission.targets.map(k=><option key={k} value={k}>{k==='house'?'Casa':k==='region'?'Região':'Pessoa'}</option>)}
   </select></label>
   <label>Alvo {targetType==='person'
    ?<input type="text" value={targetId} onChange={e=>setTargetId(e.target.value)} placeholder="Identificador da pessoa (sujeito à autorização)" maxLength={120}/>
    :<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Selecione</option>
      {destinations.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}
     </select>}</label>
   <fieldset style={cardStyle}><legend>Informações a solicitar</legend>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:8}}>
    {choices.map(field=><label key={field} style={{display:'flex',gap:8,alignItems:'center'}}>
     <input type="checkbox" checked={requested.includes(field)} onChange={e=>setRequested(prev=>e.target.checked?[...prev,field]:prev.filter(f=>f!==field))}/>
     {field.replaceAll('_',' ')}
    </label>)}</div>
   </fieldset>
   <Button type="button" onClick={missionPreview}>Visualizar rascunho</Button>
   {draftMessage&&<><p role="status" className="house-caption">{draftMessage}</p>
    <ol aria-label="Fases da missão" style={{display:'flex',flexWrap:'wrap',gap:18}}>
     {['Rascunho','Viagem pendente','Investigação','Revisão do Narrador','Retorno','Carta autorizada'].map(t=><li key={t}>{t}</li>)}
    </ol></>}
  </div>}
  {tab==='routes'&&<div style={{display:'grid',gap:12,maxWidth:720}}>
   <h4>Planejador de rotas</h4>
   <p>Escolha origem e destino. O tempo somente será exibido quando o Narrador cadastrar uma ligação homologada.</p>
   <label>Origem <select value={origin} onChange={e=>{setOrigin(e.target.value);setRouteMessage('');}}>
    <option value="">Selecione</option>
    {domains.map(d=><option key={d.id} value={d.id}>{d.name} · Domínio</option>)}
    {regions.map(x=><option key={x.id} value={x.id}>{x.name} · Região</option>)}
   </select></label>
   <label>Destino <select value={destination} onChange={e=>{setDestination(e.target.value);setRouteMessage('');}}>
    <option value="">Selecione</option>
    {regions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    {domains.map(d=><option key={d.id} value={d.id}>{d.name} · Retorno</option>)}
   </select></label>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    <Button type="button" size="sm" variant="outline" disabled={!destination} onClick={()=>{
     setStops(prev=>[...prev,destination]);setOrigin(destination);setDestination('');setRouteMessage('');
    }}>Adicionar etapa</Button>
    <Button type="button" size="sm" variant="outline" disabled={!stops.length} onClick={()=>{
     setStops(prev=>prev.slice(0,-1));setRouteMessage('');
    }}>Remover última etapa</Button>
    <Button type="button" size="sm" variant="outline" disabled={!origin} onClick={()=>setDestination(origin)}>Planejar retorno</Button>
   </div>
   {stops.length>0&&<p role="status">Etapas previstas (sem dias homologados): {stops.map(id=>
    [...regions,...domains].find(x=>x.id===id)?.name??id).join(' → ')}.</p>}
   <label>Meio de transporte <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>
    <option value="foot">A pé</option><option value="horse">A cavalo</option>
    <option value="caravan">Caravana</option><option value="ship">Navio</option>
   </select></label>
   <Button onClick={()=>setRouteMessage(origin&&destination&&origin!==destination
    ?'Rota não cadastrada: é necessário homologar arestas, modal e dias-base antes da viagem.'
    :'Informe dois locais distintos para consultar uma rota.')} type="button">Consultar percurso</Button>
   {routeMessage&&<p role="status" className="house-warning">{routeMessage}</p>}
  </div>}
  {tab==='dossiers'&&<div><h4>Dossiês reservados</h4>
   <p>O Lote 7 já possui motor de fatos e cobertura. Os registros reais dependem das tabelas e políticas de acesso do Lote 10. Nenhuma ficha adversária é consultada.</p>
   <div style={{...cardStyle,maxWidth:560}}><p className="campaign-eyebrow">EXEMPLO FICTÍCIO · NÃO É DADO DA CAMPANHA</p>
    <strong>Casa de Demonstração</strong>
    <p>Cobertura do objetivo: 4 de 8 campos (50%).</p>
    <progress value={4} max={8} aria-label="Cobertura demonstrativa: quatro de oito campos"/>
    <p>Confiabilidade: parcial. Rumores e informações antigas permanecem identificados.</p>
   </div>
  </div>}
  {tab==='reports'&&<div><h4>Cartas de inteligência</h4>
   <p>Relatórios selados não aparecem a jogadores. Cartas reais só serão consultadas após a implementação do Lote 10.</p>
   <div style={{...cardStyle,maxWidth:640}}><p className="campaign-eyebrow">CARTA FICTÍCIA DE DEMONSTRAÇÃO</p>
    <strong>ES-DEMO · Relatório exemplificativo</strong>
    <p>4/8 tópicos autorizados · Cobertura 50% · Confiabilidade parcial.</p>
    <Button type="button" variant="outline" onClick={()=>setShowSampleLetter(value=>!value)}
     aria-expanded={showSampleLetter}>{showSampleLetter?'Ocultar exemplo':'Ler exemplo de carta'}</Button>
    {showSampleLetter&&<div style={{padding:14,marginTop:12,border:'1px solid var(--border, #9996)',borderRadius:10}}>
     <p>À Casa remetente — Selo de demonstração.</p>
     <p>Foram examinados oito tópicos autorizáveis. Quatro receberam observações nesta simulação; os demais continuam desconhecidos.</p>
     <p>Os fatos reais e a identidade de um alvo não são carregados aqui. O conteúdo exibido é ilustrativo.</p>
    </div>}
   </div>
  </div>}
  {tab==='holdings'&&<div style={{display:'grid',gap:12}}>
   <h4>Estruturas e contratações</h4>
   <div style={{...cardStyle,maxWidth:680}}><strong>Rede de Espiões</strong><p>10 Riqueza alocada · 1 agente após ativação</p>
    <Button disabled={!canEdit||!buyable.canPurchase} onClick={()=>onOpenPurchase('pros-spy-network')}>Comprar pelo cadastro da Casa</Button>
    {!buyable.canPurchase&&<p role="note">{buyable.errors.join(' ')||'Compra indisponível.'}</p>}
   </div>
   <div style={{...cardStyle,maxWidth:680}}><strong>Rede Ampliada</strong><p>5 Riqueza alocada · 2 agentes por melhoria ativa · repetível</p>
    <p>Utilize o cadastro de posses da Casa para selecionar uma Rede principal ativa.</p>
   </div>
   <div style={{...cardStyle,maxWidth:680}}><strong>Contratação avulsa</strong><p>5 Riqueza alocada · 2 agentes · compra repetível</p>
    <Button disabled>Contratar (aguardando transação segura)</Button>
    <p>Não há cobrança, contratação ou reserva até a implementação do Lote 10.</p>
   </div>
  </div>}
 </section>;
}
