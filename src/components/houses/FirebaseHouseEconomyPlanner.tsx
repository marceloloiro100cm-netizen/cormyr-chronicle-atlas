import {useMemo,useState} from 'react';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import {calculateFirebaseHouseEconomy,ECONOMY_QUOTE_ITEMS,
  previewFirebaseHouseConstruction} from '@/lib/house/firebase-economic-readonly';

/** Read-only preview. Never call Cloud writes from economic simulation. */
export function FirebaseHouseEconomyPlanner({houseName,state}:{
  houseName:string;state:Record<string,unknown>;
}){
  const [selectedItem,setSelectedItem]=useState('tower');
  const [selectedDomain,setSelectedDomain]=useState('');
  const economy=useMemo(()=>calculateFirebaseHouseEconomy(state),[state]);
  const domainId=economy?.domains.some(d=>d.id===selectedDomain)
    ?selectedDomain:(economy?.domains[0]?.id??'');
  const itemId=ECONOMY_QUOTE_ITEMS.some(i=>i.id===selectedItem)
    ?selectedItem:(ECONOMY_QUOTE_ITEMS[0]?.id??'');
  const preview=useMemo(()=>domainId&&itemId
    ?previewFirebaseHouseConstruction(state,itemId,domainId):null,
    [state,itemId,domainId]);
  const fmt=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:9});
  return <section aria-label={`Economia calculada da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Economia · Apuração e prévia de construções</h2>
      <p className="text-sm opacity-75">
        Saldos e custos obtidos do motor oficial da Casa, sem alterações no Firebase.
      </p>
    </header>
    {!economy
      ?<p role="status" className="text-sm">
        Apuração indisponível: ficha incompleta ou incompatível com as regras
        atuais. Não foi estimado nenhum saldo e os dados originais
        permanecem intactos.
      </p>
      :<>
        <div className="overflow-x-auto rounded border border-current/20">
          <table className="w-full border-collapse text-sm">
            <caption className="p-3 text-left font-semibold">
              Balanço completo · {houseName}
            </caption>
            <thead>
              <tr className="border-b border-current/20">
                <th className="p-2 text-left" scope="col">Recurso</th>
                <th className="p-2 text-right" scope="col">Total</th>
                <th className="p-2 text-right" scope="col">Alocado</th>
                <th className="p-2 text-right" scope="col">Comprometido</th>
                <th className="p-2 text-right" scope="col">Disponível</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_KEYS.map(key=><tr key={key}
                className="border-b border-current/10 last:border-0">
                <th className="p-2 text-left font-medium" scope="row">
                  {RESOURCE_NAMES[key]}
                </th>
                <td className="p-2 text-right tabular-nums">{fmt(economy.balances.total[key])}</td>
                <td className="p-2 text-right tabular-nums">{fmt(economy.balances.allocated[key])}</td>
                <td className="p-2 text-right tabular-nums">{fmt(economy.balances.committed[key])}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmt(economy.balances.available[key])}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {RESOURCE_KEYS.some(key=>economy.balances.available[key]<0)&&
          <p role="status" className="text-sm">
            Atenção: há recursos com saldo disponível negativo no snapshot.
            Nenhum ajuste automático foi efetuado.
          </p>}
        <div className="space-y-3 rounded border border-current/20 p-3">
          <h3 className="font-semibold">Simular custo de uma construção</h3>
          <p className="text-xs">
            Prévia de fortificações, explorações e povoamentos. Descontos,
            pré-requisitos e alocações usam as mesmas regras da ficha original.
            Não há reserva de recursos nem botão de compra.
          </p>
          {economy.domains.length===0
            ?<p>Esta Casa não possui domínios definidos para simulação.</p>
            :<>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">Domínio
                  <select className="mt-1 block w-full rounded border p-2"
                    value={domainId} onChange={e=>setSelectedDomain(e.target.value)}>
                    {economy.domains.map(d=><option key={d.id} value={d.id}>
                      {d.name}
                    </option>)}
                  </select>
                </label>
                <label className="text-sm">Construção
                  <select className="mt-1 block w-full rounded border p-2"
                    value={itemId} onChange={e=>setSelectedItem(e.target.value)}>
                    {ECONOMY_QUOTE_ITEMS.map(i=><option key={i.id} value={i.id}>
                      {i.name}
                    </option>)}
                  </select>
                </label>
              </div>
              {!preview
                ?<p role="status">A simulação não pôde ser validada para esta ficha.</p>
                :<div className="space-y-2 text-sm">
                  <h4 className="font-semibold">{preview.itemName}</h4>
                  <p className="text-xs opacity-75">Fonte: {preview.source}</p>
                  {preview.pending&&<p>
                    Adaptação pendente da fonte: {preview.pending}
                  </p>}
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {preview.costs.map((c,i)=><div key={i}
                      className="rounded border border-current/20 p-2">
                      <dt>{RESOURCE_NAMES[c.resource]} · {c.mode==='permanent'
                        ?'Custo permanente':'Alocação'}</dt>
                      <dd className="font-semibold">{fmt(c.amount)}</dd>
                    </div>)}
                  </dl>
                  {preview.discounts.length>0&&<ul className="space-y-1">
                    {preview.discounts.map((d,i)=><li key={i}>
                      Desconto: {d.source} · {RESOURCE_NAMES[d.resource as keyof typeof RESOURCE_NAMES]}
                      {' '}−{fmt(d.amount)}
                    </li>)}
                  </ul>}
                  {preview.errors.length>0&&<div role="status" className="space-y-1">
                    <p className="font-semibold">Restrições da prévia:</p>
                    <ul className="list-disc pl-4">
                      {preview.errors.map((e,i)=><li key={i}>{e}</li>)}
                    </ul>
                  </div>}
                  <p className="font-medium">
                    {preview.available
                      ?'Pré-requisitos e saldo compatíveis na simulação.'
                      :'A construção não está validada para aquisição.'}
                  </p>
                  <p className="text-xs">
                    Mesmo uma prévia compatível não autoriza a compra.
                    Exige aprovação do runtime operacional, versão atual
                    da ficha e transação auditável.
                  </p>
                </div>}
            </>}
        </div>
      </>}
  </section>;
}
