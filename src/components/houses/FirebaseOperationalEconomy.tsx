import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource} from '@/lib/house/types';

/** Public projection only. The server never returns the operational state. */
export type OperationalEconomyView={
  houseId:string;version:number;sourceSheetVersion:number;calendarMonth:number;
  readOnly:true;
  balances:Record<'total'|'allocated'|'committed'|'available',
    Record<Resource,number>>;
  holdingsTotal:number;projectsTotal:number;partial:boolean;
  holdings:{id:string;itemId:string;name:string;domainId:string;status:string}[];
  projects:{id:string;name:string;holdingId:string;status:string;
    start:number;duration:number;modifier:number}[];
};
const STATUS:Record<string,string>={
  active:'Ativa',building:'Em construção',destroyed:'Destruída',
  abandoned:'Abandonada',sold:'Vendida',cancelled:'Cancelada',
  completed:'Concluída',
};
const fmt=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:9});

/** Historical snapshots remain visible elsewhere in the House view.
 * This component never mutates resources or enables purchase controls.
 */
export function FirebaseOperationalEconomy({houseName,houseId,data}:{
  houseName:string;houseId:string;data:OperationalEconomyView|null;
}){
  const ready=data?.houseId===houseId;
  return <section aria-label={\`Economia operacional da Casa \${houseName}\`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Economia operacional · Firebase</h2>
      <p className="text-sm opacity-75">{houseName} · Fonte operacional privada</p>
    </header>
    {!ready
      ?<p role="status" className="text-sm">
        Economia operacional ainda não homologada para consulta. A ficha
        histórica continua disponível separadamente; nenhum saldo ou projeto
        atualizado foi presumido.
      </p>
      :<>
        <p className="text-xs">
          Estado operacional v{data.version} · fonte histórica v{data.sourceSheetVersion}
          {' · '}mês canônico {data.calendarMonth}
        </p>
        <div className="overflow-x-auto rounded border border-current/20">
          <table className="w-full text-sm">
            <caption className="p-3 text-left font-semibold">
              Recursos operacionais conciliados
            </caption>
            <thead><tr className="border-b border-current/20">
              <th scope="col" className="p-2 text-left">Recurso</th>
              <th scope="col" className="p-2 text-right">Total</th>
              <th scope="col" className="p-2 text-right">Alocado</th>
              <th scope="col" className="p-2 text-right">Comprometido</th>
              <th scope="col" className="p-2 text-right">Disponível</th>
            </tr></thead>
            <tbody>{RESOURCE_KEYS.map(k=><tr key={k}
              className="border-b border-current/10">
              <th scope="row" className="p-2 text-left">{RESOURCE_NAMES[k]}</th>
              <td className="p-2 text-right tabular-nums">{fmt(data.balances.total[k])}</td>
              <td className="p-2 text-right tabular-nums">{fmt(data.balances.allocated[k])}</td>
              <td className="p-2 text-right tabular-nums">{fmt(data.balances.committed[k])}</td>
              <td className="p-2 text-right tabular-nums font-semibold">
                {fmt(data.balances.available[k])}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-current/20 p-3">
            <p className="text-xs opacity-75">Posses operacionais</p>
            <p className="font-semibold tabular-nums">{data.holdingsTotal}</p>
          </div>
          <div className="rounded border border-current/20 p-3">
            <p className="text-xs opacity-75">Projetos operacionais</p>
            <p className="font-semibold tabular-nums">{data.projectsTotal}</p>
          </div>
        </div>
        <details className="rounded border border-current/20 p-3">
          <summary className="cursor-pointer font-semibold">
            Posses atualizadas · {data.holdings.length} exibidas
          </summary>
          <ul className="space-y-2 mt-3">
            {data.holdings.map(h=><li key={h.id}
              className="border-t border-current/15 pt-2 text-sm">
              <strong className="break-words">{h.name}</strong>
              {' · '}{STATUS[h.status]??'Estado não identificado'}
            </li>)}
          </ul>
        </details>
        <details className="rounded border border-current/20 p-3">
          <summary className="cursor-pointer font-semibold">
            Projetos atualizados · {data.projects.length} exibidos
          </summary>
          <ul className="space-y-2 mt-3">
            {data.projects.map(p=><li key={p.id}
              className="border-t border-current/15 pt-2 text-sm">
              <strong className="break-words">{p.name}</strong>
              {' · '}{STATUS[p.status]??'Estado não identificado'}
              {' · '}Prazo registrado: {p.duration} mês(es)
            </li>)}
          </ul>
        </details>
        {RESOURCE_KEYS.some(k=>data.balances.available[k]<0)&&
          <p role="status" className="text-sm">
            Atenção: há recursos com saldo negativo; nenhuma correção automática
            foi aplicada.
          </p>}
        {data.partial&&<p role="status" className="text-sm">
          Listas parciais (máximo de 100 registros por tipo); os totais são
          provenientes da ficha operacional completa validada.
        </p>}
      </>}
    <p className="text-xs opacity-75">
      Consulta somente leitura, independente da autorização de compras.
      Não mostra auditoria, UIDs, notas privadas, dados de outras Casas
      nem modifica o Hub Temporal.
    </p>
  </section>;
}
