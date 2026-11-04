import type {ReactNode} from 'react';
import {balances} from '@/lib/house/engine';
import {calendarDrift,calendarMonthIndex,type CalendarReference} from '@/lib/house/calendar-consistency';
import {houseMonthlyOperationReadiness,isMonthSensitiveHouseAction} from '@/lib/house/monthly-operation-policy';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {projectTemporalNotice} from '@/lib/calendar/house-time-impact';
import { legacyEffectCandidates } from '@/lib/house/holding-accounting';
import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Feather, Mountain, Castle, Coins, Swords, Eye, Users, CalendarDays, Dice5, ScrollText, Plus, Undo2, Download, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageViewer } from '@/components/image-viewer';
import { PrivateImage } from '@/components/campaign-content';
import { AdminHouseEditor } from './admin-house-editor';
import { HouseEconomyActions, AdminResourceCorrection, AdminLegacyCostReconciliation } from './resource-actions';
import { loadHouseHub, loadHouseLedger, houseOperation, saveHouseRule } from '@/lib/house/house.functions';
import { campaignMonth } from '@/lib/house/regions';
import { RESOURCE_KEYS, RESOURCE_NAMES, zeroResources, type HouseState, type CatalogItem } from '@/lib/house/types';
import { readWorkbook, type ImportPreview } from '@/lib/house/import';
import { exportHouseExcel, exportHousePdf } from '@/lib/house/export';
import { ResourceSummary, ResourceChart } from './resource-summary';
import { PurchaseDrawer } from './purchase-drawer';
import { HouseAssetCard,HouseAssetGrid } from './asset-card';
import { HouseAssetCatalog } from './asset-catalog';
import { Creation } from './creation';
import { Army } from './army';
import { SpyRegionalTurnsPanel } from './espionage/spy-regional-turns-panel';
import {SpyDefensePanel,SpyAgentManagement} from './espionage/spy-house-management';
import { Vassals } from './vassals';
import { FortunePanel } from './fortune-panel';
import { HouseCoverage } from './coverage';
import { HouseCodex } from './codex';
import { GmHouseNotes } from './gm-notes';
import { KingdomDashboard } from './kingdom-dashboard';
import { Court } from './court';
import { HouseReconciliation } from './reconciliation';
import { HouseDriveStatus } from './drive-status';
import type { ReconciliationRecord } from '@/lib/house/reconciliation';
const NAV=[['kingdom','Reino · Narrador',LayoutDashboard],['overview','Visão geral',LayoutDashboard],['creation','Criação',Feather],['domains','Terras e domínios',Mountain],['fortifications','Fortificações',Castle],['economy','Economia',Coins],['army','Exército',Swords],['spy','Espionagem',Eye],['court','Corte',Users],['vassals','Vassalos',Users],['projects','Projetos',CalendarDays],['fortune','Sorte e ações',Dice5],['history','Histórico e documentos',ScrollText],['rules','Regras e Tabelas',ScrollText],['reconciliation','Prévia de conciliação',ScrollText],['coverage','Cobertura e pendências',AlertTriangle]] as const;
type Props={npcManager?:ReactNode;representationMode?:boolean|undefined;house:{id:string;name:string;region:string|null;crest:string|null;lord_name:string|null;castle:string|null};canEdit:boolean;npcs:{id:string;title:string}[];courtMembers:{id:string;title:string}[];records?:ReconciliationRecord[]};
export function NobleHouseHub(props:Props) {
  const load=useServerFn(loadHouseHub),fetchFull=useServerFn(loadHouseLedger),operation=useServerFn(houseOperation),qc=useQueryClient();
  const query=useQuery({queryKey:['noble-house',props.house.id],queryFn:()=>load({data:{houseId:props.house.id}})});
  const globalCalendar=useCampaignTime();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const lock=useRef(false),retry=useRef<{payload:string;key:string}|null>(null);
  const run=useCallback(async(action:Parameters<typeof operation>[0]['data']['action'],args:Record<string,unknown>={},explanation='')=>{if(props.representationMode||lock.current||!query.data)return false;if(isMonthSensitiveHouseAction(action)){const ready=houseMonthlyOperationReadiness(query.data.state,globalCalendar.isError?null:globalCalendar.data??null);if(!ready.allowed){setMessage(ready.message);setError(true);return false;}}lock.current=true;setBusy(true);setError(false);const payload=JSON.stringify({houseId:props.house.id,action,args,explanation});if(retry.current?.payload!==payload)retry.current={payload,key:crypto.randomUUID()};const key=retry.current.key;try{await operation({data:{houseId:props.house.id,version:query.data.version,key,action,args,explanation}});retry.current=null;await qc.invalidateQueries({queryKey:['noble-house',props.house.id]});setMessage('Salvo no site. Histórico preservado.');return true;}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar.');setError(true);return false;}finally{lock.current=false;setBusy(false);}},[query.data,operation,props.house.id,props.representationMode,qc,globalCalendar.data,globalCalendar.isError]);
  if(query.isPending)return <p role="status">Consultando a ficha da casa…</p>;
  if(query.error||!query.data)return <div role="alert"><p>{query.error?.message??'Ficha indisponível'}</p><Button onClick={()=>query.refetch()}>Tentar novamente</Button></div>;
  return <HouseWorkspace key={props.house.id} {...props} canEdit={props.representationMode?false:props.canEdit} state={query.data.state} catalog={query.data.catalog} houses={query.data.houses} admin={query.data.admin&&!props.representationMode} canEditAttributes={query.data.canEditAttributes&&!props.representationMode} version={query.data.version} ledger={query.data.ledger} globalCalendar={globalCalendar.isError?null:globalCalendar.data??null} calendarError={globalCalendar.isError} fetchFullLedger={()=>fetchFull({data:{houseId:props.house.id}})} busy={busy} message={message} error={error} run={run}/>;
}
type Run=(action:Parameters<ReturnType<typeof useServerFn<typeof houseOperation>>>[0]['data']['action'],args?:Record<string,unknown>,explanation?:string)=>Promise<boolean>;
function HouseWorkspace({npcManager,representationMode,house,canEdit:playerCanEdit,npcs,courtMembers,records=[],state,catalog,houses,admin,canEditAttributes,version,ledger,globalCalendar,calendarError,fetchFullLedger,busy,message,error,run}:Props&{state:HouseState;catalog:CatalogItem[];houses:{id:string;name:string;crest:string|null}[];admin:boolean;canEditAttributes:boolean;version:number;ledger:{id:string;action:string;explanation:string;rule:string;created_at:string}[];globalCalendar:CalendarReference|null;calendarError:boolean;fetchFullLedger:()=>Promise<import('@/lib/house/report').ReportLedger[]>;busy:boolean;message:string;error:boolean;run:Run}) {
  const canEdit=admin||playerCanEdit;
  const [graphical,setGraphical]=useState(false);
  const [section,setSection]=useState('overview'),[buy,setBuy]=useState(false),[purchaseItemId,setPurchaseItemId]=useState(''),[importPreview,setImport]=useState<ImportPreview|null>(null),[resource,setResource]=useState<typeof RESOURCE_KEYS[number]>('wealth'),[importDecision,setImportDecision]=useState('');
  const active=state.holdings.filter(h=>h.status==='active'),projects=state.projects.filter(p=>p.status==='building');
  const drift=globalCalendar?calendarDrift(state.month,globalCalendar):null;
  const monthly=houseMonthlyOperationReadiness(state,globalCalendar);
  const monthlyCanEdit=canEdit&&monthly.allowed;
  const saveDraft=useCallback((args:Record<string,unknown>)=>run('draft',args),[run]);
  const categories=section==='fortifications'?['fortification']:section==='domains'?['terrain','feature','community']:['estate','lifestyle','personage','settlement','improvement','equipment','vassal'];
  return <div className="house-hub"><header className="house-header">{state.identity.crestPath?<div style={{width:100,height:100}}><PrivateImage path={state.identity.crestPath} caption={`Brasão da Casa ${house.name}`} thumbnail/></div>:house.crest&&<ImageViewer src={house.crest} caption={`Brasão da Casa ${house.name}`}/>}<div><p className="campaign-eyebrow">REGISTRO DA CASA · {state.phase==='active'?'EM CAMPANHA':state.phase==='review'?'AGUARDANDO APROVAÇÃO':'RASCUNHO'}</p><h2>Casa {house.name}</h2><p>{house.lord_name??'Governante não informado'} · {house.castle??'Sede não informada'} · {globalCalendar?campaignMonth(calendarMonthIndex(globalCalendar)):'Data oficial indisponível'}</p></div><div className="house-header-actions"><Button variant="outline" aria-pressed={graphical} onClick={()=>setGraphical(v=>!v)}><LayoutDashboard size={16}/>Trocar Visão</Button><span className="house-version">v{version}</span></div></header>{graphical?<ResourceChart state={state}/>:<ResourceSummary state={state}/>}
    {representationMode&&<p role="note" className="house-caption">Representação do jogador: visualização somente de leitura. Operações ficam desativadas e dependem de autorização específica.</p>}<div className="house-layout"><aside className="house-sidebar"><nav aria-label="Gerenciamento da casa">{NAV.filter(([id])=>!['reconciliation','coverage','kingdom','history','rules'].includes(id)).map(([id,label,Icon])=><Button variant={section===id?'default':'ghost'} aria-current={section===id?'page':undefined} key={id} onClick={()=>setSection(id)}><Icon size={17}/>{label}</Button>)}</nav></aside><main className="house-content">
      {(busy||(error&&message))&&<p role={error?'alert':'status'} className={error?'house-warning':'house-save-status'}>{busy?'Salvando…':message}</p>}
      {calendarError&&<p role="alert" className="house-warning">Não foi possível confirmar o período global. Operações mensais dependem do Calendário do Narrador.</p>}
      {admin&&state.phase==='active'&&drift&&drift.delta>0&&drift.delta<=120&&<details className="house-ledger">
        <summary>Conciliar {drift.delta} mês(es) desta Casa com o calendário global</summary>
        <form className="campaign-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void run('sync_calendar',{},String(form.get('justification')));}}>
          <p>Esta operação avança exclusivamente a Casa atrasada até {campaignMonth(drift.current)} e conclui as obras elegíveis. O histórico de operações é preservado.</p>
          <label>Justificativa do Narrador<textarea name="justification" minLength={10} required placeholder="Explique por que esta Casa ficou defasada e autorize a conciliação."/></label>
          <Button disabled={busy}>Conciliar período da Casa</Button>
        </form>
      </details>}
      {section==='overview'&&<>{admin&&<AdminHouseEditor key={version} state={state} busy={busy}
       onSave={(args,reason)=>run('admin_edit',args,reason)}/>}
       <div className="house-section-heading"><div><p className="campaign-eyebrow">PATRIMÔNIO E GOVERNO</p><h3>O conselho da casa</h3></div>{canEdit&&<Button disabled={!monthly.allowed||busy} onClick={()=>setBuy(true)}><Plus size={16}/>Comprar posse</Button>}</div><div className="house-overview-grid"><div><div className="house-stat-row"><div><Castle size={22}/><strong>{active.length}</strong><span>Posses ativas</span></div><div><Mountain size={22}/><strong>{state.domains.length}</strong><span>Domínios próprios</span></div><div><Swords size={22}/><strong>{state.units.length}</strong><span>Unidades</span></div></div><h4>Posses principais</h4>{active.length?<ul className="house-plain-list">{active.slice(0,5).map(h=><li key={h.id}><span>{h.name}</span><small>{state.domains.find(d=>d.id===h.domainId)?.name}</small></li>)}</ul>:<p className="campaign-empty">Comece pela criação ou concilie uma ficha existente. Nenhuma posse foi importada automaticamente.</p>}<div className="campaign-actions"><Button variant="outline" onClick={()=>setSection('creation')}><Feather size={16}/>Continuar criação</Button><Button variant="outline" onClick={()=>setSection('army')}><Swords size={16}/>Criar unidade</Button></div></div><div><h4>Projetos em andamento</h4>{projects.length?projects.map(p=><article className="house-project" key={p.id}><strong>{p.name}</strong><p>{campaignMonth(p.start+p.duration+p.modifier)}</p><progress max={p.duration||1} value={Math.max(0,state.month-p.start)} aria-label={p.name}/></article>):<p className="campaign-empty">Nenhuma obra em andamento.</p>}<div className="house-notice"><AlertTriangle size={18}/><p>{state.phase==='draft'?'Criação ainda não aprovada. Recursos e compras permanecem no novo registro; o acervo original está intacto.':'O calendário global é publicado pelo Narrador. A construção depende dos meses oficiais da campanha; abrir missivas não avança obras nem gera rendimentos automáticos.'}</p></div></div></div></>}
      {RESOURCE_KEYS.some(r=>balances(state).available[r]<0)&&<p role="alert" className="house-warning">Há recursos em déficit. Revise os custos e os lançamentos antes de novas compras.</p>}{state.phase==='draft'&&state.importSources.length>0&&
        (state.domains.length===0||state.holdings.length===0)&&
        <p role="alert" className="house-warning">Ficha legada parcialmente conciliada: recursos importados, mas domínios ou posses ainda não foram conferidos. O Narrador precisa validar os investimentos antes de aprovar a Casa; o bônus regional não será somado novamente.</p>}
      {section==='creation'&&<><Creation state={state} admin={admin} canEditAttributes={canEditAttributes} busy={busy} onSave={saveDraft} onNavigate={setSection} onRoll={()=>run("roll")} onCreationAction={(action,args)=>run(action,args??{})}/>
       {admin&&<AdminHouseEditor key={version} state={state} busy={busy}
        onSave={(args,reason)=>run('admin_edit',args,reason)}/>}
       <div className="campaign-actions">{state.phase==='draft'&&canEdit&&<><Button disabled={busy} onClick={()=>run('submit')}>Enviar para aprovação<Check size={16}/></Button><Button variant="outline" disabled={busy} onClick={()=>run('undo')}><Undo2 size={16}/>Desfazer último rascunho</Button></>}{admin&&state.phase==='review'&&<><Button onClick={()=>run('approve')}>Aprovar criação</Button><Button variant="outline" onClick={()=>{const note=prompt('Motivo da devolução para ajustes');if(note)run('return_to_draft',{},note);}}>Devolver para rascunho</Button></>}{admin&&state.pending.length>0&&<form className="campaign-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run('clear_pending',{indices:f.getAll('pending').map(Number)},String(f.get('note')));}}>{state.pending.map((p,i)=><label key={i}><input type="checkbox" name="pending" value={i}/>{p}</label>)}<label>Resolução<textarea name="note" required minLength={10}/></label><Button disabled={busy}>Resolver pendências selecionadas</Button></form>}</div></>}
      {section==='domains'&&<>
       <div className="house-section-heading">
        <h3>Terras e domínios</h3>
        {canEdit&&<Button disabled={!monthly.allowed||busy}
         onClick={()=>{setPurchaseItemId('');setBuy(true);}}><Plus size={16}/>Comprar terreno</Button>}
       </div>
       <h4>Domínios da Casa</h4>
       <HouseAssetGrid>{state.domains.map(d=>{
        const terrain=catalog.find(item=>item.id===d.terrain)?.name??'Terreno a definir';
        const community=catalog.find(item=>item.id===d.community)?.name??'Sem comunidade';
        const features=d.features.map(id=>catalog.find(item=>item.id===id)?.name??id);
        return <HouseAssetCard key={d.id} title="Domínio" icon={<Mountain/>}
         status={d.name} description={[terrain,community,...features].join(' · ')}
         testId={'house-domain-'+d.id}>
         <h5>Descrição do domínio</h5>
         <p>Terreno: {terrain}</p><p>Comunidade: {community}</p>
         <p>Características: {features.join(', ')||'Não adquiridas'}</p>
         <h5>Posses e notas</h5>
         {state.holdings.filter(h=>h.domainId===d.id).map(h=>
          <p key={h.id}>{h.name} · {h.status}</p>)}
         <p>{d.notes||'Nenhuma nota registrada.'}</p>
         {canEdit&&<details className="house-asset-conditions">
          <summary>Editar domínio</summary>
          <form className="campaign-form" onSubmit={async e=>{
           e.preventDefault();const form=new FormData(e.currentTarget);
           await run('domain_edit',{id:d.id,name:String(form.get('name')),
            notes:String(form.get('notes'))},'Atualização do nome e das notas do domínio.');
          }}>
           <label>Nome<input name="name" required defaultValue={d.name}/></label>
           <label>Notas<textarea name="notes" defaultValue={d.notes}/></label>
           <Button disabled={busy}>Salvar domínio</Button>
          </form>
          {state.phase==='draft'&&!state.holdings.some(h=>h.domainId===d.id)&&
           !state.units.some(u=>u.domainId===d.id)&&
           <Button variant="outline" disabled={busy} onClick={()=>void run('domain_delete',
            {id:d.id},'Exclusão de domínio vazio na criação.')}>Excluir domínio vazio</Button>}
         </details>}
        </HouseAssetCard>;
       })}</HouseAssetGrid>
       {canEdit&&<form className="campaign-form" onSubmit={async e=>{
        e.preventDefault();const form=new FormData(e.currentTarget),target=e.currentTarget;
        if(await run('domain',{id:crypto.randomUUID(),name:String(form.get('name')),
         notes:String(form.get('notes'))}))target.reset();
       }}>
        <h4>Nomear um domínio</h4>
        <label>Nome<input name="name" required placeholder="Nome oficial da localidade"/></label>
        <label>Notas<input name="notes"/></label>
        <Button disabled={busy}>Criar domínio</Button>
       </form>}
       <HouseAssetCatalog section="domains" state={state} catalog={catalog}
        canEdit={monthlyCanEdit} busy={busy}
        onBuy={id=>{if(!monthly.allowed)return;setPurchaseItemId(id);setBuy(true);}}
        onCondition={(args,reason)=>run('condition',args,reason)}/>
      </>}
      {(section==='fortifications'||section==='economy')&&<>
       {section==='economy'&&<HouseEconomyActions state={state} admin={admin}
        canEdit={monthlyCanEdit} busy={busy} run={run}/>}
       <div className="house-section-heading">
        <h3>{section==='economy'?'Economia e investimentos':'Fortificações'}</h3>
        {canEdit&&<Button disabled={!monthly.allowed||busy}
         onClick={()=>{setPurchaseItemId('');setBuy(true);}}><Plus size={16}/>Comprar posse</Button>}
       </div>
       <HouseAssetCatalog key={section} section={section} state={state}
        catalog={catalog} canEdit={monthlyCanEdit} busy={busy}
        onBuy={id=>{if(!monthly.allowed)return;setPurchaseItemId(id);setBuy(true);}}
        onCondition={(args,reason)=>run('condition',args,reason)}/>
      </>}
      {section==='army'&&<Army commanders={courtMembers} state={state} houseName={house.name} onSiege={args=>run('siege',args)} onSiegeState={(args,reason)=>run('siege_state',args,reason)} admin={admin} onState={args=>run('unit_state',args)} onSurvivors={args=>run('survivors',args)} onTrain={(args,reason)=>run('train_unit',args,reason)} onEdit={args=>run('unit_edit',args)} onGrant={(args,reason)=>run('grant_unit_xp',args,reason)} onRename={args=>run('military_rename',args)} onConfigure={args=>run('military_config',args)} onWarHounds={args=>run('war_hounds',args)} onBroadTraining={args=>run('broad_training',args)} onBuyMilitary={id=>{if(!monthly.allowed)return;setPurchaseItemId(id);setBuy(true);}} canEdit={monthlyCanEdit} busy={busy} onCreate={args=>run('unit',args)} onEquipment={args=>run('equipment',args)}/>}
      {section==='spy'&&<>
       <SpyDefensePanel state={state}/>
       <SpyAgentManagement houseId={house.id} canEdit={canEdit} admin={admin}/>
       <SpyRegionalTurnsPanel houseId={house.id} admin={admin}/>
       <HouseAssetCatalog section="spy" state={state} catalog={catalog}
        canEdit={monthlyCanEdit} busy={busy}
        onBuy={id=>{if(!monthly.allowed)return;setPurchaseItemId(id);setBuy(true);}}
        onCondition={(args,reason)=>run('condition',args,reason)}/>
      </>}
      {section==='vassals'&&<><Vassals catalog={catalog} onCreate={args=>run('vassal_create',args)} onPurchase={args=>run('vassal_purchase',args)} onDomain={args=>run('vassal_domain',args)} state={state} houses={houses} npcs={npcs} admin={admin} canEdit={canEdit} busy={busy} onPropose={args=>run('vassal',args)} onApprove={(args,note)=>run('vassal_approve',args,note)} onEnd={(args,note)=>run('vassal_end',args,note)} onLoyalty={(args,note)=>run('vassal_loyalty',args,note)}/></>}
      {section==='court'&&<>{npcManager}<p>Titular: {house.lord_name??'Não informado'}</p><Court state={state} members={courtMembers} canEdit={canEdit} busy={busy} onAssign={args=>run('court',args)} onRemove={id=>run('court_remove',{id},'Remoção de vínculo da Corte solicitada pelo gestor da casa.')}/></>}
      {section==='projects'&&<><h3>Projetos e calendário</h3><p>{campaignMonth(state.month)}</p>{state.projects.map(p=><article className="house-project" key={p.id}><h4>{p.name}</h4><p>{p.status==='completed'?'Concluído':p.status==='cancelled'?'Cancelado':'Em andamento'} · duração {p.duration} meses · previsão {campaignMonth(p.start+p.duration+p.modifier)}</p>
     {projectTemporalNotice(p,state.month,drift?.current??state.month)==='due_for_review'&&
       <p className="house-caption" role="status">Prazo atingido no calendário do Reino. A ativação depende da publicação oficial do mês, da atualização desta Casa e dos pré-requisitos da posse; não há conclusão presumida.</p>}<details><summary>Dados e início</summary><p>{campaignMonth(p.start)} · dados: {p.dice.join(', ')||'Sem dados'} · modificador {p.modifier}</p></details></article>)}{admin&&<p className="house-caption">O avanço de tempo da campanha deve ocorrer exclusivamente no Calendário do Narrador (Reino). Em caso de divergência, utilize a conciliação auditada exibida no topo desta ficha.</p>}</>}
      {section==='fortune'&&<FortunePanel state={state} admin={admin&&monthly.allowed} canEdit={monthlyCanEdit} busy={busy} run={run}/>}
      {admin&&section==='kingdom'&&<KingdomDashboard/>}
       {section==='rules'&&<HouseCodex/>}
       {admin&&section==='reconciliation'&&<HouseReconciliation houses={[house]} records={records} admin={admin}/>}
      {admin&&section==='coverage'&&<HouseCoverage/>}
       {admin&&section==='history'&&<GmHouseNotes houseId={house.id}/>}
      {section==='history'&&<>
       {admin&&<AdminResourceCorrection busy={busy} run={run}/>}
       {admin&&<AdminLegacyCostReconciliation key={version} state={state} houseName={house.name} busy={busy} run={run}/>}
       <div className="house-section-heading"><h3>Histórico e documentos</h3><div className="campaign-actions"><Button variant="outline" onClick={()=>fetchFullLedger().then(full=>exportHouseExcel(state,house.name,catalog,full)).catch(err=>window.alert(err instanceof Error?err.message:"Falha ao exportar."))}><Download size={16}/>Excel</Button><Button variant="outline" onClick={()=>fetchFullLedger().then(full=>exportHousePdf(state,house.name,catalog,full)).catch(err=>window.alert(err instanceof Error?err.message:"Falha ao exportar."))}><Download size={16}/>Baixar PDF</Button></div></div><HouseDriveStatus houseId={house.id} version={version} canEdit={canEdit}/><label>Prévia de conciliação de planilha<input type="file" accept=".xlsx,.xls" onChange={async e=>{const file=e.target.files?.[0];if(file)setImport(await readWorkbook(file));}}/></label>{importPreview&&<div className="house-import"><h4>{importPreview.source} · {importPreview.house??'Casa não identificada'}</h4><p>{importPreview.units.length} unidades compatíveis identificadas. Nada foi importado.</p>{importPreview.issues.map((issue,i)=><p className="house-warning" key={i}>{issue}</p>)}<details><summary>Recursos reconhecidos</summary>{importPreview.resources&&RESOURCE_KEYS.map(r=><p key={r}>{RESOURCE_NAMES[r]}: {importPreview.resources?.[r]}</p>)}</details>{admin&&<><label>Decisões de conciliação<textarea value={importDecision} onChange={e=>setImportDecision(e.target.value)} placeholder="Registre origem dos valores, divergências e o que permanece pendente."/></label><Button disabled={busy||!importPreview.resources||!importPreview.house||importDecision.trim().length<10} onClick={()=>run("import",{source:importPreview.source,sourceHouse:importPreview.house,resources:importPreview.resources,issues:importPreview.issues,decisions:importDecision,events:importPreview.events,original:importPreview.original},importDecision)}>Confirmar snapshot legado, mantendo pendências</Button><p className="house-caption">Não importa unidades divergentes ou compras. A aprovação da criação continua bloqueada pelas pendências.</p></>}</div>}<h4>Lançamentos</h4>{ledger.length?ledger.map(l=><details className="house-ledger" key={l.id}><summary>{l.action} · {new Date(l.created_at).toLocaleString('pt-BR')}</summary><p>{l.explanation||'Operação registrada'}</p><p>{l.rule}</p></details>):<p className="campaign-empty">Nenhuma operação no novo registro.</p>}<details><summary>Cobertura do catálogo e pendências</summary><p>{catalog.length} entradas · {catalog.filter(i=>i.pending).length} com decisão pendente.</p>{catalog.filter(i=>i.pending).map(i=><p key={i.id}><strong>{i.name}</strong>: {i.pending} · {i.source} · {i.section}</p>)}</details>{admin&&legacyEffectCandidates(state).length>0&&<div className="house-ledger">
  <h4>Conciliação de benefícios importados</h4>
  <p>{legacyEffectCandidates(state).length} posse(s) legada(s) com identificador conhecido possuem benefícios vazios no registro. A visualização e os relatórios usam a regra do catálogo; o Narrador pode gravar esses benefícios no estado com histórico auditado.</p>
  <Button disabled={busy} variant="outline" onClick={()=>run('restore_legacy_effects',{holdingIds:legacyEffectCandidates(state).map(h=>h.id)},'Conciliação de benefícios das posses legadas pela identificação exata com o catálogo vigente.')}>Registrar benefícios legados na ficha</Button>
 </div>}
 {admin&&<RuleEditor catalog={catalog}/>}</>}
    </main></div><PurchaseDrawer key={`${state.month}-${globalCalendar?.year??'none'}-${globalCalendar?.month??'none'}`} open={buy&&monthlyCanEdit} onClose={()=>{setBuy(false);setPurchaseItemId('');}} state={state} catalog={catalog} busy={busy} onConfirm={args=>run('purchase',args)} initialCategory={section==='overview'||(section==='army'&&purchaseItemId)||(section==='spy'&&purchaseItemId)?'':categories.join(',')} initialItemId={purchaseItemId} onCreateDomain={name=>run('domain',{id:crypto.randomUUID(),name,notes:''},'Domínio criado durante a compra de uma posse.')}/>
  </div>;
}
function RuleEditor({catalog}:{catalog:CatalogItem[]}) {
 const save=useServerFn(saveHouseRule),qc=useQueryClient(),[item,setItem]=useState<CatalogItem|null>(null),[message,setMessage]=useState('');
 const custom=()=>setItem({id:'custom-'+crypto.randomUUID(),name:'',original:'Personalizado',category:'personage',description:'',costs:[{resource:'wealth',amount:0,mode:'allocation'}],requirements:[],effects:[],duration:{months:0},source:'Adaptação do Narrador',section:'Decisão personalizada',version:'1',repeatable:false,custom:true});
 return <details className="house-ledger"><summary>Adaptações do Narrador</summary><Button variant="outline" onClick={custom}><Plus size={16}/>Criar item personalizado</Button><label>Item<select value={item?.id??''} onChange={e=>setItem(catalog.find(i=>i.id===e.target.value)??null)}><option value="">Selecione um item</option>{catalog.map(i=><option value={i.id} key={i.id}>{i.name} · {i.original}</option>)}</select></label>{item&&<form className="campaign-form" onSubmit={async e=>{e.preventDefault();try{const result=await save({data:{...item,source:'Adaptação explícita do Narrador',custom:true}});setMessage(result.message);await Promise.all([qc.invalidateQueries({queryKey:['noble-house']}),qc.invalidateQueries({queryKey:['campaign-panel']}),qc.invalidateQueries({queryKey:['mail-options']})]);}catch(err){setMessage(err instanceof Error?err.message:'Falha ao salvar.');}}}><label>Nome<input required value={item.name} onChange={e=>setItem({...item,name:e.target.value})}/></label><label>Descrição prática<textarea required value={item.description} onChange={e=>setItem({...item,description:e.target.value})}/></label><label>Categoria<select value={item.category} onChange={e=>setItem({...item,category:e.target.value as CatalogItem['category']})}>{['terrain','feature','community','fortification','estate','lifestyle','personage','settlement','improvement','equipment','vassal'].map(c=><option value={c} key={c}>{c}</option>)}</select></label><label>Decisão pendente<input value={item.pending??''} onChange={e=>setItem({...item,pending:e.target.value||undefined})}/></label>{item.costs.map((c,i)=><fieldset key={i}><legend>Custo {i+1}</legend><label>Recurso<select value={c.resource} onChange={e=>setItem({...item,costs:item.costs.map((cost,n)=>n===i?{...cost,resource:e.target.value as typeof c.resource}:cost)})}>{RESOURCE_KEYS.map(r=><option value={r} key={r}>{RESOURCE_NAMES[r]}</option>)}</select></label><label>Quantidade<input type="number" step="any" min={0} value={c.amount} onChange={e=>setItem({...item,costs:item.costs.map((cost,n)=>n===i?{...cost,amount:Number(e.target.value)}:cost)})}/></label><label>Tipo<select value={c.mode} onChange={e=>setItem({...item,costs:item.costs.map((cost,n)=>n===i?{...cost,mode:e.target.value as typeof c.mode}:cost)})}><option value="allocation">Alocação</option><option value="permanent">Redução permanente</option></select></label></fieldset>)}<Button type="button" variant="outline" onClick={()=>setItem({...item,costs:[...item.costs,{resource:'wealth',amount:0,mode:'allocation'}]})}>Adicionar custo</Button><div className="house-input-grid"><label>Prazo-base (meses)<input type="number" min={0} value={item.duration.months} onChange={e=>setItem({...item,duration:{...item.duration,months:Number(e.target.value)}})}/></label><label>Dados de duração<input type="number" min={0} value={item.duration.dice??0} onChange={e=>setItem({...item,duration:{...item.duration,dice:Number(e.target.value),sides:6}})}/></label></div><label>Benefícios narrativos, um por linha<textarea value={item.effects.map(e=>e.description).join('\n')} onChange={e=>setItem({...item,effects:e.target.value.split('\n').filter(Boolean).map(description=>({kind:'action',description}))})}/></label><label className="campaign-check"><input type="checkbox" checked={item.repeatable} onChange={e=>setItem({...item,repeatable:e.target.checked})}/>Pode repetir a compra</label><p>Alterações valem para novas compras. Custos históricos não são recalculados.</p><Button>Salvar adaptação personalizada</Button></form>}<p role="status">{message}</p></details>;
}
