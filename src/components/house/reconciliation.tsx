import { useState } from 'react';
import { FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reconciliationPreview, reconciliationSources, type ReconciliationRecord } from '@/lib/house/reconciliation';
import { readWorkbook, type ImportPreview } from '@/lib/house/import';
import { RESOURCE_KEYS, RESOURCE_NAMES } from '@/lib/house/types';

export function HouseReconciliation({ houses, records }: { houses: { id: string; name: string }[]; records: ReconciliationRecord[] }) {
  const [selected, setSelected] = useState('');
  const [uploads, setUploads] = useState<ImportPreview[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sources = reconciliationSources(records);
  const visible = houses.filter(h => !selected || h.id === selected);
  return <section className="house-panel" aria-labelledby="reconciliation-title">
    <div className="house-section-heading"><h3 id="reconciliation-title">Prévia de conciliação das casas</h3><FileSearch className="text-primary" size={22}/></div>
    <p className="house-warning">Somente leitura · Nenhum dado migrado ou salvo.</p>
    <p className="house-caption">Fontes já preservadas no acervo privado; esta consulta não atualiza o Drive. Valores reconhecidos não são saldos aprovados.</p>
    <label>Casa na prévia<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Todas as casas autorizadas</option>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <p className="house-caption">{sources.length} fontes encontradas · {houses.length} casas autorizadas</p>
    {visible.map(h => {
      const houseSources = sources.filter(r => r.house_id === h.id);
      return <details className="house-ledger" key={h.id} open={Boolean(selected)}><summary><strong>Casa {h.name}</strong> · {houseSources.length} fontes</summary>
        {!houseSources.length && <p className="campaign-empty">Nenhuma planilha ou ficha de casa reconhecida no acervo disponível; nenhum valor presumido.</p>}
        {houseSources.length > 1 && <p className="house-warning">Fontes múltiplas: comparar versões antes de escolher qualquer saldo.</p>}
        {houseSources.map(r => { const p = reconciliationPreview(r, h.name); return <div key={r.id} className="my-4 space-y-3">
          <h4>{r.title} · versão {r.version}</h4><p className="house-caption">{r.source_file_id ? 'Origem Drive preservada' : 'Origem externa não identificada'} · data da fonte: {r.source_modified_at ?? 'Não registrada'}</p>
          <p>Identidade no cabeçalho: <strong>{p.identity.nome ?? 'Não preenchida'}</strong> · Região: {p.identity.regiao ?? 'Não preenchida'}</p>
          {p.candidates.map(c => <div key={c.origin}><h4>{c.origin}</h4><dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">{RESOURCE_KEYS.map(k => <div key={k}><dt className="text-sm text-muted-foreground">{RESOURCE_NAMES[k]}</dt><dd className="m-0 font-semibold">{c.values[k] ?? 'Não conciliado'}</dd></div>)}</dl></div>)}
          <h4>Pendências</h4><ul className="space-y-2 pl-5 text-sm">{p.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          <details><summary>Texto original preservado</summary><pre className="campaign-preserve whitespace-pre-wrap break-words">{r.content}</pre></details>
        </div>; })}
      </details>;
    })}
    <details className="house-ledger"><summary>Conferir planilhas originais locais</summary><label>Planilhas (.xlsx ou .xls)<input type="file" accept=".xlsx,.xls" multiple disabled={loading} onChange={async e => {
      const files = Array.from(e.target.files ?? []); setError(''); setLoading(true); setUploads([]);
      try { setUploads(await Promise.all(files.map(readWorkbook))); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler as planilhas.'); } finally { setLoading(false); }
    }}/></label><p role="status">{loading ? 'Lendo planilhas…' : 'Arquivos conferidos apenas nesta sessão; sem envio ou gravação.'}</p>{error && <p role="alert">{error}</p>}
    {uploads.map((p,i) => <div key={`${p.source}-${i}`} className="my-4"><h4>{p.source} · {p.house ?? 'Casa não identificada'}</h4><p>{p.units.length} unidades compatíveis reconhecidas · Nada importado.</p>{p.resources && <dl className="grid grid-cols-2 gap-2">{RESOURCE_KEYS.map(k => <div key={k}><dt>{RESOURCE_NAMES[k]}</dt><dd>{p.issues.some(issue => issue.includes(`${k} vazio`)) ? 'Não conciliado' : p.resources?.[k]}</dd></div>)}</dl>}<ul className="pl-5 text-sm">{p.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><details><summary>Abas e fórmulas preservadas</summary>{p.original.map(s => <div key={s.name}><h4>{s.name}</h4><p>{s.rows.length} linhas · {s.rows.flat().filter(c => c.formula).length} fórmulas</p>{s.rows.flat().filter(c => c.formula).map(c => <p className="break-words text-sm" key={c.address}>{s.name}!{c.address} = {c.formula} · valor: {String(c.value ?? 'Vazio')}</p>)}</div>)}</details></div>)}
    {uploads.length > 0 && <Button variant="outline" onClick={() => setUploads([])}>Descartar prévia local</Button>}</details>
  </section>;
}