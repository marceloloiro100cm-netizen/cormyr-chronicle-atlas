/**
 * Safe, read-only renderer for arbitrary versioned noble house sheet fields.
 * No field is discarded or interpreted as executable HTML. The structure
 * remains exactly as imported; only the presentation changes.
 */
import type {ReactNode} from 'react';

type NobleSheet={id:string;name:string;castle:string|null;
  version:number;state:Record<string,unknown>};
const LABELS:Record<string,string>={
  wealth:'Riqueza',power:'Poder',influence:'Influência',
  defense:'Defesa',law:'Lei',lands:'Terras',population:'População',
  units:'Exército e unidades',court:'Corte',holdings:'Posses',
  constructions:'Construções',resources:'Recursos',
  houseId:'Identificador da Casa',schemaVersion:'Versão do esquema',
};
function label(key:string){
  return LABELS[key]??key.replace(/_/g,' ')
    .replace(/([a-z])([A-Z])/g,'$1 $2');
}

function Value({value,depth=0}:{value:unknown;depth?:number}):ReactNode{
  if(value===null||value===undefined)return <span className="opacity-70">—</span>;
  if(typeof value==='boolean')return <span>{value?'Sim':'Não'}</span>;
  if(typeof value==='string'||typeof value==='number')
    return <span className="break-words whitespace-pre-wrap">{String(value)}</span>;
  if(!Array.isArray(value)&&typeof value!=='object')
    return <span className="opacity-70">—</span>;
  const entries=Array.isArray(value)?value.map((v,i)=>[String(i+1),v] as const)
    :Object.entries(value);
  if(entries.length===0)return <span className="opacity-70">
    Nenhum registro
  </span>;
  if(depth>10)return <pre className="whitespace-pre-wrap break-words text-xs">
    {JSON.stringify(value,null,2)}
  </pre>;
  return <dl className="space-y-1">
    {entries.map(([key,v],i)=><div key={key+':'+i}
      className="border-l border-current/20 pl-3 py-1">
      <dt className="text-sm font-medium">{Array.isArray(value)
        ?`Item ${key}`:label(key)}</dt>
      <dd className="text-sm pl-2"><Value value={v} depth={depth+1}/></dd>
    </div>)}
  </dl>;
}

export function FirebaseHouseSheet({sheet}:{sheet:NobleSheet}){
  const entries=Object.entries(sheet.state);
  const simple=entries.filter(([,v])=>v===null||typeof v!=='object');
  const groups=entries.filter(([,v])=>v!==null&&typeof v==='object');
  return <article aria-label={`Ficha da Casa ${sheet.name}`}
    className="rounded-lg border border-current/30 overflow-hidden">
    <header className="px-4 py-4 border-b border-current/20">
      <h2 className="text-xl font-semibold">{sheet.name}</h2>
      <p className="text-sm opacity-80">{sheet.castle??'Sem castelo cadastrado'}
        {' '}· Ficha v{sheet.version}</p>
      <p className="mt-1 text-xs opacity-70">
        Dados preservados no Firebase · consulta somente leitura
      </p>
    </header>
    {simple.length>0&&<section className="px-4 py-3">
      <h3 className="font-semibold mb-3">Atributos da Casa</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {simple.map(([key,value])=><div key={key}
          className="rounded border border-current/15 p-3">
          <dt className="text-xs opacity-70 mb-1">{label(key)}</dt>
          <dd className="font-medium"><Value value={value}/></dd>
        </div>)}
      </dl>
    </section>}
    {groups.length>0&&<section className="px-4 pb-4 space-y-2">
      <h3 className="font-semibold mb-2">Posse, exército e registros</h3>
      {groups.map(([key,value])=><details key={key}
        className="rounded border border-current/20 p-3">
        <summary className="cursor-pointer font-medium">
          {label(key)} · {Array.isArray(value)?value.length:
            Object.keys(value as Record<string,unknown>).length}
          {' '}registro(s)
        </summary>
        <div className="mt-3"><Value value={value}/></div>
      </details>)}
    </section>}
  </article>;
}
