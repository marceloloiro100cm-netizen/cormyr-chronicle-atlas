import {useEffect,useState} from 'react';
import {watchFirebaseCalendar} from '@/integrations/backend/firebase-calendar-polling';
import {callFirebaseDomain,domainPreviewConfigured} from '@/integrations/backend/firebase-domain-client';
import {READ_SURFACES,readFirebaseSurface} from '@/integrations/backend/firebase-read-adapter';

/**
 * This workbench is isolated from the active Cormyr player workspace.
 * Operations offered here are read-only. The emulator services enforce all
 * permissions on the server for each request.
 */
const actions=READ_SURFACES;

export function FirebaseDomainPreview(){
  const [index,setIndex]=useState(0);
  const [houseId,setHouseId]=useState('');
  const [year,setYear]=useState(1522);
  const [month,setMonth]=useState(1);
  const [pending,setPending]=useState(false);
  const [result,setResult]=useState('');
  const [error,setError]=useState('');
  const [watching,setWatching]=useState(false);
  const selected=actions[index]!;
  const enabled=domainPreviewConfigured();

  useEffect(()=>{
    if(!enabled||!watching||selected.key!=='calendar')return;
    const monitor=watchFirebaseCalendar({
      read:()=>readFirebaseSurface('calendar',{},
        {enabled:true,invoke:callFirebaseDomain}),
      onSnapshot:calendar=>{setResult(JSON.stringify(calendar,null,2));setError('');},
      onError:message=>setError(message),
    });
    return ()=>monitor.stop();
  },[enabled,watching,selected.key]);

  async function run(){
    if(pending||!enabled)return;
    if('house' in selected&&selected.house&&!houseId.trim()){
      setError('Informe o identificador da Casa autorizada.');return;
    }
    setPending(true);setError('');setResult('');
    try{
      const data=await readFirebaseSurface(selected.key,
        {houseId,year,month},
        {enabled,invoke:callFirebaseDomain},
      );
      // Avoid huge JSON renders on a low-memory browser. No local persistence.
      const value=JSON.stringify(data??null,null,2) ?? 'null';
      setResult(value.length>30_000
        ?value.slice(0,30_000)+'\\n[resultado truncado na visualização]' : value);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível consultar este módulo.');
    }finally{
      setPending(false);
    }
  }
  return <section className="mt-8 rounded border p-4" aria-label="Módulos Firebase em homologação">
    <h2 className="text-lg font-semibold">Módulos Firebase · homologação isolada</h2>
    <p className="my-2 text-sm">
      Esta bancada consulta apenas os serviços no Firebase Emulator local.
      Não altera o site atual, não importa dados e não substitui o login Supabase.
      Somente leituras são oferecidas aqui; as permissões são conferidas no servidor.
    </p>
    {!enabled?<p role="status">A bancada de módulos não está habilitada neste ambiente.</p>:
      <div className="mt-4 space-y-3">
        <label className="block">Módulo a consultar
          <select className="mt-1 block w-full rounded border p-2"
            value={index} onChange={e=>{setIndex(Number(e.target.value));setError('');setResult('');}}>
            {actions.map((a,i)=><option key={a.title} value={i}>{a.title}</option>)}
          </select>
        </label>
        {'house' in selected&&selected.house&&<label className="block">Identificador oficial da Casa
          <input className="mt-1 block w-full rounded border p-2" value={houseId}
            maxLength={512} onChange={e=>setHouseId(e.target.value)}
            placeholder="Ex.: nome/código da Casa autorizado"/>
        </label>}
        {'period' in selected&&selected.period&&<div className="flex gap-3">
          <label>Ano
            <input className="ml-2 w-24 rounded border p-2" type="number"
              min={1} max={9999} value={year}
              onChange={e=>setYear(Number(e.target.value))}/>
          </label>
          <label>Mês
            <input className="ml-2 w-20 rounded border p-2" type="number"
              min={1} max={12} value={month}
              onChange={e=>setMonth(Number(e.target.value))}/>
          </label>
        </div>}
        <button type="button" className="rounded border px-4 py-2" disabled={pending}
          onClick={()=>void run()}>
          {pending?'Consultando…':'Consultar módulo Firebase'}
        </button>
        {selected.key==='calendar'&&<button type="button"
          className="rounded border px-4 py-2" onClick={()=>setWatching(v=>!v)}>
          {watching?'Parar acompanhamento':'Acompanhar calendário (15 s)'}
        </button>}
        {error&&<p role="alert">{error}</p>}
        {result&&<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs"
          aria-label="Resultado autorizado do módulo">{result}</pre>}
      </div>}
  </section>;
}
