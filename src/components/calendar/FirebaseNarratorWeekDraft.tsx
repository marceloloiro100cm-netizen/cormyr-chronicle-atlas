import {useEffect,useState,type FormEvent} from 'react';
import {FESTIVALS,MONTHS} from '@/lib/calendar/harptos';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type DateView={year:number;month:number;day:number;festival:string|null;};
type WeekDraft={
  draftVersion:number;expectedCalendarVersion:number;proposedDate:DateView;
  proposedOpenRound:number;reason:string;updatedAt:string;status:'pending';
};
type WeekView={
  archivedCalendar:DateView&{version:number};
  draft:WeekDraft|null;editable:boolean;
  calendarPublished:boolean;mailEnabled:boolean;saved?:boolean;
};

async function requestWeek(action:'get'|'save'|'publish',fields?:Record<string,unknown>):Promise<WeekView>{
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
    :r.status===409?'O calendário ou a proposta mudou. Atualize antes de salvar.'
    :r.status===400?'Revise a data, a rodada e a justificativa.'
    :'A configuração da semana está indisponível neste momento.');
  const body:unknown=await r.json();
  if(!body||typeof body!=='object'||!('result' in body))
    throw Error('Resposta inválida do Firebase.');
  return (body as {result:WeekView}).result;
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
    const date=v.draft?.proposedDate??v.archivedCalendar;
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
      {loaded.draft&&<p className="text-sm">
        Proposta anterior: versão {loaded.draft.draftVersion} · pendente de publicação.
      </p>}
      {loaded.calendarPublished&&<p role="status" className="rounded border p-3">
        Configuração inicial publicada. Missivas habilitadas para a rodada escolhida.
        Esta tela não avança o tempo nem aplica efeitos nas Casas.
      </p>}
      {!loaded.calendarPublished&&<form onSubmit={event=>void save(event)} className="space-y-3">
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
      {!loaded.calendarPublished&&loaded.draft&&<div className="rounded border p-4 space-y-3">
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

