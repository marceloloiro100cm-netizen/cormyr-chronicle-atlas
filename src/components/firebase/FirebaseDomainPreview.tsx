import {useState} from 'react';
import {
  callFirebaseDomain,domainPreviewConfigured,type MigratedDomain,
} from '@/integrations/backend/firebase-domain-client';

/**
 * This workbench is isolated from the active Cormyr player workspace.
 * Operations offered here are read-only. The emulator services enforce all
 * permissions on the server for each request.
 */
type ReadAction={
  title:string;
  domain:MigratedDomain;
  action:string;
  house?:boolean;
  period?:boolean;
  args:(houseId:string,year:number,month:number)=>unknown[];
};
const actions:ReadAction[]=[
  {title:'Perfil e vínculos',domain:'access',action:'getProfile',args:()=>[]},
  {title:'Catálogo de Casas',domain:'houses',action:'listHouses',args:()=>[]},
  {title:'Ficha da Casa',domain:'houses',action:'getHouse',house:true,args:h=>[h]},
  {title:'Registros',domain:'records',action:'listRecords',args:()=>[{}]},
  {title:'Idades de personagens',domain:'characters',action:'houseAges',house:true,args:h=>[h]},
  {title:'Agenda publicada',domain:'schedule',action:'getPublished',period:true,
    args:(_h,y,m)=>[{year:y,month:m}]},
  {title:'Calendário oficial',domain:'time',action:'getCalendar',args:()=>[]},
  {title:'Missivas recebidas e enviadas',domain:'mailbox',action:'list',
    args:()=>[{folder:'all',source:'all',pageSize:10,cursor:null,query:''}]},
  {title:'Estado do correio',domain:'mailCommands',action:'session',args:()=>[{}]},
  {title:'Edições do Jornal',domain:'newspaper',action:'listEditions',args:()=>[]},
  {title:'Espiões da Casa',domain:'spyAgents',action:'houseManagement',house:true,args:h=>[h]},
  {title:'Missões de espionagem',domain:'spyMissions',action:'houseTimeline',house:true,args:h=>[h]},
  {title:'Dossiês de inteligência',domain:'spyIntel',action:'read',house:true,args:h=>[h]},
  {title:'Batalhas',domain:'battle',action:'liveList',args:()=>[]},
  {title:'Conteúdo do Narrador',domain:'privateGm',action:'listGmContent',args:()=>[]},
  {title:'Vínculos do Google Drive',domain:'drive',action:'listBindings',args:()=>[]},
];

export function FirebaseDomainPreview(){
  const [index,setIndex]=useState(0);
  const [houseId,setHouseId]=useState('');
  const [year,setYear]=useState(1522);
  const [month,setMonth]=useState(1);
  const [pending,setPending]=useState(false);
  const [result,setResult]=useState('');
  const [error,setError]=useState('');
  const selected=actions[index]!;
  const enabled=domainPreviewConfigured();

  async function run(){
    if(pending||!enabled)return;
    if(selected.house&&!houseId.trim()){
      setError('Informe o identificador da Casa autorizada.');return;
    }
    setPending(true);setError('');setResult('');
    try{
      const data=await callFirebaseDomain({
        domain:selected.domain,action:selected.action,
        args:selected.args(houseId.trim(),year,month),
      });
      // Avoid huge JSON renders on a low-memory browser. No local persistence.
      const value=JSON.stringify(data,null,2);
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
        {selected.house&&<label className="block">Identificador oficial da Casa
          <input className="mt-1 block w-full rounded border p-2" value={houseId}
            maxLength={512} onChange={e=>setHouseId(e.target.value)}
            placeholder="Ex.: nome/código da Casa autorizado"/>
        </label>}
        {selected.period&&<div className="flex gap-3">
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
        {error&&<p role="alert">{error}</p>}
        {result&&<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs"
          aria-label="Resultado autorizado do módulo">{result}</pre>}
      </div>}
  </section>;
}
