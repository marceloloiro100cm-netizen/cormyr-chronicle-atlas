import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {MONTHS,formatDate} from '@/lib/calendar/harptos';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {getCampaignTimeChangeHistory,previewCampaignTimeChange,publishCampaignTimeChange,
 type CampaignTimeImpact} from '@/lib/calendar/time-command';

function timeErrorMessage(err:unknown,fallback:string):string {
 return err&&typeof err==='object'&&'message' in err?String(err.message):err instanceof Error?err.message:fallback;
}

export function TemporalAdvancePanel(){
 const clock=useCampaignTime();
 const qc=useQueryClient();
 const [desdias,setDesdias]=useState(1),[reason,setReason]=useState('Avanço da campanha');
 const [prepared,setPrepared]=useState<{version:number;impact:CampaignTimeImpact}|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState(false);
 const key=useRef<string|null>(null);
 const history=useQuery({
  queryKey:['campaign-time-change-history'],queryFn:()=>getCampaignTimeChangeHistory(10),
  refetchInterval:30000,
 });
 const version=clock.data?.version;
 useEffect(()=>{
  // Any other narrator publication invalidates stale previews.
  setPrepared(p=>p&&p.version===version?p:null);
 },[version]);
 const resetPreview=()=>{setPrepared(null);key.current=null;setMessage('');setFailure(false);};
 async function inspect(){
  if(!clock.data||busy)return;
  setBusy(true);setMessage('');setFailure(false);
  try{
   const impact=await previewCampaignTimeChange(clock.data,desdias);
   setPrepared({version:clock.data.version,impact});
   key.current=crypto.randomUUID();
  }catch(err){setPrepared(null);setFailure(true);setMessage(timeErrorMessage(err,'Falha na prévia temporal.'));}
  finally{setBusy(false);}
 }
 async function confirm(){
  if(!clock.data||!prepared||busy||prepared.version!==clock.data.version)return;
  if(!prepared.impact.can_publish){setFailure(true);setMessage('Existem Casas com calendário divergente. Concilie antes do avanço.');return;}
  if(!window.confirm(`Avançar ${prepared.impact.desdias} désdia(s), de ${formatDate(prepared.impact.from)} para ${formatDate(prepared.impact.to)}? O avanço mensal de obras não pode ser revertido automaticamente.`))return;
  setBusy(true);setFailure(false);setMessage('');
  try{
   // Preserve key on transient errors: clicking again must not process twice.
   const usedKey=key.current??=crypto.randomUUID();
   const saved=await publishCampaignTimeChange(clock.data,prepared.impact,usedKey,reason);
   qc.setQueryData(['campaign-calendar'],saved.snapshot);
   await Promise.all([
    qc.invalidateQueries({queryKey:['campaign-calendar']}),
    qc.invalidateQueries({queryKey:['noble-house']}),
    qc.invalidateQueries({queryKey:['house-realm-dashboard']}),
    qc.invalidateQueries({queryKey:['campaign-time-change-history']}),
   ]);
   setMessage(saved.duplicate?'Avanço já confirmado anteriormente; nenhum efeito duplicado.':
    `Avanço confirmado: ${formatDate(prepared.impact.to)}. Versão ${saved.snapshot.version}.`);
   setPrepared(null);key.current=null;
  }catch(err){setFailure(true);setMessage(timeErrorMessage(err,'Não foi possível confirmar o avanço.'));}
  finally{setBusy(false);}
 }
 return <section className="narrator-calendar-panel" aria-label="Hub temporal · avanço de désdia">
  <h3>Hub Temporal · Avanço oficial</h3>
  <p>O calendário de Harptos é o relógio do Reino. Abrir uma rodada de missivas não altera a data. Cada désdia avança exatamente dez dias ordinários, mesmo atravessando festivais.</p>
  <p role="status">Data publicada: <strong>{clock.data?formatDate(`${String(clock.data.year).padStart(4,'0')}-${clock.data.festival?'F-'+clock.data.festival:String(clock.data.month+1).padStart(2,'0')+'-'+String(clock.data.day).padStart(2,'0')}`):'Indisponível'}</strong>{clock.data&&` · versão ${clock.data.version}`}</p>
  <div className="narrator-calendar-settings">
   <label>Quantidade de désdias
    <input type="number" min={1} max={360} value={desdias} onChange={e=>{setDesdias(Number(e.target.value));resetPreview();}}/>
   </label>
   <label>Justificativa do avanço
    <input minLength={10} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);resetPreview();}}/>
   </label>
   <Button type="button" variant="outline" disabled={busy||!clock.data||!Number.isInteger(desdias)||desdias<1||desdias>360}
    onClick={()=>void inspect()}>Prévia do avanço</Button>
  </div>
  {prepared&&<div className="house-ledger" role="region" aria-label="Impacto do avanço temporal">
   <h4>Prévia — nenhuma alteração realizada</h4>
   <p><strong>{formatDate(prepared.impact.from)}</strong> → <strong>{formatDate(prepared.impact.to)}</strong></p>
   <p>{prepared.impact.ordinary_days} dias ordinários · {prepared.impact.months_delta} mês(es) atravessado(s) · {prepared.impact.crossed_years.length} virada(s) de ano.</p>
   <p>Projetos com prazo atingido: <strong>{prepared.impact.projects_maturing}</strong>. Casas em mês divergente: <strong>{prepared.impact.houses_drifted}</strong>.</p>
   {prepared.impact.crossed_festivals.length>0&&<p>Festivais atravessados: {prepared.impact.crossed_festivals.map(f=>f.id).join(' · ')}</p>}
   {prepared.impact.crossed_months.length>0&&<p>Meses atravessados: {prepared.impact.crossed_months.map(m=>`${MONTHS[m.month]} ${m.year}`).join(' · ')}</p>}
   {prepared.impact.crossed_years.length>0&&<p role="note">A mudança de ano foi identificada. O envelhecimento dos personagens será conectado no Lote 7; nenhuma idade é alterada neste lote.</p>}
   {!prepared.impact.can_publish&&<p role="alert">Há Casas com meses divergentes. É necessário conciliar antes de publicar.</p>}
   <Button type="button" disabled={!prepared.impact.can_publish||busy||reason.trim().length<10||prepared.version!==clock.data?.version}
    onClick={()=>void confirm()}>{busy?'Confirmando…':'Confirmar avanço de désdia'}</Button>
  </div>}
  {(message||clock.error)&&<p role={failure||clock.error?'alert':'status'}>{message||'Não foi possível consultar o tempo oficial.'}</p>}
  <details>
   <summary>Histórico de avanços do Hub Temporal</summary>
   {history.isLoading&&<p>Carregando histórico…</p>}
   {history.error&&<p role="alert">Não foi possível consultar o histórico temporal.</p>}
   {history.data?.length===0&&<p>Nenhum avanço registrado ainda pelo novo comando.</p>}
   {history.data?.map(h=><article key={h.key}><strong>{formatDate(h.from)} → {formatDate(h.to)}</strong><p>{h.desdias} désdia(s) · {h.reason} · v{h.version}</p></article>)}
  </details>
 </section>;
}
