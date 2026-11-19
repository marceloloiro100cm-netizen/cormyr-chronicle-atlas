import {createFileRoute} from '@tanstack/react-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

/**
 * Conferência do acervo ORIGINAL importado ao Firestore.
 * Não substitui o Conselho, não representa dados de demonstração e não grava.
 * Autorização de cada consulta é refeita no servidor pelo Firebase Admin.
 */
type Profile='narrador'|'jogador'|'editor';
type Session={authenticated:true;profile:Profile;memberHouseIds:string[]};
type House={id:string;name:string};
type ModuleStatus={tablesImported:number;tablesExpected:number;rows:number;missingTables:string[]};
type Audit={status:string;tablesImported?:number;rowsImported?:number;metadataConsistent?:boolean;
  modules?:Record<string,ModuleStatus>;operationalConnected?:boolean};
type LinkModule={relations:number;valid:number;orphan:number;blank:number;missingField:number};
type LinkAudit={status:string;sourceRelationshipsChecked?:boolean;
  orphanReferences?:number;unverifiedFields?:number;
  modules?:Record<string,LinkModule>;operationalConnected?:boolean};
type RecordItem={id:string;title:string;kind:string;visibility:string;
  house_id:string|null;version:number;updated_at:string|null};
type RecordList={readOnly:true;total:number;items:RecordItem[]};
type HouseUnit={id:string;name:string;types:string[];
  training:string|null;domainId:string|null;status:string|null;
  strength:number|null;casualties:number|null;health:number|null;
  xp:number|null;destroyed:boolean};
type HouseHolding={id:string;name:string;catalogItem:string|null;
  status:string|null;domainId:string|null};
type HouseSheetRow={houseId:string;version:number;phase:string|null;
  units:HouseUnit[];holdings:HouseHolding[];unitCount:number;
  holdingCount:number;projectCount:number|null;courtCount:number|null;
  domainCount:number|null};
type HouseSheets={readOnly:true;total:number;units:number;holdings:number;
  items:HouseSheetRow[]};
type RecordDetail={record:RecordItem&{content:string}};
type RecordVersion={version:number;created_at:string|null;snapshot:unknown};
type VersionList={total:number;versions:RecordVersion[]};
type MailEntry={id:string;subject:string;sender_name:string|null;
  content:string;created_at:string;publication_state:string;
  recipient_house_id:string|null;origin_house_id:string|null};
type MailReply={letter_id:string;content:string;author_name:string|null;created_at:string};
type MailPage={total:number;letters:MailEntry[];replies:MailReply[];
  kpis?:{delivered:number;awaiting_house:number;awaiting_narrator:number;
    scheduled_replies_next:number;drafts:number}};
type NewspaperItem={id:string;edition_no:number;title:string;subtitle:string;
  campaign_date:string;state:string;version:number;revisions?:number;
  versionGaps?:number;duplicateVersions?:number;versionsOutOfRange?:number};
type NewspaperList={readOnly:true;total:number;revisionsAudited?:number;
  items:NewspaperItem[]};
type NewspaperDetail={edition:NewspaperItem&{blocks:unknown;pdf_path:string|null}};
type NewspaperRevision={id:number;previous_version:number;changed_at:string|null};
type NewspaperRevisions={total:number;revisions:NewspaperRevision[]};
type NewspaperRevisionDetail={revision:NewspaperRevision&{snapshot:unknown}};
type SpyAgent={id:string;owner_house_id:string;codename:string;
  status:string;mission_successes:number;kind:string|null;
  current_location_id:string|null;version:number};
type SpyMission={id:string;asset_id:string;owner_house_id:string;
  mission_kind:string;target_type:string;target_id:string;status:string;
  timeline?:{departure_key:string|null;arrival_key:string|null;
    investigation_end_key:string|null;origin_region:string|null;
    destination_region:string|null;travel_days:number|null}};
type SpyHistory={id:string;agent_id:string;owner_house_id:string;
  event_type:string|null;event_date_key:string|null;
  agent_rank:string|null;cunning:number|null;total_successes:number|null};
type SpyRemoval={agent_id:string;owner_house_id:string;
  codename:string|null;removed_at:string|null;refunded_wealth:number|null};
type SpyArchive={readOnly:true;source:string;operationalConnected:false;
  agents:{total:number;items:SpyAgent[]};
  missions:{total:number;items:SpyMission[]};
  history:{total:number;items:SpyHistory[]};
  removals:{total:number;items:SpyRemoval[]}};
const moduleLabels:Record<string,string>={
  casas:'Casas e fichas',registros:'Registros e versões',
  missivas:'Missivas e respostas',jornal:'Jornal e edições',espionagem:'Espionagem e missões',
};

async function readFirebaseArchive<T>(action:string,extra:Record<string,unknown>={}):Promise<T>{
  const auth=firebasePilotAuth();
  const token=await auth?.getToken();
  if(!token)throw Error('Sessão Firebase ausente. Entre novamente pelo portal.');
  const response=await fetch('/api/firebase-cloud-read',{
    method:'POST',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action,...extra}),
  });
  if(!response.ok)throw Error(response.status===403
    ?'Seu perfil não pode consultar este acervo.'
    :response.status===404?'Registro não localizado para esta conta.'
    :response.status===401?'A sessão expirou. Entre novamente.'
    :'O acervo real ainda não está disponível para esta consulta.');
  const data:unknown=await response.json();
  if(!data||typeof data!=='object'||!('result' in data))
    throw Error('Resposta incompleta do Firebase.');
  return (data as {result:T}).result;
}
export const Route=createFileRoute('/firebase-acervo')({
  component:FirebaseOriginalArchive,
  head:()=>({meta:[{title:'Conferência do acervo Firebase — Cormyr'}]}),
});

function FirebaseOriginalArchive(){
  const [session,setSession]=useState<Session|null>(null);
  const [houses,setHouses]=useState<House[]>([]);
  const [houseId,setHouseId]=useState('');
  const [sheetHouseId,setSheetHouseId]=useState('');
  const [sheets,setSheets]=useState<HouseSheets|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [links,setLinks]=useState<LinkAudit|null>(null);
  const [records,setRecords]=useState<RecordList|null>(null);
  const [record,setRecord]=useState<RecordDetail|null>(null);
  const [versions,setVersions]=useState<VersionList|null>(null);
  const [mail,setMail]=useState<MailPage|null>(null);
  const [mailBox,setMailBox]=useState('');
  const [mailText,setMailText]=useState('');
  const [mailWeek,setMailWeek]=useState('');
  const [mailPage,setMailPage]=useState(0);
  const [newspapers,setNewspapers]=useState<NewspaperList|null>(null);
  const [newspaper,setNewspaper]=useState<NewspaperDetail|null>(null);
  const [paperRevisions,setPaperRevisions]=useState<NewspaperRevisions|null>(null);
  const [paperRevision,setPaperRevision]=useState<NewspaperRevisionDetail|null>(null);
  const [paperPage,setPaperPage]=useState(0);
  const [spies,setSpies]=useState<SpyArchive|null>(null);
  const [spyHouseId,setSpyHouseId]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const current=++generation.current;
    void (async()=>{
      try{
        const checked=await readFirebaseArchive<Session>('session');
        if(checked.authenticated!==true||
          !['narrador','jogador','editor'].includes(checked.profile)||
          !Array.isArray(checked.memberHouseIds))
          throw Error('Perfil Firebase não confirmado.');
        const catalog=checked.profile==='editor'?[]:
          await readFirebaseArchive<House[]>('listHouses');
        if(generation.current!==current)return;
        setSession(checked);
        setHouses(catalog);
        setHouseId(checked.profile==='jogador'?checked.memberHouseIds[0]??'':'');
      }catch(e){
        if(generation.current===current)setError(e instanceof Error?e.message:
          'Não foi possível confirmar o Firebase.');
      }finally{if(generation.current===current)setLoading(false);}
    })();
    return()=>{generation.current++;};
  },[]);
  const run=useCallback(async(work:()=>Promise<void>)=>{
    if(busy)return;
    const current=++generation.current;
    setBusy(true);setError('');
    try{
      await work();
      // A revoked token cannot keep an old private result on screen.
      const confirm=await readFirebaseArchive<Session>('session');
      if(!confirm.authenticated||confirm.profile!==session?.profile)
        throw Error('Permissões alteradas. Entre novamente.');
    }catch(e){
      if(generation.current===current){
        setRecords(null);setRecord(null);setVersions(null);
        setSheets(null);
        setMail(null);setAudit(null);setLinks(null);
        setNewspapers(null);setNewspaper(null);
        setPaperRevisions(null);setPaperRevision(null);
        setSpies(null);
        setError(e instanceof Error?e.message:'Consulta indisponível.');
      }
    }finally{if(generation.current===current)setBusy(false);}
  },[busy,session?.profile]);
  const inspect=()=>void run(async()=>{
    const [m,l]=await Promise.all([
      readFirebaseArchive<Audit>('inspectWorkspaceImport'),
      readFirebaseArchive<LinkAudit>('inspectWorkspaceLinks'),
    ]);
    if(m.status!=='complete'||l.status!=='complete')throw Error('Importação ainda não conferida.');
    setAudit(m);setLinks(l);
  });
  const loadHouseSheets=()=>void run(async()=>{
    const result=await readFirebaseArchive<HouseSheets>('listOriginalHouseSheets',
      sheetHouseId?{houseId:sheetHouseId}:{});
    if(result.readOnly!==true||!Array.isArray(result.items)||
       !Number.isSafeInteger(result.units)||!Number.isSafeInteger(result.holdings))
      throw Error('Acervo das fichas nobres inconsistente.');
    setSheets(result);
  });
  const loadRecords=()=>void run(async()=>{
    setRecord(null);setVersions(null);
    const result=await readFirebaseArchive<RecordList>('listOriginalRecords',{
      ...(houseId?{houseId}:{}),
    });
    if(result.readOnly!==true||!Array.isArray(result.items))
      throw Error('Inventário dos registros inconsistente.');
    setRecords(result);
  });
  const openRecord=(id:string)=>void run(async()=>{
    setRecord(null);setVersions(null);
    const result=await readFirebaseArchive<RecordDetail>('getOriginalRecord',{recordId:id});
    if(result.record?.id!==id||typeof result.record.content!=='string')
      throw Error('Registro indisponível.');
    setRecord(result);
  });
  const loadVersions=()=>void run(async()=>{
    if(!record)return;
    const result=await readFirebaseArchive<VersionList>('listOriginalRecordVersions',{
      recordId:record.record.id,
    });
    if(!Array.isArray(result.versions))throw Error('Histórico inconsistente.');
    setVersions(result);
  });
  const loadMail=(page:number)=>void run(async()=>{
    setMail(null);
    const filters:Record<string,unknown>={};
    if(mailBox)filters['box']=mailBox;
    if(mailText.trim())filters['text']=mailText.trim();
    if(mailWeek.trim())filters['number']=mailWeek.trim();
    const result=await readFirebaseArchive<MailPage>('listOriginalMail',{
      filters,page,size:20,
    });
    if(!Array.isArray(result.letters)||!Array.isArray(result.replies)||
      !Number.isSafeInteger(result.total))
      throw Error('Consulta de missivas inconsistente.');
    setMailPage(page);setMail(result);
  });
  const loadNewspapers=()=>void run(async()=>{
    setNewspaper(null);setPaperRevisions(null);setPaperRevision(null);
    const result=await readFirebaseArchive<NewspaperList>('listOriginalNewspapers');
    if(result.readOnly!==true||!Array.isArray(result.items))
      throw Error('Inventário editorial inconsistente.');
    setNewspapers(result);
  });
  const openNewspaper=(editionId:string)=>void run(async()=>{
    setNewspaper(null);setPaperRevisions(null);setPaperRevision(null);
    const result=await readFirebaseArchive<NewspaperDetail>(
      'getOriginalNewspaper',{editionId});
    if(result.edition?.id!==editionId||!Array.isArray(result.edition.blocks))
      throw Error('Edição indisponível.');
    setNewspaper(result);
  });
  const loadPaperHistory=(page:number)=>void run(async()=>{
    if(!newspaper)return;
    setPaperRevision(null);
    const result=await readFirebaseArchive<NewspaperRevisions>(
      'listOriginalNewspaperRevisions',{
        editionId:newspaper.edition.id,page,size:20,
      });
    if(!Array.isArray(result.revisions))throw Error('Histórico editorial inconsistente.');
    setPaperPage(page);setPaperRevisions(result);
  });
  const openPaperRevision=(revisionId:number)=>void run(async()=>{
    if(!newspaper)return;
    const result=await readFirebaseArchive<NewspaperRevisionDetail>(
      'getOriginalNewspaperRevision',{
        editionId:newspaper.edition.id,revisionId,
      });
    if(result.revision?.id!==revisionId)throw Error('Versão não localizada.');
    setPaperRevision(result);
  });
  const loadSpies=()=>void run(async()=>{
    const result=await readFirebaseArchive<SpyArchive>('listOriginalSpies',
      spyHouseId?{houseId:spyHouseId}:{});
    if(result.readOnly!==true||!Array.isArray(result.agents?.items)||
       !Array.isArray(result.missions?.items)||
       !Array.isArray(result.history?.items)||!Array.isArray(result.removals?.items))
      throw Error('Acervo de espionagem inconsistente.');
    setSpies(result);
  });
  const canView=session?.profile==='narrador'||session?.profile==='jogador';
  return <main className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
    <header className="space-y-2 border-b pb-4">
      <p className="text-sm opacity-70">Cormyr Chronicle Atlas · Firebase</p>
      <h1 className="text-2xl font-semibold">Conferência do acervo original</h1>
      <p className="text-sm">Consulta privada dos dados reais importados. Somente leitura:
        nenhuma ação aqui altera missivas, fichas, versões, espiões ou o jornal.
        O Conselho e suas telas originais permanecem separados.</p>
      <div className="flex flex-wrap gap-4">
        <a className="underline text-sm" href="/firebase-access">Voltar ao Conselho</a>
        <a className="underline text-sm" href="/firebase-missivas">
          Abrir missivas com todos os filtros originais
        </a>
      </div>
    </header>
    {loading&&<p role="status">Validando a sessão no Firebase…</p>}
    {error&&<p role="alert" className="rounded border p-3 text-sm">{error}</p>}
    {!loading&&!session&&<p className="text-sm">Entre pelo portal Firebase e
      abra este endereço na mesma aba para conferir o acervo.</p>}
    {session&&<p className="text-sm">Perfil autorizado nesta sessão:
      <strong> {session.profile==='narrador'?'Narrador':
        session.profile==='editor'?'Editor-Chefe':'Jogador'}</strong>.</p>}
    {session?.profile==='narrador'&&<p className="text-sm">
      <a className="underline" href="/firebase-hub">Abrir HUB Temporal Firebase
        para configurar a semana oficial</a>
    </p>}
    {session?.profile==='narrador'&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Integridade dos dados importados</h2>
      <p className="text-sm">Totais e integridade dos vínculos, sem abrir conteúdos
        particulares de outras Casas.</p>
      <button type="button" className="rounded border px-3 py-2 text-sm"
        disabled={busy} onClick={inspect}>Conferir acervo no Firestore</button>
      {audit&&links&&<>
        <p className="text-sm">Tabelas importadas: <strong>{audit.tablesImported}</strong>.
          Registros: <strong>{audit.rowsImported}</strong>.
          Referências órfãs: <strong>{links.orphanReferences}</strong>.
          Campos sem correspondência: <strong>{links.unverifiedFields}</strong>.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left"><th className="p-2">Módulo</th>
            <th className="p-2">Linhas</th><th className="p-2">Tabelas</th>
            <th className="p-2">Vínculos órfãos</th></tr></thead>
          <tbody>{Object.entries(audit.modules??{}).map(([key,item])=>
            <tr key={key} className="border-t"><td className="p-2">
              {moduleLabels[key]??key}</td><td className="p-2">{item.rows}</td>
              <td className="p-2">{item.tablesImported}/{item.tablesExpected}</td>
              <td className="p-2">{links.modules?.[key]?.orphan??'—'}</td></tr>)}</tbody>
        </table></div>
        <p className="text-xs opacity-75">Estes totais não comprovam gravações
          operacionais, sincronização de alterações posteriores ou habilitação
          automática das interfaces.</p>
      </>}
    </section>}
    {(session?.profile==='editor'||session?.profile==='narrador')&&
      <p className="text-sm">
        <a className="underline" href="/firebase-redacao">
          Abrir redação operacional Firebase (se a rodada estiver habilitada)
        </a>
      </p>}
    {session?.profile==='editor'&&<section className="rounded border p-4 text-sm">
      O Editor-Chefe pode conferir o acervo integral do jornal abaixo,
      mas não tem acesso a missivas ou documentos particulares das Casas.
    </section>}
    {session&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">A Folha Sem Selo · Acervo editorial real</h2>
      <p className="text-sm">Edições preservadas no Firebase. Os 355 registros de
        alterações são versões históricas, não novas edições.
        Nenhum botão desta tela publica, edita ou apaga o jornal.</p>
      <button type="button" disabled={busy} onClick={loadNewspapers}
        className="rounded border px-3 py-2 text-sm">Consultar edições importadas</button>
      {newspapers&&<div className="space-y-2">
        <p className="text-sm">Edições visíveis: {newspapers.total}.
          {newspapers.revisionsAudited!==undefined&&
            <> Revisões editoriais preservadas: {newspapers.revisionsAudited}.</>}
        </p>
        {newspapers.items.map(item=><div key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm">
          <div>
            <strong>Edição {item.edition_no} · {item.title}</strong>
            <p>{item.campaign_date} · {item.state} · versão {item.version}</p>
            {item.revisions!==undefined&&<p className="text-xs">
              Revisões: {item.revisions} · lacunas: {item.versionGaps??0}
              {' '}· repetidas: {item.duplicateVersions??0}
              {' '}· fora da sequência: {item.versionsOutOfRange??0}
            </p>}
          </div>
          <button type="button" disabled={busy} onClick={()=>openNewspaper(item.id)}
            className="underline">Conferir edição</button>
        </div>)}
      </div>}
      {newspaper&&<article className="space-y-3 rounded border p-3">
        <h3 className="font-semibold">{newspaper.edition.title}
          {' '}· Edição {newspaper.edition.edition_no}</h3>
        <p className="text-sm">{newspaper.edition.subtitle}</p>
        <p className="text-sm">Estado: {newspaper.edition.state}.
          Conteúdo dos blocos preservado como no banco de origem.</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
          {JSON.stringify(newspaper.edition.blocks,null,2)}
        </pre>
        {session.profile!=='jogador'&&<>
          <button type="button" disabled={busy} onClick={()=>loadPaperHistory(0)}
            className="rounded border px-3 py-2 text-sm">Conferir histórico desta edição</button>
          {paperRevisions&&<div className="space-y-2">
            <p className="text-sm">Alterações desta edição: {paperRevisions.total}</p>
            {paperRevisions.revisions.map(v=><div key={v.id}
              className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm">
              <span>Versão anterior {v.previous_version}
                {' '}· {v.changed_at??'sem data'}</span>
              <button className="underline" type="button" disabled={busy}
                onClick={()=>openPaperRevision(v.id)}>Comparar registro</button>
            </div>)}
            <div className="flex gap-4 text-sm">
              <button className="underline" type="button"
                disabled={busy||paperPage===0}
                onClick={()=>loadPaperHistory(paperPage-1)}>Anterior</button>
              <span>Página {paperPage+1}</span>
              <button className="underline" type="button"
                disabled={busy||(paperPage+1)*20>=paperRevisions.total}
                onClick={()=>loadPaperHistory(paperPage+1)}>Próxima</button>
            </div>
          </div>}
          {paperRevision&&<details open className="border-t pt-3">
            <summary className="cursor-pointer font-medium">
              Fotografia histórica v{paperRevision.revision.previous_version}</summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(paperRevision.revision.snapshot,null,2)}
            </pre>
          </details>}
        </>}
      </article>}
    </section>}
    {canView&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Fichas nobres, exércitos e construções</h2>
      <p className="text-sm">Unidades e posses originais das fichas importadas.
        São os valores históricos registrados, sem recalcular recursos,
        alterar baixas ou gerar tropas de demonstração.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Casa
          <select className="ml-2 rounded border p-2" value={sheetHouseId}
            onChange={e=>{setSheetHouseId(e.target.value);setSheets(null);}}>
            <option value="">Todas as Casas autorizadas</option>
            {houses.filter(h=>session?.profile==='narrador'||
              session?.memberHouseIds.includes(h.id)).map(h=>
              <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button type="button" className="rounded border px-3 py-2 text-sm"
          disabled={busy} onClick={loadHouseSheets}>
          Consultar fichas e unidades reais
        </button>
      </div>
      {sheets&&<div className="space-y-4">
        <p className="text-sm">Fichas: <strong>{sheets.total}</strong>.
          Unidades militares: <strong>{sheets.units}</strong>.
          Posses e construções: <strong>{sheets.holdings}</strong>.</p>
        {sheets.items.map(row=><article key={row.houseId}
          className="space-y-2 border-t py-3">
          <h3 className="font-semibold">
            {houses.find(h=>h.id===row.houseId)?.name??row.houseId}
            {' '}· Ficha v{row.version}
          </h3>
          <p className="text-xs">
            Domínios: {row.domainCount??'—'} · Membros da corte:
            {' '}{row.courtCount??'—'} · Projetos: {row.projectCount??'—'}
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Exército ({row.unitCount} unidades)
            </summary>
            {row.units.map(u=><div key={u.id} className="border-t py-2 text-sm">
              <strong>{u.name}</strong>
              <p>{u.types.join(', ')||'Tipo não informado'} ·
                {' '}Treinamento: {u.training??'—'} ·
                {' '}Situação: {u.status??'—'}</p>
              <p>Força: {u.strength??'—'} · Baixas: {u.casualties??'—'} ·
                {' '}Saúde: {u.health??'—'} · XP: {u.xp??'—'}
                {u.destroyed?' · Destruída':''}</p>
            </div>)}
            {row.units.length===0&&<p className="text-sm">
              Nenhuma unidade registrada nesta ficha histórica.</p>}
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Posses, construções e propriedades ({row.holdingCount})
            </summary>
            {row.holdings.map(h=><div key={h.id} className="border-t py-2 text-sm">
              <strong>{h.name}</strong>
              <p>Estado: {h.status??'—'} · Catálogo: {h.catalogItem??'—'}
                {' '}· Domínio: {h.domainId??'—'}</p>
            </div>)}
            {row.holdings.length===0&&<p className="text-sm">
              Nenhuma posse registrada nesta ficha histórica.</p>}
          </details>
        </article>)}
      </div>}
    </section>}
    {canView&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Registros e fichas históricos</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Casa consultada
          <select value={houseId} className="ml-2 rounded border p-2"
            onChange={e=>{setHouseId(e.target.value);setRecords(null);
              setRecord(null);setVersions(null);}}>
            {session?.profile==='narrador'&&<option value="">Todas as Casas</option>}
            {houses.filter(h=>session?.profile==='narrador'||
              session?.memberHouseIds.includes(h.id)).map(h=>
              <option value={h.id} key={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={loadRecords}
          className="rounded border px-3 py-2 text-sm">Consultar registros reais</button>
      </div>
      {records&&<div className="space-y-2">
        <p className="text-sm">Registros autorizados: {records.total}</p>
        {records.items.map(item=><div key={item.id}
          className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm">
          <span>{item.title} · {item.kind} · v{item.version}</span>
          <button className="underline" disabled={busy} type="button"
            onClick={()=>openRecord(item.id)}>Ler registro</button>
        </div>)}
        {records.total===0&&<p className="text-sm">Nenhum registro acessível
          neste escopo da campanha.</p>}
      </div>}
      {record&&<article className="space-y-3 rounded border p-3">
        <h3 className="font-semibold">{record.record.title}</h3>
        <pre className="whitespace-pre-wrap break-words text-sm">{record.record.content}</pre>
        <button type="button" disabled={busy} onClick={loadVersions}
          className="rounded border px-3 py-2 text-sm">Consultar versões anteriores</button>
        {versions&&<div className="space-y-2">
          <p className="text-sm">Versões preservadas: {versions.total}</p>
          {versions.versions.map((v,i)=><details key={i} className="border-t py-2">
            <summary className="cursor-pointer text-sm">Versão {v.version}</summary>
            <pre className="whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(v.snapshot,null,2)}</pre>
          </details>)}
        </div>}
      </article>}
    </section>}
    {canView&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Espionagem · Agentes e missões originais</h2>
      <p className="text-sm">Consulta histórica dos agentes e das operações
        importadas. Apenas Casas autorizadas pelo Firebase aparecem para o
        jogador; nenhum segredo de outras Casas ou decisão reservada
        do Narrador é incluído.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Casa
          <select className="ml-2 rounded border p-2" value={spyHouseId}
            onChange={e=>{setSpyHouseId(e.target.value);setSpies(null);}}>
            <option value="">Todas as Casas autorizadas</option>
            {houses.filter(h=>session?.profile==='narrador'||
              session?.memberHouseIds.includes(h.id)).map(h=>
              <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={loadSpies}
          className="rounded border px-3 py-2 text-sm">Consultar espionagem real</button>
      </div>
      {spies&&<div className="space-y-4">
        <div>
          <h3 className="font-semibold">Agentes ({spies.agents.total})</h3>
          {spies.agents.items.length===0&&
            <p className="text-sm">Nenhum espião histórico neste escopo.</p>}
          {spies.agents.items.map(a=><div key={a.id}
            className="border-t py-2 text-sm">
            <strong>{a.codename}</strong>
            <p>Casa: {houses.find(h=>h.id===a.owner_house_id)?.name??a.owner_house_id}
              {' '}· Estado: {a.status} · Sucessos: {a.mission_successes}
              {' '}· Versão {a.version}</p>
          </div>)}
        </div>
        <div>
          <h3 className="font-semibold">Missões ({spies.missions.total})</h3>
          {spies.missions.items.length===0&&
            <p className="text-sm">Nenhuma missão histórica neste escopo.</p>}
          {spies.missions.items.map(m=><details key={m.id}
            className="border-t py-2 text-sm">
            <summary className="cursor-pointer">
              {m.mission_kind} · {m.status}
              {' '}· {houses.find(h=>h.id===m.owner_house_id)?.name??m.owner_house_id}
            </summary>
            <p className="mt-2">Alvo registrado: {m.target_type} · {m.target_id}</p>
            {m.timeline&&<p>Trajeto: {m.timeline.origin_region??'não definido'}
              {' '}→ {m.timeline.destination_region??'não definido'}.
              Duração: {m.timeline.travel_days??'não informada'} dias.
              Partida: {m.timeline.departure_key??'—'}.
              Chegada: {m.timeline.arrival_key??'—'}.</p>}
          </details>)}
        </div>
        <div>
          <h3 className="font-semibold">Histórico dos agentes ({spies.history.total})</h3>
          {spies.history.items.map(h=><div key={h.id}
            className="border-t py-2 text-sm">
            <strong>{spies.agents.items.find(a=>a.id===h.agent_id)?.codename
              ??'Agente histórico'}</strong>
            <p>{h.event_type??'Registro'} · {h.event_date_key??'data não informada'}
              {' '}· Posto: {h.agent_rank??'—'} · Astúcia: {h.cunning??'—'}
              {' '}· Sucessos: {h.total_successes??'—'}</p>
          </div>)}
        </div>
        <div>
          <h3 className="font-semibold">Remoções registradas ({spies.removals.total})</h3>
          {spies.removals.items.map(r=><div key={r.agent_id}
            className="border-t py-2 text-sm">
            {r.codename??'Agente'} · {r.removed_at??'data não informada'}
            {' '}· Riqueza devolvida: {r.refunded_wealth??'—'}
          </div>)}
        </div>
        <p className="text-xs opacity-70">O acervo é somente leitura:
          nenhuma operação ou melhoria é comprada, movimentada ou resolvida
          por esta tela. Detalhes reservados do Narrador permanecem ocultos.</p>
      </div>}
    </section>}
    {canView&&<section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Missivas históricas</h2>
      <p className="text-sm">Filtros aplicados pelo mesmo contrato de visibilidade
        da segunda temporada. Rascunhos e mensagens particulares de outras Casas
        não são liberados ao jogador.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Caixa
          <select value={mailBox} onChange={e=>setMailBox(e.target.value)}
            className="ml-2 rounded border p-2">
            {[
              ['','Todas'],['recebidas','Recebidas'],['enviadas','Enviadas'],
              ['rascunhos','Rascunhos'],['programadas','Programadas'],
              ['historico','Histórico'],['copias','Cópias'],
              ['excluidas','Excluídas'],['lixeira','Lixeira'],
            ].map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm">Semana
          <input className="ml-2 w-20 rounded border p-2" value={mailWeek}
            inputMode="numeric" onChange={e=>setMailWeek(e.target.value)}
            placeholder="Todas"/>
        </label>
        <label className="text-sm">Buscar
          <input className="ml-2 max-w-48 rounded border p-2" value={mailText}
            onChange={e=>setMailText(e.target.value)} placeholder="Texto ou assunto"/>
        </label>
        <button type="button" disabled={busy} onClick={()=>loadMail(0)}
          className="rounded border px-3 py-2 text-sm">Consultar missivas reais</button>
      </div>
      {mail&&<div className="space-y-2">
        <p className="text-sm">Missivas visíveis: {mail.total}</p>
        {mail.letters.map(item=><details key={item.id} className="border-t py-3">
          <summary className="cursor-pointer font-medium">{item.subject}
            <span className="ml-2 text-xs opacity-70">({item.publication_state})</span>
          </summary>
          <p className="mt-2 text-sm">Remetente: {item.sender_name??'Não identificado'}</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm">{item.content}</pre>
          {mail.replies.filter(v=>v.letter_id===item.id).map((reply,i)=>
            <div className="mt-3 border-l pl-3" key={i}>
              <p className="text-sm font-medium">{reply.author_name??'Resposta'}</p>
              <pre className="whitespace-pre-wrap break-words text-sm">{reply.content}</pre>
            </div>)}
        </details>)}
        {mail.total===0&&<p className="text-sm">Nenhuma missiva neste filtro.</p>}
        <div className="flex items-center gap-4 text-sm">
          <button type="button" disabled={busy||mailPage===0}
            onClick={()=>loadMail(mailPage-1)} className="underline">Anterior</button>
          <span>Página {mailPage+1}</span>
          <button type="button" disabled={busy||(mailPage+1)*20>=mail.total}
            onClick={()=>loadMail(mailPage+1)} className="underline">Próxima</button>
        </div>
      </div>}
    </section>}
    {busy&&<p role="status" className="text-sm">Consultando o Firebase…</p>}
  </main>;
}
