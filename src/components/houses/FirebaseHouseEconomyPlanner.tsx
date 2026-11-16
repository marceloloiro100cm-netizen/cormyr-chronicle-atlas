import {useMemo} from 'react';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';
import {calculateFirebaseHouseEconomy} from '@/lib/house/firebase-economic-readonly';

/** Strictly read-only balance, no second construction quotation engine. */
export function FirebaseHouseEconomyPlanner({houseName,state}:{
  houseName:string;state:Record<string,unknown>;
}){
  const economy=useMemo(()=>calculateFirebaseHouseEconomy(state),[state]);
  const fmt=(value:number)=>value.toLocaleString('pt-BR',{
    maximumFractionDigits:9,
  });
  return <section aria-label={`Balanço consolidado da Casa ${houseName}`}
    className="rounded-lg border border-current/25 p-4 space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Balanço consolidado dos recursos</h2>
      <p className="text-sm opacity-75">
        {houseName} · Apuração pelo motor oficial da Casa, somente leitura
      </p>
    </header>
    {!economy
      ?<p role="status" className="text-sm">
        Apuração indisponível: ficha incompleta ou incompatível com as
        regras atuais. Nenhum saldo foi estimado e os dados originais
        permanecem intactos.
      </p>
      :<>
        <div className="overflow-x-auto rounded border border-current/20">
          <table className="w-full border-collapse text-sm">
            <caption className="p-3 text-left font-semibold">
              Total, alocação e saldo disponível · {houseName}
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
                <td className="p-2 text-right tabular-nums">
                  {fmt(economy.balances.total[key])}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmt(economy.balances.allocated[key])}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmt(economy.balances.committed[key])}
                </td>
                <td className="p-2 text-right tabular-nums font-semibold">
                  {fmt(economy.balances.available[key])}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {RESOURCE_KEYS.some(key=>economy.balances.available[key]<0)&&
          <p role="status" className="text-sm">
            Atenção: há recursos com saldo disponível negativo na ficha
            histórica. O balanço não faz correções automáticas.
          </p>}
        <p className="text-xs opacity-75">
          Este é o saldo calculado da ficha histórica, não uma confirmação
          de migração operacional. Para simular compras e descontos, use
          o quadro de construções do Firebase, validado pelo servidor.
        </p>
      </>}
  </section>;
}
