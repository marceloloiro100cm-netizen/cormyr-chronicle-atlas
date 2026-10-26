import { isFichaCasa, parseFichaCasa } from '@/lib/ficha';
import { RESOURCE_KEYS, type Resource } from './types';

export type ReconciliationRecord = { id: string; house_id: string | null; title: string; content: string; version: number; source_file_id: string | null; source_modified_at: string | null };
export type ResourceCandidate = { origin: string; values: Record<Resource, number | null>; houseName: string | null; section: number };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^["“]|["”]$/g, '').trim();
const aliases = [['defesa'], ['influencia'], ['terras'], ['lei'], ['populacao'], ['poder'], ['riqueza', 'riquiza']];
export function reconciliationPreview(record: ReconciliationRecord, houseName: string) {
  const lines = record.content.split(/\r?\n/);
  const candidates: ResourceCandidate[] = [];
  const issues: string[] = [];
  let columns: number[] | null = null;
  let houseName: string | null = null;
  let section = 0;
  for (const [index, line] of lines.entries()) {
    const cells = line.split('·').map(s => s.trim().replace(/^["“]|["”]$/g, '').trim());
    if (norm(cells[0] ?? '') === 'nome' && cells.some(c => ['susserano', 'suserano', 'regiao', 'lorde'].includes(norm(c)))) {
      houseName = cells[1] || null;
      section += 1;
      columns = null;
    }
    if (aliases.every(a => cells.some(c => a.includes(norm(c))))) {
      columns = aliases.map(a => cells.findIndex(c => a.includes(norm(c))));
      continue;
    }
    if (columns && ['modificador', 'total'].includes(norm(cells[0] ?? ''))) {
      const values = Object.fromEntries(RESOURCE_KEYS.map((key, i) => {
        const text = cells[columns?.[i] ?? -1] ?? '';
        return [key, /^-?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : null];
      })) as Record<Resource, number | null>;
      // Summary tables with repeated Total labels are not resource rows.
      if (!cells.slice(1).some(c => norm(c) === 'total')) {
        candidates.push({ origin: `Linha ${index + 1} · ${cells[0]}`, values, houseName, section });
        if (Object.values(values).some(v => v === null)) issues.push(`Linha ${index + 1}: campos vazios ou não numéricos; não equivalem a zero.`);
      }
    }
    if (/posses|treinamento|nome da unidade/i.test(line)) columns = null;
    if (/#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?)/i.test(line)) issues.push(`Linha ${index + 1}: erro de planilha preservado — ${line.trim()}`);
  }
  const identity = parseFichaCasa(record.content);
  if (!identity.nome) issues.push('Nome da casa não preenchido no cabeçalho; associação do arquivo não confirma identidade.');
  else if (norm(identity.nome) !== norm(houseName)) issues.push(`Cabeçalho identifica ${identity.nome}, mas o registro está associado a ${houseName}; conciliação bloqueada.`);
  if (!candidates.length) issues.push('Nenhuma linha de recursos conciliável encontrada.');
  const complete = candidates.filter(c => RESOURCE_KEYS.every(k => c.values[k] !== null));
  if (new Set(complete.map(c => JSON.stringify(c.values))).size > 1) issues.push('Há valores completos divergentes na mesma fonte; nenhum foi escolhido automaticamente.');
  if (/casa nobre/i.test(record.content)) issues.push('Afiliação das unidades deve ser conferida separadamente; exército não foi atribuído à casa.');
  issues.push('Posses, tropas, Corte, fórmulas e origem dos ganhos/alocações ainda exigem conciliação; bônus regionais não reaplicados.');
  return { record, identity, candidates, issues: [...new Set(issues)] };
}
export function reconciliationSources(records: ReconciliationRecord[]) {
  return records.filter(r => isFichaCasa(r.title, r.content) || /\.xlsx?$/i.test(r.title));
}