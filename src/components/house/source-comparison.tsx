import { reconciliationPreview, type ReconciliationRecord } from '@/lib/house/reconciliation';
import { RESOURCE_KEYS, RESOURCE_NAMES } from '@/lib/house/types';
import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveHouseSource } from '@/lib/house/source-link.functions';
import { Button } from '@/components/ui/button';

export function SourceComparison({ records, houseName, houseId, admin=false }: { records: ReconciliationRecord[]; houseName: string; houseId: string; admin?:boolean }) {
  const resolve=useServerFn(resolveHouseSource),qc=useQueryClient();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const {data:link,isPending}=useQuery({queryKey:['house-source-link',houseId],enabled:admin,queryFn:async()=>{const result=await supabase.from('noble_house_source_links').select('record_id,confirmed_totals,created_at').eq('house_id',houseId).maybeSingle();if(result.error)throw result.error;return result.data;}});
  const rows = records.flatMap(record => reconciliationPreview(record, houseName).candidates
    .filter(candidate => candidate.origin.endsWith('· Total'))
    .map(candidate => ({ record, candidate })));
  if (!rows.length) return null;
  const differing = RESOURCE_KEYS.filter(key => new Set(rows.map(row => row.candidate.values[key])).size > 1);
  return <section className="my-5 space-y-3" aria-label={`Comparação de fontes de ${houseName}`}>
    <h4>Totais por fonte · {houseName}</h4>
    <p className="house-warning">{link?'Conciliação aplicada · Fonte e totais aprovados preservados.':'Fontes divergentes · Aplicação depende da decisão explícita do Narrador.'} Posses e tropas legadas não importadas.</p>
    {message&&<p role="status">{message}</p>}
    <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`Valores de cada fonte de ${houseName}`}>
      <table className="w-full text-left text-sm">
        <caption className="mb-3 text-left text-muted-foreground">{differing.length ? `Divergências: ${differing.map(key => RESOURCE_NAMES[key]).join(', ')}.` : 'Os totais coincidem; a identidade da fonte ainda precisa ser conferida.'}</caption>
        <thead><tr><th className="p-3">Atributo</th>{rows.map(({ record, candidate }) => <th className="min-w-48 border-b p-3 align-top" key={`${record.id}-${candidate.origin}`}>
          <div>{record.title} · v{record.version}</div>
          <div className="mt-2 font-normal">Bloco {candidate.section || 'não identificado'} · {candidate.origin}</div>
          <div className="mt-2 font-normal">Casa no bloco: {candidate.houseName ?? 'Não preenchida'}</div>
          <div className="mt-2 font-normal text-muted-foreground">Data da fonte: {record.source_modified_at ? new Date(record.source_modified_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não registrada'}</div>
          {link?.record_id===record.id&&RESOURCE_KEYS.every(k=>link.confirmed_totals&&typeof link.confirmed_totals==='object'&&!Array.isArray(link.confirmed_totals)&&link.confirmed_totals[k]===candidate.values[k])&&<p className="mt-2 text-primary">Fonte aprovada</p>}
          {admin&&!link&&candidate.houseName?.toLowerCase()===houseName.toLowerCase()&&RESOURCE_KEYS.every(k=>candidate.values[k]!==null)&&<Button className="mt-3" variant="outline" disabled={busy||isPending} onClick={async()=>{setBusy(true);setMessage('');try{const result=await resolve({data:{houseId,recordId:record.id,sourceVersion:record.version,origin:candidate.origin,key:crypto.randomUUID()}});setMessage(result.message);await Promise.all([qc.invalidateQueries({queryKey:['house-source-link',houseId]}),qc.invalidateQueries({queryKey:['noble-house']})]);}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível aplicar a decisão.');}finally{setBusy(false);}}}>Aplicar totais deste bloco</Button>}
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