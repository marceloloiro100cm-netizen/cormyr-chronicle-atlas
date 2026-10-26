import { reconciliationPreview, type ReconciliationRecord } from '@/lib/house/reconciliation';
import { RESOURCE_KEYS, RESOURCE_NAMES } from '@/lib/house/types';

export function SourceComparison({ records, houseName }: { records: ReconciliationRecord[]; houseName: string }) {
  const rows = records.flatMap(record => reconciliationPreview(record, houseName).candidates
    .filter(candidate => candidate.origin.endsWith('· Total'))
    .map(candidate => ({ record, candidate })));
  if (!rows.length) return null;
  const differing = RESOURCE_KEYS.filter(key => new Set(rows.map(row => row.candidate.values[key])).size > 1);
  return <section className="my-5 space-y-3" aria-label={`Comparação de fontes de ${houseName}`}>
    <h4>Totais por fonte · {houseName}</h4>
    <p className="house-warning">Decisão do Narrador pendente · Nenhum total escolhido. Posses e tropas não serão importadas.</p>
    <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`Valores de cada fonte de ${houseName}`}>
      <table className="w-full text-left text-sm">
        <caption className="mb-3 text-left text-muted-foreground">{differing.length ? `Divergências: ${differing.map(key => RESOURCE_NAMES[key]).join(', ')}.` : 'Os totais coincidem; a identidade da fonte ainda precisa ser conferida.'}</caption>
        <thead><tr><th className="p-3">Atributo</th>{rows.map(({ record, candidate }) => <th className="min-w-48 border-b p-3 align-top" key={`${record.id}-${candidate.origin}`}>
          <div>{record.title} · v{record.version}</div>
          <div className="mt-2 font-normal">Bloco {candidate.section || 'não identificado'} · {candidate.origin}</div>
          <div className="mt-2 font-normal">Casa no bloco: {candidate.houseName ?? 'Não preenchida'}</div>
          <div className="mt-2 font-normal text-muted-foreground">Data da fonte: {record.source_modified_at ? new Date(record.source_modified_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não registrada'}</div>
        </th>)}</tr></thead>
        <tbody>{RESOURCE_KEYS.map(key => <tr className={differing.includes(key) ? 'bg-muted' : ''} key={key}>
          <th scope="row" className="border-b p-3">{RESOURCE_NAMES[key]}</th>
          {rows.map(({ record, candidate }) => <td className="border-b p-3 font-semibold" key={`${record.id}-${candidate.origin}`}>{candidate.values[key] ?? 'Não conciliado'}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {rows.some(row => !row.candidate.houseName) && <p className="house-caption">Blocos sem nome não confirmam a casa, mesmo quando seus valores coincidem com outra ficha.</p>}
    <p className="house-caption">Modificadores e saldos de bens permanecem no texto original; não são tratados como totais finais. A data mais recente não decide qual fonte prevalece.</p>
  </section>;
}