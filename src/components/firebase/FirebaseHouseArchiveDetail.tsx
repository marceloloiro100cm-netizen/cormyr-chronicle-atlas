import {useEffect,useRef,useState} from 'react';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';

type Resource='defense'|'influence'|'lands'|'law'|'population'|'power'|'wealth';
type SourceResources=Record<Resource,number|null>;
type Project={id:string;name:string;status:string|null;duration:number|null;start:number|null};
type Ledger={id:string;version:number;action:string|null;explanation:string|null;rule:string|null};
type HouseDetail={
  readOnly:true;operationalConnected:false;
  summary:{houseId:string;version:number|null;phase:string|null;
    base:SourceResources|null;permanent:SourceResources|null;
    ledgerEntries:number;projects:number};
  projects:Project[];ledger:Ledger[];
};
const resources:[Resource,string][]=[
  ['defense','Defesa'],['influence','Influência'],['lands','Terras'],
  ['law','Lei'],['population','População'],['power','Poder'],['wealth','Riqueza'],
];

export function FirebaseHouseArchiveDetail({houseId}:{houseId:string}){
  const [data,setData]=useState<HouseDetail|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const auth=firebasePilotAuth();
    const clear=()=>{generation.current++;setData(null);setError('');setBusy(false);};
    const unsub=auth?.subscribe(()=>clear());
    const onFocus=()=>{if(document.visibilityState==='visible')clear();};
    window.addEventListener('focus',onFocus);
    return()=>{generation.current++;unsub?.();window.removeEventListener('focus',onFocus);};
  },[houseId]);
  const open=async()=>{
    const id=++generation.current;
    setBusy(true);setError('');setData(null);
    try{
      const auth=firebasePilotAuth();
      const uid=auth?.current()?.uid;
      const token=await auth?.getToken();
      if(!token||!uid||auth?.current()?.uid!==uid)
        throw Error('Sessão Firebase não confirmada.');
      const response=await fetch('/api/firebase-house-source',{
        method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({houseId}),
      });
      if(!response.ok)throw Error(response.status===403
        ?'Acesso à Casa não autorizado.'
        :'A ficha original está indisponível nesta consulta.');
      const payload:unknown=await response.json();
      const result=(payload&&typeof payload==='object'&&'result' in payload
        ?(payload as {result:HouseDetail}).result:null);
      if(!result||result.readOnly!==true||result.operationalConnected!==false||
         result.summary?.houseId!==houseId||
         !Array.isArray(result.projects)||!Array.isArray(result.ledger))
        throw Error('Dados originais da Casa inconsistentes.');
      if(generation.current===id&&auth.current()?.uid===uid)setData(result);
    }catch(e){
      if(generation.current===id)
        setError(e instanceof Error?e.message:'Não foi possível abrir a ficha.');
    }finally{if(generation.current===id)setBusy(false);}
  };
  return <div className="space-y-3">
    <button type="button" disabled={busy} onClick={()=>void open()}
      className="rounded border px-3 py-2 text-sm">
      Conferir recursos, projetos e histórico reais
    </button>
    {busy&&<p role="status" className="text-sm">Consultando a ficha original…</p>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    {data&&<div className="space-y-3 rounded border p-3">
      <h4 className="font-semibold">Recursos registrados · ficha v{data.summary.version}</h4>
      <p className="text-xs opacity-75">Os valores base e permanentes são históricos.
        Não representam o saldo disponível após investimentos e efeitos.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="p-2">Recurso</th>
          <th className="p-2">Base</th><th className="p-2">Permanente</th></tr></thead>
        <tbody>{resources.map(([key,label])=><tr key={key} className="border-b">
          <td className="p-2">{label}</td>
          <td className="p-2">{data.summary.base?.[key]??'—'}</td>
          <td className="p-2">{data.summary.permanent?.[key]??'—'}</td>
        </tr>)}</tbody>
      </table></div>
      <h4 className="font-semibold">Projetos ({data.summary.projects})</h4>
      {data.projects.map(project=><div key={project.id} className="border-t py-2 text-sm">
        <strong>{project.name}</strong> · {project.status??'—'}
        {' '}· Duração: {project.duration??'—'} meses
      </div>)}
      {data.projects.length===0&&<p className="text-sm">Nenhum projeto registrado.</p>}
      <h4 className="font-semibold">Histórico de operações ({data.summary.ledgerEntries})</h4>
      <p className="text-xs opacity-75">Últimos 100 movimentos históricos; nenhuma
        compra ou alteração é executada por esta consulta.</p>
      {data.ledger.map(entry=><div key={entry.id} className="border-t py-2 text-sm">
        <strong>v{entry.version} · {entry.action??'Ação'}</strong>
        <p>{entry.explanation??''}</p>
        {entry.rule&&<p className="text-xs">{entry.rule}</p>}
      </div>)}
      {data.ledger.length===0&&<p className="text-sm">Sem movimentos históricos registrados.</p>}
    </div>}
  </div>;
}
