import {useMemo,useState,type FormEvent} from 'react';
import {constructionChoices} from '@/lib/house/firebase-construction-quote';
import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource} from '@/lib/house/types';

type QuoteCost={resource:Resource;amount:number;mode:'allocation'|'permanent'};
type Discount={resource:Resource;amount:number;source:string};
export type ConstructionQuoteView={
  houseId:string;houseName:string;sheetVersion:number;
  domainId:string;domainName:string;
  item:{id:string;name:string;category:string;
    duration:{months:number;dice?:number;sides?:number};pending:string|null};
  before:Record<Resource,number>;after:Record<Resource,number>;
  costs:QuoteCost[];discounts:Discount[];errors:string[];
  purchaseEligibleByRules:boolean;readOnly:true;purchaseEnabled:false;
  snapshotReconciliationPending:true;
};
type Short={id:string;name:string};
const asRows=(v:unknown):Short[]=>
  Array.isArray(v)?v.filter(x=>x&&typeof x==='object'&&
    typeof x.id==='string'&&x.id.length>0&&
    typeof x.name==='string').slice(0,100)
    .map(x=>({id:x.id,name:x.name})):[];

export function FirebaseConstructionQuote({houseId,state,onQuote}:{
  houseId:string;state:Record<string,unknown>;
  onQuote:(body:Record<string,unknown>)=>Promise<ConstructionQuoteView>;
}){
  const domains=useMemo(()=>asRows(state.domains),[state.domains]);
  const holdings=useMemo(()=>asRows(state.holdings),[state.holdings]);
  const [category,setCategory]=useState('fortification');
  const [itemId,setItemId]=useState('');
  const [domainId,setDomainId]=useState('');
  const [parentId,setParentId]=useState('');
  const [supportId,setSupportId]=useState('');
  const [replaceId,setReplaceId]=useState('');
  const [result,setResult]=useState<ConstructionQuoteView|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const categories=[
    ['fortification','Fortificações'],['estate','Explorações'],
    ['settlement','Assentamentos'],['improvement','Melhorias'],
    ['community','Comunidades'],['terrain','Terrenos'],
    ['feature','Características'],['lifestyle','Estilo de vida'],
    ['equipment','Equipamentos'],['personage','Personagens'],
  ] as const;
  const choices=constructionChoices.filter(x=>x.category===category);
  async function preview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!itemId||!domainId)return;
    setBusy(true);setResult(null);setError('');
    try{
      setResult(await onQuote({
        houseId,itemId,domainId,
        ...(parentId?{parentId}:{}),
        ...(supportId?{supportId}:{}),
        ...(replaceId?{replaceId}:{}),
      }));
    }catch(e){setError(e instanceof Error?e.message:'Simulação não disponível.');}
    finally{setBusy(false);}
  }
  return <section className="rounded border border-current/25 p-4 space-y-3"
    aria-label="Simulador de construções Firebase">
    <h2 className="text-lg font-semibold">Planejar construções · Simulação</h2>
    <p className="text-xs">
      Simula custos, descontos e impedimentos do catálogo oficial
      com a ficha autorizada. Nenhuma compra será registrada nesta tela.
      O resultado não substitui a aprovação final e não reserva recursos.
    </p>
    {domains.length===0
      ?<p>Esta ficha não possui domínios disponíveis para simulação.</p>
      :<form onSubmit={preview} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Categoria
          <select className="mt-1 block w-full rounded border p-2"
            value={category} disabled={busy} onChange={e=>{
              setCategory(e.target.value);setItemId('');setResult(null);
            }}>
            {categories.map(([id,name])=>
              <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm">Item do catálogo
          <select className="mt-1 block w-full rounded border p-2"
            value={itemId} required disabled={busy}
            onChange={e=>{setItemId(e.target.value);setResult(null);}}>
            <option value="">Escolha o item</option>
            {choices.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Domínio da Casa
          <select className="mt-1 block w-full rounded border p-2"
            value={domainId} required disabled={busy}
            onChange={e=>{setDomainId(e.target.value);setResult(null);}}>
            <option value="">Escolha um domínio</option>
            {domains.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Posse principal (opcional)
          <select className="mt-1 block w-full rounded border p-2"
            value={parentId} disabled={busy}
            onChange={e=>{setParentId(e.target.value);setResult(null);}}>
            <option value="">Nenhuma</option>
            {holdings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Suporte (opcional)
          <select className="mt-1 block w-full rounded border p-2"
            value={supportId} disabled={busy}
            onChange={e=>{setSupportId(e.target.value);setResult(null);}}>
            <option value="">Nenhum</option>
            {holdings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Evoluir/Substituir (opcional)
          <select className="mt-1 block w-full rounded border p-2"
            value={replaceId} disabled={busy}
            onChange={e=>{setReplaceId(e.target.value);setResult(null);}}>
            <option value="">Não substituir</option>
            {holdings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy||!itemId||!domainId}
            className="rounded border px-4 py-2">
            {busy?'Calculando…':'Simular custos'}
          </button>
        </div>
      </form>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    {result&&<div className="space-y-3 border-t border-current/20 pt-3">
      <h3 className="font-semibold">{result.item.name} · {result.domainName}</h3>
      <p className="text-xs">Ficha de origem: versão {result.sheetVersion}.
        Consulta histórica, sem reservas nem operações.</p>
      {result.item.pending&&<p className="text-sm">
        Pendência de regra: {result.item.pending}
      </p>}
      {result.errors.length>0
        ?<div role="status">
          <p className="font-semibold">Condições não atendidas</p>
          <ul className="list-disc pl-5 text-sm">
            {result.errors.map((x,i)=><li key={i}>{x}</li>)}
          </ul>
        </div>
        :<p role="status" className="text-sm">
          Nenhum impedimento retornado pelo motor de regras nesta simulação.
          A compra continua desabilitada.
        </p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th scope="col" className="p-2 text-left">Recurso</th>
            <th scope="col" className="p-2 text-right">Antes</th>
            <th scope="col" className="p-2 text-right">Depois</th>
          </tr></thead>
          <tbody>{RESOURCE_KEYS.map(k=><tr key={k} className="border-b">
            <th scope="row" className="p-2 text-left font-medium">
              {RESOURCE_NAMES[k]}
            </th>
            <td className="p-2 text-right tabular-nums">{result.before[k]}</td>
            <td className="p-2 text-right tabular-nums">{result.after[k]}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {result.costs.length>0&&<p className="text-sm">
        Custos aplicados na simulação: {result.costs.map(x=>
          `${RESOURCE_NAMES[x.resource]} ${x.amount} (${x.mode==='allocation'?'alocação':'permanente'})`
        ).join(' · ')}
      </p>}
      {result.discounts.length>0&&<p className="text-sm">
        Descontos: {result.discounts.map(x=>
          `${x.source}: ${RESOURCE_NAMES[x.resource]} −${x.amount}`
        ).join(' · ')}
      </p>}
      <p className="text-xs font-semibold">Compra desabilitada nesta fase de migração.</p>
    </div>}
  </section>;
}
