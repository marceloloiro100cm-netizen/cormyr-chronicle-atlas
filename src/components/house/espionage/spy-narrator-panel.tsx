import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {SPY_MISSIONS} from '@/lib/espionage/missions';
import {SPY_REQUEST_FIELDS,type SpyOperation,type SpyIntelFact} from '@/lib/espionage/contracts';
import {sealSpyReport,releaseSpyReport,playerSpyReport,formatIntelLetter,type SpyReport} from '@/lib/espionage/dossier';
import {spyDateKeySchema} from '@/lib/espionage/contracts';
type Props={houseName:string;houseId:string;officialDateKey:string|null};

/** Mesa narratorial do Marco B. Todas as ações abaixo são DEMONSTRAÇÕES LOCAIS:
 * no Lote 10 uma API com is_campaign_admin, RLS e ledger versionado substituirá o estado local.
 */
export function SpyNarratorPanel({houseName,houseId,officialDateKey}:Props){
 const [kind,setKind]=useState<SpyOperation['missionKind']>('regional_recon');
 const [field,setField]=useState<string>('regional_roads');
 const [narrative,setNarrative]=useState('Ponto observado, ainda não divulgado.');
 const [reason,setReason]=useState('');
 const [routeOrigin,setRouteOrigin]=useState('');
 const [routeDestination,setRouteDestination]=useState('');
 const [routeDays,setRouteDays]=useState('');
 const [routeReview,setRouteReview]=useState('');
 const [report,setReport]=useState<SpyReport|null>(null);
 const [message,setMessage]=useState('');
 const reportDate=officialDateKey&&spyDateKeySchema.safeParse(officialDateKey).success?officialDateKey:null;
 const mission=SPY_MISSIONS[kind];
 const fields=mission.fields;
 function changeMission(value:SpyOperation['missionKind']){
  setKind(value);setField(SPY_MISSIONS[value].fields[0]!);setReport(null);setMessage('');
 }
 function sealDemo(){
  if(!reportDate){setMessage('Data oficial indisponível. Não se cria relatório datado por relógio local.');return;}
  const op:SpyOperation={id:'11111111-1111-4111-8111-111111111111',
   ownerHouseId:houseId,assetId:'22222222-2222-4222-8222-222222222222',
   targetType:mission.targets[0]!,targetId:'ALVO-FICTICIO',
   missionKind:kind,requestedFields:[field],status:'pending_narrator_review',
   sourceCalendarVersion:1,rulesVersion:'CCA-ESP-MVP-001:v1',version:1};
  const fact:SpyIntelFact={id:'33333333-3333-4333-8333-333333333333',
   dossierId:'44444444-4444-4444-8444-444444444444',sourceOperationId:op.id,
   fieldCode:field as SpyIntelFact['fieldCode'],disclosedValue:narrative.trim(),
   confidence:'partial',observedDateKey:reportDate,approvedByNarrator:true};
  try{
   const preview=sealSpyReport({id:'55555555-5555-4555-8555-555555555555',
    operation:op,code:'ES-DEMO',assetCodename:'Agente demonstrativo',
    locationLabel:'Local fictício',observedDateKey:reportDate,facts:[fact]});
   setReport(preview);setMessage('Carta de demonstração SELADA. Não está gravada nem visível a jogadores.');
  }catch(e){setMessage(e instanceof Error?e.message:'Prévia inválida.');}
 }
 function releaseDemo(){
  if(!report||!reportDate)return;
  try{
   const result=releaseSpyReport(report,{
    narratorAuthorized:true,narratorId:'narrator-simulation',
    reason,dateKey:reportDate,delivery:'explicit_communication',expectedVersion:report.version});
   setReport(result);setMessage('Liberação SIMULADA: somente a prévia abaixo mudou; nenhuma casa recebeu a carta.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível simular a liberação.');}
 }
 return <section className="house-panel" aria-label="Mesa de inteligência do Narrador">
  <p className="campaign-eyebrow">SOMENTE NARRADOR · SIMULAÇÃO LOCAL</p>
  <h3>Mesa de inteligência — {houseName}</h3>
  <p className="house-caption">As filas globais, a Lei privada dos alvos e as permissões transacionais só serão conectadas ao banco no Lote 10. Nenhuma ação desta mesa altera missivas, recursos, calendário ou dados de outras Casas.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBlock:16}}>
   <div className="house-panel"><strong>Fila de missões</strong><p>Aguardando tabelas seguras</p><small>Não interpretar como ausência real de missões.</small></div>
   <div className="house-panel"><strong>Rotas sem duração</strong><p>Cadastro administrativo pendente</p><small>Sem estimativas fictícias.</small></div>
   <div className="house-panel"><strong>Cartas seladas</strong><p>Consulta de banco pendente</p><small>Nenhum relatório privado foi carregado.</small></div>
  </div>
  <details className="house-ledger"><summary>Prévia de cadastro de rota</summary>
   <div style={{display:'grid',gap:8,maxWidth:620}}>
    <label>Origem <input value={routeOrigin} onChange={e=>setRouteOrigin(e.target.value)} placeholder="ID estável da localidade"/></label>
    <label>Destino <input value={routeDestination} onChange={e=>setRouteDestination(e.target.value)} placeholder="ID estável da localidade"/></label>
    <label>Dias-base <input type="number" min={1} max={3650} value={routeDays} onChange={e=>setRouteDays(e.target.value)}/></label>
    <label>Justificativa <textarea value={routeReview} onChange={e=>setRouteReview(e.target.value)} placeholder="Fonte e validação da rota"/></label>
    <Button disabled={!routeOrigin||!routeDestination||routeOrigin===routeDestination||!Number.isInteger(Number(routeDays))||Number(routeDays)<=0||routeReview.trim().length<10}
      onClick={()=>setMessage('Rota preparada para revisão, sem gravação. IDs, fonte e permissão deverão ser validados pelo servidor.')}>Validar rascunho de rota</Button>
   </div>
  </details>
  <details open className="house-ledger"><summary>Adjudicação e carta — cenário fictício</summary>
   <div style={{display:'grid',gap:10,maxWidth:720}}>
    <label>Categoria de missão <select value={kind} onChange={e=>changeMission(e.target.value as SpyOperation['missionKind'])}>
     {Object.entries(SPY_MISSIONS).map(([id,m])=><option key={id} value={id}>{m.title}</option>)}
    </select></label>
    <label>Campo autorizado para a demonstração <select value={field} onChange={e=>{setField(e.target.value);setReport(null);}}>
     {fields.map(code=><option key={code} value={code}>{code.replaceAll('_',' ')}</option>)}
    </select></label>
    <label>Informação ilustrativa <textarea value={narrative} onChange={e=>setNarrative(e.target.value)} maxLength={1000}/></label>
    <p>Classificação: {SPY_REQUEST_FIELDS.find(f=>f.code===field)?.classification??'indefinida'} · dificuldade real: sob avaliação do Narrador.</p>
    <p>Data de Harptos publicada: {reportDate??'Indisponível'}</p>
    <Button type="button" disabled={!reportDate||!narrative.trim()} onClick={sealDemo}>Selar carta demonstrativa</Button>
    {report&&<div style={{padding:12,border:'1px solid var(--border, #9996)',borderRadius:10}}>
     <p><strong>ES-DEMO</strong> · {report.state==='sealed'?'Selada':'Liberada (simulação)'}</p>
     <p>Esta carta é fictícia e não foi entregue a jogador algum.</p>
     {report.state==='sealed'&&<>
      <label>Justificativa da autorização de comunicação <textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <Button type="button" disabled={reason.trim().length<10} onClick={releaseDemo}>Simular liberação da carta</Button>
     </>}
     {report.state!=='sealed'&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit'}}>{formatIntelLetter(report,houseId)}</pre>}
     {report.state==='sealed'&&<p>Prévia selada: nenhuma informação será projetada na visão do jogador.</p>}
    </div>}
    {message&&<p role="status">{message}</p>}
   </div>
  </details>
  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
   <Button disabled>Concluir deslocamento (exige RPC)</Button>
   <Button disabled>Resolver missão real (exige RPC)</Button>
   <Button disabled>Publicar carta real (exige RLS e auditoria)</Button>
  </div>
 </section>;
}
