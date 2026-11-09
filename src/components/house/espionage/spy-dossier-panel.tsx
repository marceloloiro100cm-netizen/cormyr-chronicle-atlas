import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Eye,ScrollText,Shield,Swords,Castle,LockKeyhole,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {RESOURCE_NAMES} from '@/lib/house/types';
import {dateKey,formatDate,parseDate} from '@/lib/calendar/harptos';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {spyIntelligenceFreshness,spyDossierLastVerified}
 from '@/lib/espionage/spy-intelligence-freshness';
import {SPY_INTELLIGENCE_OBJECTIVES,
 SPY_INTELLIGENCE_RESOURCE_KEYS,type SpyIntelligenceObjective}
 from '@/lib/espionage/spy-intelligence-rules';
import {readSpyDossiersBrowser,readSpyIntelligenceOptionsBrowser,
 readSpyIntelligencePendingBrowser,adjustSpyIntelligence,retrySpyIntelligence,
 type SpyDossier} from '@/lib/espionage/spy-dossier.functions';
import {spyDossierActionOptions} from '@/lib/espionage/spy-dossier-action-options';
import {filterSpyDossiers,paginateSpyDossiers,spyDossierPendingHouseNames,
 type SpyDossierSort,type SpyDossierProgress,type SpyDossierFreshness} from '@/lib/espionage/spy-dossier-list';
import './spy-dossier.css';
import {SpyNarratorOperationsCenter} from './spy-narrator-operations-center';
import {SpyDossierReportActions,SpyDossierSummary,SpyDossierVersionHistory}
 from './spy-dossier-report-actions';

const safeDate=(date:string)=>parseDate(date)?formatDate(date):date;
const labels=Object.fromEntries(SPY_INTELLIGENCE_OBJECTIVES.map(item=>[item.id,item.label]));
function count(d:SpyDossier,objective:SpyIntelligenceObjective){
 return d.findings.filter(f=>f.objective===objective).length;
}
function DossierView({dossier,narrator=false}:{dossier:SpyDossier;narrator?:boolean}){
 const [tab,setTab]=useState<SpyIntelligenceObjective>('house_resources');
 const time=useCampaignTime();
 const official=time.data&&!time.isError?dateKey(time.data):null;
 const last=spyDossierLastVerified(dossier);
 const freshness=last?spyIntelligenceFreshness(last,official):null;
 const found=dossier.findings.filter(f=>f.objective===tab);
 return <section className="spy-dossier-sheet" aria-label={'Dossiê da Casa '+dossier.targetHouseName}>
  <header className="spy-dossier-sheet-header">
   <div><p className="campaign-eyebrow">RELATÓRIO DE INTELIGÊNCIA · CONFIDENCIAL</p>
    <h3>Casa {dossier.targetHouseName}</h3>
    <small>Informações pertencentes à Casa {dossier.ownerHouseName}</small>
    {freshness&&<small className="spy-dossier-freshness"
     data-freshness={freshness.tier}>{freshness.label}</small>}
   </div><ScrollText size={30} aria-hidden="true"/>
  </header>
  <SpyDossierSummary dossier={dossier} officialDate={official}/>
  <SpyDossierReportActions dossier={dossier} officialDate={official}/>
  <div className="spy-dossier-tabs" role="group" aria-label="Modalidade do dossiê">
   {SPY_INTELLIGENCE_OBJECTIVES.map(item=><Button type="button" key={item.id}
    variant={tab===item.id?'default':'outline'} aria-pressed={tab===item.id}
    onClick={()=>setTab(item.id)}>{item.id==='army'?<Swords size={16}/>:item.id==='possessions'?<Castle size={16}/>:<Shield size={16}/>}
    {item.label}</Button>)}
  </div>
  <div className="spy-dossier-sheet-body">
   <h4>{labels[tab]} · {count(dossier,tab)}{tab==='house_resources'?'/7':''}</h4>
   {tab==='house_resources'?<>
    <div className="spy-dossier-progress" aria-label={count(dossier,tab)+' de 7 atributos conhecidos'}>
     {SPY_INTELLIGENCE_RESOURCE_KEYS.map(key=><span key={key}
      className={found.some(f=>f.key===key)?'known':'unknown'}/>)}
    </div>
    <div className="spy-dossier-resource-grid">
     {SPY_INTELLIGENCE_RESOURCE_KEYS.map(key=>{
      const row=found.find(f=>f.key===key);
      return <div className="spy-dossier-item" key={key}>
       <strong>{RESOURCE_NAMES[key]}</strong>
       {row?<span>{String(row.snapshot['value']??'—')}</span>:
        <span className="spy-dossier-unknown"><LockKeyhole size={13}/>Desconhecido</span>}
       {row&&<small>Confirmado: {safeDate(row.verifiedDate)}
        {' '}· {spyIntelligenceFreshness(row.verifiedDate,official).label}</small>}
      </div>;
     })}
    </div>
   </>:found.length?<div className="spy-dossier-discoveries">
    {found.map(f=><article className="spy-dossier-item" key={f.id}>
     <strong>{String(f.snapshot['name']??f.key)}</strong>
     <span>{String(f.snapshot['category']??
      (Array.isArray(f.snapshot['types'])?f.snapshot['types'].join(', '):'Unidade militar'))}</span>
     {tab==='army'&&typeof f.snapshot['strength']==='number'&&
      <small>Força registrada: {f.snapshot['strength']}</small>}
     <small>Última confirmação: {safeDate(f.verifiedDate)}
      {' '}· {spyIntelligenceFreshness(f.verifiedDate,official).label}</small>
    </article>)}
   </div>:<p className="house-caption">Nenhuma informação desta categoria foi descoberta.</p>}
   {tab!=='house_resources'&&
    <p className="house-caption">A quantidade real de {tab==='army'?'unidades militares':'posses'}
     do alvo é desconhecida. Os dados apresentados são históricos.</p>}
  </div>
  <SpyDossierVersionHistory dossier={dossier} narrator={narrator}/>
 </section>;
}
function DossierCard({dossier,active,onSelect}:{dossier:SpyDossier;active:boolean;onSelect:()=>void}){
 return <button type="button" onClick={onSelect}
  className={'spy-dossier-card'+(active?' is-selected':'')}
  aria-pressed={active}>
  <strong>Casa {dossier.targetHouseName}</strong>
  <span>Recursos: {count(dossier,'house_resources')}/7</span>
  <span>Exército: {count(dossier,'army')} conhecido(s)</span>
  <span>Posses: {count(dossier,'possessions')} conhecida(s)</span>
  <small>Abrir relatório</small>
 </button>;
}
function DossierCollection({dossiers,title,summary,onRefresh,refreshing=false}:{
 dossiers:SpyDossier[];title:string;summary?:string;
 onRefresh?:()=>void;refreshing?:boolean;
}){
 const [selected,setSelected]=useState<string>('');
 const [targetFilter,setTargetFilter]=useState('');
 const [regionFilter,setRegionFilter]=useState('');
 const [progress,setProgress]=useState<SpyDossierProgress>('all');
 const [freshness,setFreshness]=useState<SpyDossierFreshness>('all');
 const time=useCampaignTime();
 const officialDate=time.data&&!time.isError?dateKey(time.data):null;
 const [sort,setSort]=useState<SpyDossierSort>('recent');
 const [page,setPage]=useState(1);
 const regions=[...new Set(dossiers.map(d=>d.targetRegion??'').filter(Boolean))].sort();
 const visible=filterSpyDossiers(dossiers,{
  targetSearch:targetFilter,region:regionFilter,progress,sort,
  freshness,officialDate,
 });
 const paged=paginateSpyDossiers(visible,page,12);
 const chosen=paged.items.find(d=>d.id===selected)??paged.items[0];
 return <section className="house-panel spy-dossier-panel" aria-label={title}>
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">CORMYR · INTELIGÊNCIA</p>
   <h3><Eye size={18} style={{display:'inline-block',verticalAlign:'middle'}}/> {title}</h3>
   {summary&&<p className="house-caption">{summary}</p>}
  </div>{onRefresh&&<Button type="button" variant="outline" disabled={refreshing}
   onClick={onRefresh}><RefreshCw size={16}/>{refreshing?'Atualizando…':'Atualizar dossiês'}</Button>}</div>
  <div className="spy-dossier-filters">
   <label>Casa-alvo<input value={targetFilter} onChange={e=>{setTargetFilter(e.target.value);setPage(1);}}
    placeholder="Pesquisar casa nobre"/></label>
   <label>Região<select value={regionFilter} onChange={e=>{setRegionFilter(e.target.value);setPage(1);}}>
    <option value="">Todas</option>{regions.map(region=><option value={region} key={region}>{region}</option>)}
   </select></label>
   <label>Recursos<select value={progress} onChange={e=>{setProgress(e.target.value as SpyDossierProgress);setPage(1);}}>
    <option value="all">Todos</option>
    <option value="incomplete">Incompletos</option>
    <option value="complete">7/7 completos</option>
   </select></label>
   <label>Atualidade<select value={freshness}
    onChange={e=>{setFreshness(e.target.value as SpyDossierFreshness);setPage(1);}}>
    <option value="all">Todas</option>
    <option value="recent">Até 30 dias</option>
    <option value="stale">Mais de 30 dias</option>
   </select></label>
  </div>
  <div className="spy-dossier-toolbar">
   <span role="status">{visible.length} dossiê(s) encontrado(s)</span>
   <label>Ordenar<select value={sort} onChange={e=>{setSort(e.target.value as SpyDossierSort);setPage(1);}}>
    <option value="recent">Atualizados recentemente</option>
    <option value="target">Nome da Casa-alvo</option>
   </select></label>
  </div>
  {visible.length?<><div className="spy-dossier-list">
   {paged.items.map(d=><DossierCard dossier={d} key={d.id}
    active={chosen?.id===d.id} onSelect={()=>setSelected(d.id)}/>)}
  </div>
  {paged.totalPages>1&&<div className="spy-dossier-pages">
   <Button type="button" variant="outline" disabled={paged.page===1}
    onClick={()=>setPage(p=>p-1)}>Anterior</Button>
   <span>Página {paged.page} de {paged.totalPages}</span>
   <Button type="button" variant="outline" disabled={paged.page===paged.totalPages}
    onClick={()=>setPage(p=>p+1)}>Próxima</Button>
  </div>}
  {chosen&&<DossierView key={chosen.id} dossier={chosen}/>}</>:
   <p className="house-caption">Nenhum dossiê encontrado. As informações surgem após missões homologadas.</p>}
 </section>;
}
export function SpyPlayerDossiers({houseId}:{houseId:string}){
 const query=useQuery({queryKey:['spy-dossiers',houseId],
  queryFn:()=>readSpyDossiersBrowser(houseId),retry:false,staleTime:10000,
  refetchOnWindowFocus:'always',refetchOnReconnect:'always'});
 if(query.isPending)return <p role="status">Consultando dossiês da Casa…</p>;
 if(query.isError)return <div role="alert">Não foi possível consultar seus dossiês.
  <Button variant="outline" onClick={()=>void query.refetch()}>Tentar novamente</Button></div>;
 return <DossierCollection dossiers={query.data} title="Dossiês de Espionagem"
  summary="Apenas informações conquistadas pela sua Casa. Cada descoberta permanece registrada para investigações futuras."
  onRefresh={()=>{void query.refetch();}} refreshing={query.isFetching}/>;
}

export function SpyNarratorDossiers(){
 const qc=useQueryClient();
 const [owner,setOwner]=useState(''),[target,setTarget]=useState(''),[region,setRegion]=useState(''),[selected,setSelected]=useState(''),
  [objective,setObjective]=useState<SpyIntelligenceObjective>('house_resources'),
  [subject,setSubject]=useState(''),[action,setAction]=useState<'reveal'|'revalidate'|'revoke'>('reveal'),
  [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [progress,setProgress]=useState<SpyDossierProgress>('all');
 const [freshness,setFreshness]=useState<SpyDossierFreshness>('all');
 const time=useCampaignTime();
 const officialDate=time.data&&!time.isError?dateKey(time.data):null;
 const [sort,setSort]=useState<SpyDossierSort>('recent');
 const [page,setPage]=useState(1);
 const [pendingObjective,setPendingObjective]=useState<SpyIntelligenceObjective|'all'>('all');
 const query=useQuery({queryKey:['spy-dossiers','narrator'],
  queryFn:()=>readSpyDossiersBrowser(null),retry:false,staleTime:10000});
 const pending=useQuery({queryKey:['spy-dossiers','pending'],
  queryFn:readSpyIntelligencePendingBrowser,retry:false});
 const adjust=useServerFn(adjustSpyIntelligence);
 const retry=useServerFn(retrySpyIntelligence);
 const owners=[...new Map((query.data??[]).map(d=>[d.ownerHouseId,d.ownerHouseName])).entries()];
 const regions=[...new Set((query.data??[]).map(d=>d.targetRegion).filter(
  (value):value is string=>Boolean(value)))].sort();
 const filtered=filterSpyDossiers(query.data??[],{
  ownerHouseId:owner,targetSearch:target,region,progress,sort,
  freshness,officialDate,
 });
 const paged=paginateSpyDossiers(filtered,page,30);
 const active=paged.items.find(d=>d.id===selected)??paged.items[0];
 const filteredPending=(pending.data??[]).filter(item=>
  pendingObjective==='all'||item.objective===pendingObjective);
 const options=useQuery({queryKey:['spy-dossiers','options',active?.id],
  enabled:!!active&&!query.isError,queryFn:()=>readSpyIntelligenceOptionsBrowser(active!.id),retry:false});
 const available=spyDossierActionOptions(options.data??[],active?.findings??[],objective,action);
 const currentKey=available.some(x=>x.key===subject)?subject:available[0]?.key??'';
 const refresh=async()=>{
  await Promise.all([qc.invalidateQueries({queryKey:['spy-dossiers']}),
   qc.invalidateQueries({queryKey:['spy-house-management']})]);
 };
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(!active||!currentKey||busy)return;
  setBusy(true);setMessage('');
  try{
   await adjust({data:{dossierId:active.id,objective,subjectKey:currentKey,
    action,reason:reason.trim()}});
   setMessage('Alteração registrada com auditoria.');
   setReason('');await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível alterar o segredo.');}
  finally{setBusy(false);}
 };
 const retryPending=async(id:string)=>{
  if(busy)return;setBusy(true);setMessage('');
  try{
   const result=await retry({data:{operationId:id}});
   setMessage(result.status==='complete'?'Descobertas processadas.':
    result.status==='no_success_award'?'Esta operação não possui descobertas pendentes.':
    'A missão permanece pendente de dados oficiais da Casa.');
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Falha ao reprocessar a missão.');}
  finally{setBusy(false);}
 };
 if(query.isError)return <section className="house-panel spy-dossier-panel"
  aria-label="Dossiês de Espionagem do Narrador">
  <p role="alert">Não foi possível consultar os dossiês. O acesso pode ter sido revogado.</p>
  <Button type="button" variant="outline" onClick={()=>void query.refetch()}>
   Tentar novamente</Button>
 </section>;
 return <>
 <SpyNarratorOperationsCenter/>
 <section className="house-panel spy-dossier-panel" aria-label="Dossiês de Espionagem do Narrador">
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">NARRADOR · INTELIGÊNCIA CONFIDENCIAL</p>
   <h2>Dossiês de Espionagem</h2>
   <p className="house-caption">Segredos conquistados pelas Casas nobres. O acesso é restrito ao Narrador.</p>
  </div><Button variant="outline" onClick={()=>void refresh()}><RefreshCw size={16}/>Atualizar</Button></div>
  {query.isPending&&<p role="status">Consultando informações de inteligência…</p>}
  {query.isError&&<p role="alert">Não foi possível consultar os dossiês. Verifique suas permissões.</p>}
  <div className="spy-dossier-filters">
   <label>Casa investigadora<select value={owner}
    onChange={e=>{setOwner(e.target.value);setSelected('');setPage(1);}}>
    <option value="">Todas as Casas</option>
    {owners.map(([id,name])=><option value={id} key={id}>{name}</option>)}
   </select></label>
   <label>Casa-alvo<input value={target}
    onChange={e=>{setTarget(e.target.value);setSelected('');setPage(1);}}
    placeholder="Pesquisar casa nobre"/></label>
   <label>Região<select value={region}
    onChange={e=>{setRegion(e.target.value);setSelected('');setPage(1);}}>
    <option value="">Todas</option>
    {regions.map(value=><option value={value} key={value}>{value}</option>)}
   </select></label>
  </div>
  <div className="spy-dossier-toolbar">
   <span role="status">{filtered.length} dossiê(s) no filtro</span>
   <label>Recursos<select value={progress} onChange={e=>{
    setProgress(e.target.value as SpyDossierProgress);setPage(1);setSelected('');}}>
    <option value="all">Todos</option><option value="incomplete">Incompletos</option>
    <option value="complete">7/7 completos</option>
   </select></label>
   <label>Atualidade<select value={freshness}
    onChange={e=>{setFreshness(e.target.value as SpyDossierFreshness);setPage(1);setSelected('');}}>
    <option value="all">Todas</option>
    <option value="recent">Até 30 dias</option>
    <option value="stale">Mais de 30 dias</option>
   </select></label>
   <label>Ordenar<select value={sort} onChange={e=>{
    setSort(e.target.value as SpyDossierSort);setPage(1);setSelected('');}}>
    <option value="recent">Atualizados recentemente</option>
    <option value="target">Nome da Casa-alvo</option>
   </select></label>
  </div>
  <div className="spy-dossier-admin-table-wrap"><table className="spy-dossier-admin-table">
   <thead><tr><th>Investigadora</th><th>Casa-alvo</th>
    <th>Recursos</th><th>Exército</th><th>Posses</th><th>Ação</th></tr></thead>
   <tbody>{paged.items.map(d=><tr key={d.id}>
    <td>{d.ownerHouseName}</td><td>{d.targetHouseName}</td>
    <td>{count(d,'house_resources')}/7</td><td>{count(d,'army')}</td><td>{count(d,'possessions')}</td>
    <td><Button size="sm" variant={active?.id===d.id?'default':'outline'}
     onClick={()=>setSelected(d.id)}>Consultar</Button></td>
   </tr>)}</tbody>
  </table></div>
  {paged.totalPages>1&&<div className="spy-dossier-pages">
   <Button type="button" variant="outline" disabled={paged.page===1}
    onClick={()=>{setPage(p=>p-1);setSelected('');}}>Anterior</Button>
   <span>Página {paged.page} de {paged.totalPages}</span>
   <Button type="button" variant="outline" disabled={paged.page===paged.totalPages}
    onClick={()=>{setPage(p=>p+1);setSelected('');}}>Próxima</Button>
  </div>}
  {!query.isPending&&filtered.length===0&&<p className="house-caption">Nenhum conhecimento conquistado ainda.</p>}
  {active&&<>
   <DossierView key={active.id} dossier={active} narrator/>
   <form className="house-ledger spy-dossier-admin-form" onSubmit={e=>void submit(e)}>
    <h3>Gerenciamento de segredos</h3>
    <p className="house-caption">Adicionar, revalidar ou revogar conhecimento. Todas as intervenções são auditadas.</p>
    <label>Modalidade<select value={objective} onChange={e=>{
     setObjective(e.target.value as SpyIntelligenceObjective);setSubject('');}}>
     {SPY_INTELLIGENCE_OBJECTIVES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
    </select></label>
    <label>Informação oficial<select value={currentKey}
     onChange={e=>setSubject(e.target.value)}>
     {available.map(x=><option value={x.key} key={x.key}>{x.name}</option>)}
    </select></label>
    {options.isError&&action!=='revoke'&&<p role="alert" className="house-caption">
     Não foi possível consultar a fonte oficial. Atualize os dossiês antes de alterar.</p>}
    {available.length===0&&<p role="status" className="house-caption">
     {action==='revoke'?'Nenhuma informação conhecida nesta modalidade.':
      action==='revalidate'?'Nenhuma informação conhecida com fonte oficial disponível.':
      'Nenhuma nova informação com fonte oficial disponível.'}</p>}
    <label>Ação<select value={action} onChange={e=>{setAction(e.target.value as typeof action);setSubject('');}}>
     <option value="reveal">Adicionar descoberta</option>
     <option value="revalidate">Atualizar valor conhecido</option>
     <option value="revoke">Revogar conhecimento</option>
    </select></label>
    <label>Justificativa<textarea value={reason} required minLength={10} maxLength={1200}
     onChange={e=>setReason(e.target.value)}/></label>
    <Button disabled={busy||!currentKey||reason.trim().length<10||
     (options.isError&&action!=='revoke')}>
     {busy?'Registrando…':'Registrar alteração'}</Button>
   </form>
   {!!active.adminHistory.length&&<details className="house-ledger">
    <summary>Auditoria do Narrador ({active.adminHistory.length})</summary>
    {active.adminHistory.map(item=><p key={item.id}>{safeDate(item.dateKey)} ·
     {item.action} · {item.objective} · {item.key}: {item.reason}</p>)}
   </details>}
  </>}
  <details className="house-ledger">
   <summary>Missões aguardando fonte oficial ({pending.data?.length??0})</summary>
   {pending.isPending&&<p role="status">Consultando missões pendentes…</p>}
   {pending.isError&&<p role="alert">Não foi possível consultar as pendências.
    <Button type="button" variant="outline" onClick={()=>void pending.refetch()}>
     Tentar novamente</Button></p>}
   {!pending.isPending&&!pending.isError&&<>
    <label className="spy-dossier-pending-filter">Modalidade
     <select value={pendingObjective} onChange={e=>
      setPendingObjective(e.target.value as SpyIntelligenceObjective|'all')}>
      <option value="all">Todas as modalidades</option>
      {SPY_INTELLIGENCE_OBJECTIVES.map(item=>
       <option key={item.id} value={item.id}>{item.label}</option>)}
     </select>
    </label>
    <p className="house-caption" role="status">{filteredPending.length} missão(ões) neste filtro.</p>
    {filteredPending.map(item=>{
     const names=spyDossierPendingHouseNames(item.ownerHouseId,item.targetHouseId,query.data??[]);
     return <div className="spy-dossier-pending" key={item.operationId}>
      <span><strong>Casa {names.owner} → Casa {names.target}</strong>
       <small>{labels[item.objective]} · {safeDate(item.dateKey)} ·
        Até {item.capacity} descobertas por missão</small>
      </span>
      <Button type="button" size="sm" variant="outline" disabled={busy}
       onClick={()=>void retryPending(item.operationId)}>Reprocessar</Button>
     </div>;
    })}
    {filteredPending.length===0&&<p className="house-caption">Nenhuma missão pendente neste filtro.</p>}
   </>}
  </details>
  {message&&<p role="status" className="house-caption">{message}</p>}
 </section>
 </>;
}
