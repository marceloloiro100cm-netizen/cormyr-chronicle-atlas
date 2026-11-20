import {useEffect,useState,type FormEvent} from 'react';
import {FESTIVALS,MONTHS,formatCampaignPeriod} from '@/lib/calendar/harptos';
import {buildThirdTendayRequest} from '@/lib/calendar/firebase-third-tenday';
import {nextTendayStart,crossesMonth} from '@/lib/calendar/firebase-next-tenday';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {activateImportedHouses,HouseActivationClientError,houseActivationMessage}
  from '@/lib/house/firebase-house-activation-client';

type DateView={year:number;month:number;day:number;festival:string|null;};
type WeekDraft={
  draftVersion:number;expectedCalendarVersion:number;proposedDate:DateView;
  proposedOpenRound:number;reason:string;updatedAt:string;status:'pending';
};
type WeekView={
  archivedCalendar:DateView&{version:number};
  draft:WeekDraft|null;editable:boolean;
  calendarPublished:boolean;mailEnabled:boolean;saved?:boolean;
  requiresReconciliation?:boolean;
  operationalCalendar?:(DateView&{version:number})|null;
  openRound?:number|null;
  pendingHouseEffectMonths?:number;
};
type HistoryItem={id:string;action:string;at:string;from:DateView|null;to:DateView|null;
  fromRound:number|null;toRound:number|null;monthsCrossed:number;reason:string|null};

async function requestWeek<T=WeekView>(action:'get'|'save'|'publish'|'advance'|'history'|'publishEvents'|'processHouseMonths',fields?:Record<string,unknown>):Promise<T>{
  const auth=firebasePilotAuth();
  const token=await auth?.getToken();
  if(!token)throw Error('Entre novamente com sua conta de Narrador.');
  const r=await fetch('/api/firebase-narrator-week',{
    method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...(fields??{})}),
  });
  if(!r.ok)throw Error(r.status===401
    ?'Sua sessão Firebase expirou. Entre novamente.'
    :r.status===403?'Somente o Narrador autorizado pode configurar esta proposta.'
    :r.status===409?await conflictMessage(r)
    :r.status===400?'Revise a data, a rodada e a justificativa.'
    :'A configuração da semana está indisponível neste momento.');
  const body:unknown=await r.json();
  if(!body||typeof body!=='object'||!('result' in body))
    throw Error('Resposta inválida do Firebase.');
  return (body as {result:T}).result;
}

async function conflictMessage(r:Response){
  try{
    const b=await r.clone().json();
    if(b?.error==='house_effects_acknowledgement_required')
      return 'Esta abertura vira o mês: confirme que os efeitos mensais das Casas ficam pendentes.';
    if(b?.error==='campaign_not_launched')return 'A campanha ainda não foi publicada no Firebase.';
  }catch{/* sem corpo */}
  return 'O calendário ou a proposta mudou. Atualize antes de salvar.';
}

/**
 * Weekly opening after launch: one round forward, one decision, audited.
 * Scheduled letters of the new round are delivered automatically and the
 * previous week's letters stop being editable or cancellable.
 */
function WeeklyAdvance({view,onDone}:{view:WeekView;onDone:()=>void}){
  const current=view.operationalCalendar!;
  const suggestion=nextTendayStart(current);
  const [date,setDate]=useState(suggestion);
  const [reason,setReason]=useState('');
  const [ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [history,setHistory]=useState<HistoryItem[]|null>(null);
  const [key]=useState(()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'k'+Date.now());
  const monthTurn=crossesMonth(current,date);
  useEffect(()=>{void requestWeek<HistoryItem[]>('history').then(setHistory).catch(()=>setHistory([]));},[view.openRound]);
  async function advance(event:FormEvent){
    event.preventDefault();
    if(busy)return;
    if(!window.confirm(`Fechar a Semana ${view.openRound} e abrir a Semana ${(view.openRound??0)+1} em ${formatCampaignPeriod(date)}? Envios da semana atual deixam de ser editáveis e as programadas para a nova semana são entregues.`))return;
    setBusy(true);setMessage('');
    try{
      const r=await requestWeek<{openRound:number;publishedEvents?:number;
        houses?:{results?:{status:string;completedProjects?:number}[];error?:string}|null}>('advance',{expectedCalendarVersion:current.version,
        expectedOpenRound:view.openRound,proposedDate:date,reason:reason.trim(),requestKey:key,
        ...(monthTurn?{acknowledgeHouseEffectsPending:ack}:{})});
      const processed=r.houses?.results?.filter(x=>x.status==='processed').length??0;
      const works=r.houses?.results?.reduce((n,x)=>n+(x.completedProjects??0),0)??0;
      setMessage(`Semana ${r.openRound} aberta.`+(r.publishedEvents?` ${r.publishedEvents} evento(s) do calendário publicado(s).`:'')+
        (r.houses?.error?' O processamento mensal das Casas ficou pendente: use "Processar efeitos mensais".':
         r.houses?` ${processed} Casa(s) processada(s) para o novo mês; ${works} obra(s) concluída(s).`:''));onDone();
    }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível abrir a semana.');}
    finally{setBusy(false);}
  }
  const num=(v:string)=>Number.parseInt(v,10);
  return <div className="rounded border p-4 space-y-3">
    <h3 className="font-semibold">Abrir a próxima semana</h3>
    <p className="text-sm">Ao abrir a semana: os envios da semana atual deixam de poder ser editados ou cancelados,
      as missivas programadas para a nova semana são entregues e os eventos do calendário em rascunho são publicados.</p>
    <p className="text-sm">Semana aberta agora: {view.openRound}. A próxima será a Semana {(view.openRound??0)+1}.
      Sugestão: início da próxima désdia ({date.day}/{date.month+1}/{date.year} CV).</p>
    {(view.pendingHouseEffectMonths??0)>0&&<p role="status" className="text-sm rounded border p-2">
      Efeitos mensais das Casas ainda não processados: {view.pendingHouseEffectMonths} mês(es). Use "Processar efeitos mensais pendentes".</p>}
    <form onSubmit={e=>void advance(e)} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm">Ano (CV)<input type="number" min="1" max="9999" required className="block w-full rounded border p-2"
          value={date.year} onChange={e=>setDate({...date,year:num(e.target.value)})}/></label>
        <label className="text-sm">Mês<select className="block w-full rounded border p-2" value={date.month}
          onChange={e=>setDate({...date,month:num(e.target.value),festival:null})}>
          {MONTHS.map((name,index)=><option key={name} value={index}>{name}</option>)}</select></label>
        <label className="text-sm">Dia<input type="number" min="1" max="30" required className="block w-full rounded border p-2"
          value={date.day} disabled={Boolean(date.festival)} onChange={e=>setDate({...date,day:num(e.target.value)})}/></label>
      </div>
      <label className="block text-sm">Festival (opcional)<select className="block w-full rounded border p-2" value={date.festival??''}
        onChange={e=>{const f=FESTIVALS.find(x=>x.id===e.target.value);
          setDate(f?{...date,festival:f.id,month:f.month,day:30}:{...date,festival:null});}}>
        <option value="">Dia comum da campanha</option>
        {FESTIVALS.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="block text-sm">Justificativa<textarea minLength={12} maxLength={300} required rows={2}
        className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="Ex.: Fechamento da semana e abertura da próxima désdia"/></label>
      {monthTurn&&<label className="flex gap-2 text-sm rounded border p-2">
        <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
        Esta abertura vira o mês. Confirmo que as obras e posses das Casas ativadas serão processadas
        pelo motor de regras para o novo mês; Casas ainda não ativadas recuperam o mês ao serem ativadas.</label>}
      <button type="submit" disabled={busy||(monthTurn&&!ack)} className="rounded border px-4 py-2 disabled:opacity-50">
        {busy?'Abrindo…':`Fechar Semana ${view.openRound} e abrir Semana ${(view.openRound??0)+1}`}</button>
    </form>
    <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={async()=>{
      if(!window.confirm('Conferir e ativar individualmente as Casas da temporada no Firebase, preservando fichas e tesouros importados? Não será aberta outra semana.'))return;
      setBusy(true);setMessage('Conferindo o catálogo de Casas no Firebase…');
      try{
        const auth=firebasePilotAuth(),uid=auth?.current()?.uid;
        const token=await auth?.getToken();
        if(!uid||!token||uid!==auth?.current()?.uid)
          throw Error('Sua sessão Firebase expirou. Entre novamente como Narrador.');
        const result=await activateImportedHouses({token,onProgress:p=>{
          setMessage('Casas verificadas: '+p.processed+'/'+p.total+
            ' · ativadas: '+p.activated+' · já existentes: '+p.alreadyInitialized+
            ' · pendentes: '+p.needsReview+'.');
        }});
        if(uid!==auth?.current()?.uid)
          throw Error('A sessão de Narrador mudou durante a operação. Recarregue antes de continuar.');
        const pending=result.results.filter(x=>x.status!=='activated'&&x.status!=='already_initialized');
        setMessage(result.total===0?'Nenhuma Casa ativa foi encontrada no catálogo. Nenhum registro foi criado.':
          'Ativação concluída: '+result.activated+' Casa(s) inicializada(s), '+
          result.alreadyInitialized+' já ativa(s), '+pending.length+' para revisão.'+
          (pending.length?' Pendências: '+pending.map(x=>x.houseId+
            ' ('+houseActivationMessage(x.status)+')').join('; ')+'.':''));
        onDone();
      }catch(e){
        if(e instanceof HouseActivationClientError&&e.progress)
          setMessage('Ativação interrompida depois de '+e.progress.processed+
            ' de '+e.progress.total+' Casas: '+e.message+
            ' Até aqui, '+e.progress.activated+' ativadas e '+
            e.progress.alreadyInitialized+' já existentes. É seguro conferir e repetir: Casas existentes não são sobrescritas.');
        else setMessage(e instanceof Error?e.message:'A ativação não foi confirmada pelo servidor.');
      }finally{setBusy(false);}}}>Ativar todas as Casas com as fichas importadas</button>
    {(view.pendingHouseEffectMonths??0)>0&&<button type="button" disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={async()=>{
      setBusy(true);setMessage('');
      try{const r=await requestWeek<{results:{status:string}[]}>('processHouseMonths');
        setMessage(`Processamento mensal: ${r.results.filter(x=>x.status==='processed').length} Casa(s) atualizada(s), ${r.results.filter(x=>x.status==='already_current').length} já em dia.`);onDone();}
      catch(e){setMessage(e instanceof Error?e.message:'Falha no processamento mensal.');}
      finally{setBusy(false);}}}>Processar efeitos mensais pendentes</button>}
    <button type="button" disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={async()=>{
      setBusy(true);setMessage('');
      try{const r=await requestWeek<{published:number}>('publishEvents');
        setMessage(r.published?`${r.published} evento(s) do calendário publicado(s).`:'Nenhum evento pendente de publicação.');}
      catch(e){setMessage(e instanceof Error?e.message:'Falha ao publicar eventos.');}
      finally{setBusy(false);}}}>Publicar eventos do calendário sem abrir semana</button>
    </div>
    {message&&<p role="status" className="text-sm">{message}</p>}
    <details><summary className="text-sm">Histórico de aberturas</summary>
      {history===null?<p className="text-sm">Carregando…</p>:history.length===0?<p className="text-sm">Nenhum registro.</p>:
      <ul className="text-sm">{history.map(h=><li key={h.id}>
        {new Date(h.at).toLocaleString('pt-BR')} · {h.action==='launch_firebase_campaign'?'Lançamento':'Abertura'}
        {h.toRound?` da Semana ${h.toRound}`:''}{h.to?` em ${h.to.day}/${h.to.month+1}/${h.to.year}`:''}
        {h.monthsCrossed?` · ${h.monthsCrossed} mês(es) com efeitos pendentes`:''}{h.reason?` · ${h.reason}`:''}</li>)}</ul>}
    </details>
  </div>;
}

/**
 * The user explicitly selects the desired official week and round.
 * Save persists a pending document; it never advances historical time,
 * publishes a season or opens operational House/Mail writes.
 */
export function FirebaseNarratorWeekDraft(){
  const [loaded,setLoaded]=useState<WeekView|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [year,setYear]=useState('');
  const [month,setMonth]=useState('');
  const [day,setDay]=useState('');
  const [festival,setFestival]=useState('');
  const [round,setRound]=useState('');
  const [reason,setReason]=useState('');
  const [adoptSource,setAdoptSource]=useState(false);

  function populate(v:WeekView){
    setLoaded(v);
    const date=v.draft?.proposedDate??v.operationalCalendar??v.archivedCalendar;
    setYear(String(date.year));setMonth(String(date.month));
    setDay(String(date.day));setFestival(date.festival??'');
    setRound(v.draft?String(v.draft.proposedOpenRound):'');
    setReason(v.draft?.reason??'');
  }
  useEffect(()=>{
    let active=true;
    void requestWeek('get').then(v=>{
      if(active)populate(v);
    }).catch(e=>{
      if(active)setMessage(e instanceof Error?e.message:'Serviço indisponível.');
    });
    return()=>{active=false;};
  },[]);

  async function refresh(){
    if(busy)return;
    setBusy(true);setMessage('');
    try{populate(await requestWeek('get'));}
    catch(e){setMessage(e instanceof Error?e.message:'Falha na consulta.');}
    finally{setBusy(false);}
  }
  async function prepareThirdTenday(){
    if(busy||!loaded||!loaded.editable||loaded.calendarPublished)return;
    setBusy(true);setMessage('');
    try{
      const proposal=buildThirdTendayRequest(
        loaded.archivedCalendar,loaded.draft?.draftVersion??0);
      const result=await requestWeek('save',proposal);
      populate(result);
      setMessage('A 3ª désdia (dia 21) e a rodada 3 foram salvas como proposta. Revise abaixo e confirme a publicação.');
    }catch(e){
      setMessage(e instanceof Error?e.message:'Não foi possível preparar a terceira désdia.');
    }finally{setBusy(false);}
  }
  async function save(event:FormEvent){
    event.preventDefault();
    if(busy||!loaded)return;
    setBusy(true);setMessage('');
    try{
      const v=await requestWeek('save',{
        expectedCalendarVersion:loaded.archivedCalendar.version,
        expectedDraftVersion:loaded.draft?.draftVersion??0,
        proposedDate:{year:Number(year),month:Number(month),
          day:Number(day),festival:festival||null},
        openRound:Number(round),reason:reason.trim(),
      });
      populate(v);
      setMessage('Proposta registrada no Firebase, com auditoria. Ainda não publicada na campanha.');
    }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar.');}
    finally{setBusy(false);}
  }
  async function publish(){
    if(busy||!loaded?.draft||!adoptSource)return;
    setBusy(true);setMessage('');
    try{
      await requestWeek('publish',{expectedDraftVersion:loaded.draft.draftVersion,
        adoptFirebaseSource:true});
      window.location.reload();
    }catch(e){setMessage(e instanceof Error?e.message:'Falha na publicação.');}
    finally{setBusy(false);}
  }
  return <section aria-label="Configuração de semana pelo Narrador no Firebase"
    className="rounded border border-amber-800/40 p-4 space-y-3">
    <div>
      <h2 className="text-xl font-semibold">HUB Temporal · Administração Firebase</h2>
      <p className="text-sm opacity-80">
        Configure a data e a rodada inicial da campanha. Salve para conferir
        os valores e publique para abrir as missivas e a edição do jornal.
        O histórico importado será preservado.
      </p>
    </div>
    {!loaded?<div className="space-y-2">
      <p role="status">{message||'Carregando calendário e permissões…'}</p>
      <button type="button" className="rounded border px-3 py-1" disabled={busy}
        onClick={()=>void refresh()}>Tentar novamente</button>
    </div>:<>
      <p className="text-sm">Calendário histórico preservado: versão
        {' '}{loaded.archivedCalendar.version}. Nenhuma rodada foi inferida
        do histórico.</p>
      <p className="text-sm rounded border p-3">
        No calendário de Harptos, a 2ª désdia termina no dia 20 e a
        <strong> 3ª désdia começa no dia 21</strong>. A rodada 3 das
        Missivas é configurada explicitamente, não deduzida da data.
      </p>
      {loaded.requiresReconciliation&&<p role="alert" className="rounded border p-3">
        O calendário operacional já está ativo, mas contém versões ou
        aprovações inconsistentes. Não é seguro preparar ou publicar outra
        rodada antes da reconciliação técnica.
      </p>}
      {!loaded.calendarPublished&&loaded.editable&&!loaded.requiresReconciliation&&<button type="button"
        disabled={busy} onClick={()=>void prepareThirdTenday()}
        className="rounded border px-4 py-2 disabled:opacity-50">
        Preparar 3ª désdia e rodada 3 com a data oficial
      </button>}
      {loaded.draft&&!loaded.calendarPublished&&<p className="text-sm">
        Proposta anterior: versão {loaded.draft.draftVersion} · pendente de publicação.
      </p>}
      {loaded.calendarPublished&&<p role="status" className="rounded border p-3">
        Calendário operacional publicado:
        {' '}{loaded.operationalCalendar
          ?formatCampaignPeriod(loaded.operationalCalendar)
          :'versão operacional não disponível'}.
        {' '}Rodada aberta: {loaded.openRound??'não confirmada'}.
        {' '}{loaded.mailEnabled
          ?'Controles de Missivas alinhados nos dois runtimes.'
          :'Missivas ainda bloqueadas: os dois runtimes não estão alinhados.'}
        {' '}O histórico importado permanece preservado.
      </p>}
      {loaded.calendarPublished&&loaded.operationalCalendar&&loaded.mailEnabled&&
        <WeeklyAdvance key={String(loaded.openRound)} view={loaded} onDone={()=>void refresh()}/>}
      {!loaded.calendarPublished&&loaded.editable&&<form onSubmit={event=>void save(event)} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">Ano (CV)
            <input type="number" min="1" max="9999" required
              className="block w-full rounded border p-2"
              value={year} onChange={e=>setYear(e.target.value)}/>
          </label>
          <label className="text-sm">Mês
            <select className="block w-full rounded border p-2"
              value={month} disabled={Boolean(festival)}
              onChange={e=>setMonth(e.target.value)}>
              {MONTHS.map((name,index)=><option key={name} value={index}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm">Dia
            <input type="number" min="1" max="30" required
              className="block w-full rounded border p-2"
              value={day} disabled={Boolean(festival)}
              onChange={e=>setDay(e.target.value)}/>
          </label>
        </div>
        <label className="block text-sm">Festival (opcional)
          <select className="block w-full rounded border p-2" value={festival}
            onChange={e=>{
              const selected=e.target.value;
              setFestival(selected);
              if(selected){
                setDay('30');
                const f=FESTIVALS.find(x=>x.id===selected);
                if(f)setMonth(String(f.month));
              }
            }}>
            <option value="">Dia comum da campanha</option>
            {FESTIVALS.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Rodada que deseja abrir
          <input type="number" min="1" max="2147483647" required
            className="block w-full rounded border p-2"
            value={round} onChange={e=>setRound(e.target.value)}
            placeholder="Informe a rodada oficial — não é preenchida automaticamente"/>
        </label>
        <label className="block text-sm">Justificativa da configuração
          <textarea minLength={12} maxLength={300} required rows={2}
            className="block w-full rounded border p-2"
            value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Ex.: Abertura da próxima désdia após conferência do Narrador"/>
        </label>
        <button type="submit" disabled={busy||!loaded.editable}
          className="rounded border px-4 py-2 disabled:opacity-50">
          {busy?'Salvando…':'Salvar proposta no Firebase'}
        </button>
        <button type="button" disabled={busy}
          onClick={()=>void refresh()} className="ml-2 rounded border px-3 py-2">
          Atualizar
        </button>
      </form>}
      {!loaded.calendarPublished&&loaded.editable&&loaded.draft&&<div className="rounded border p-4 space-y-3">
        <h3 className="font-semibold">Publicar configuração inicial</h3>
        <p className="text-sm">Rodada {loaded.draft.proposedOpenRound} ·
          {' '}{loaded.draft.proposedDate.day}/{loaded.draft.proposedDate.month+1}/{loaded.draft.proposedDate.year} CV.
          A publicação usa estes valores salvos, sem entregar cartas antigas novamente.
          Novas missivas serão entregues na rodada definida.</p>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={adoptSource}
            onChange={e=>setAdoptSource(e.target.checked)}/>
          Confirmo os dados importados no Firebase como base oficial e esta data e rodada.
        </label>
        <button type="button" disabled={busy||!adoptSource}
          className="rounded border px-4 py-2 disabled:opacity-50"
          onClick={()=>void publish()}>Publicar semana e abrir missivas</button>
      </div>}
      {message&&<p role="status" className="text-sm">{message}</p>}
    </>}
  </section>;
}

