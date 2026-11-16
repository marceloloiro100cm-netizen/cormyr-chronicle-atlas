import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import type {OperationalEconomyResponse}
  from '@/lib/house/firebase-operational-house-read';

const STATUS:Record<string,string>={
  active:'Ativa',building:'Em construção',destroyed:'Destruída',
  abandoned:'Abandonada',sold:'Vendida',cancelled:'Cancelada',
};
const PROJECT:Record<string,string>={
  building:'Em construção',completed:'Concluído',cancelled:'Cancelado',
};

/** Pure projection: no Firestore SDK, writes, refresh token or purchase forms. */
export function FirebaseOperationalHouseEconomy({summary}:{
  summary:OperationalEconomyResponse|null;
}){
  return <section aria-label="Economia operacional da Casa"
    className="rounded-lg border border-current/25 p-4 space-y-3">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Economia operacional da Casa</h2>
      <p className="text-sm opacity-75">
        Dados Firebase separados da ficha histórica — consulta somente leitura
      </p>
    </header>
    {!summary?.available?
      <p role="status" className="text-sm">
        Estado econômico operacional ainda não disponível ou não homologado
        para consulta. Os valores anteriores são do registro histórico;
        não representam um saldo operacional confirmado.
      </p>:
      <>
        <div className="flex flex-wrap gap-3 text-sm">
          <p>Casa: <strong>{summary.houseName}</strong></p>
          <p>Versão operacional: <strong>{summary.version}</strong></p>
          <p>Versão histórica de origem: <strong>{summary.sourceSheetVersion}</strong></p>
          <p>Projetos registrados: <strong>{summary.projectsTotal}</strong></p>
        </div>
        <div className="overflow-x-auto rounded border border-current/20">
          <table className="w-full text-sm">
            <caption className="p-3 text-left font-medium">
              Sete recursos no estado operacional conciliado
            </caption>
            <thead><tr className="border-b border-current/20">
              <th scope="col" className="p-2 text-left">Recurso</th>
              <th scope="col" className="p-2 text-right">Total</th>
              <th scope="col" className="p-2 text-right">Alocado</th>
              <th scope="col" className="p-2 text-right">Comprometido</th>
              <th scope="col" className="p-2 text-right">Disponível</th>
            </tr></thead>
            <tbody>{RESOURCE_KEYS.map(key=><tr key={key}
              className="border-b border-current/10 last:border-0">
              <th scope="row" className="p-2 text-left">{RESOURCE_NAMES[key]}</th>
              {([
                summary.balances.total[key],summary.balances.allocated[key],
                summary.balances.committed[key],summary.balances.available[key],
              ] as const).map((value,index)=>
                <td key={index} className="p-2 text-right tabular-nums">
                  {value.toLocaleString('pt-BR')}
                </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <details className="rounded border border-current/20 p-3">
          <summary className="font-semibold cursor-pointer">
            Posses operacionais ({summary.holdingsTotal})
          </summary>
          {summary.holdingsTotal===0?
            <p className="mt-2 text-sm">Nenhuma posse registrada.</p>:
            <ul className="mt-2 space-y-2 text-sm">
              {summary.holdings.map(h=><li key={h.id}
                className="border-b border-current/10 pb-2">
                <strong>{h.name}</strong> — {STATUS[h.status]??'Não informado'}
                <p className="opacity-75">{h.domainName}</p>
              </li>)}
            </ul>}
          {summary.holdingsTruncated&&<p role="status" className="text-sm">
            Exibição limitada às primeiras 100 posses.
          </p>}
        </details>
        <details className="rounded border border-current/20 p-3">
          <summary className="font-semibold cursor-pointer">
            Projetos operacionais ({summary.projectsTotal})
          </summary>
          {summary.projectsTotal===0?
            <p className="mt-2 text-sm">Nenhum projeto registrado.</p>:
            <ul className="mt-2 space-y-2 text-sm">
              {summary.projects.map(p=><li key={p.id}
                className="border-b border-current/10 pb-2">
                <strong>{p.name}</strong> — {PROJECT[p.status]??'Não informado'}
                <p className="opacity-75">{p.holdingName}</p>
                {p.duration!==null&&
                  <p>Duração registrada: {p.duration} mês(es)</p>}
              </li>)}
            </ul>}
          {summary.projectsTruncated&&<p role="status" className="text-sm">
            Exibição limitada aos primeiros 75 projetos.
          </p>}
        </details>
        <p className="text-xs opacity-75">
          A existência de uma ficha operacional não habilita compras,
          alterações de recursos ou conclusão de obras. O Tesouro permanece
          independente dos sete recursos.
        </p>
      </>}
  </section>;
}
