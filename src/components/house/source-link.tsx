import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { linkExistingHouseSources } from '@/lib/house/source-link.functions';
export function LinkExistingSources(){
 const link=useServerFn(linkExistingHouseSources),qc=useQueryClient();
 const [busy,setBusy]=useState(false),[results,setResults]=useState<{house:string;status:string;message:string}[]>([]),[error,setError]=useState('');
 return <div className="house-ledger"><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setResults(await link({data:{key:crypto.randomUUID()}}));await qc.invalidateQueries({queryKey:['noble-house']});}catch(e){setError(e instanceof Error?e.message:'Falha ao vincular.');}finally{setBusy(false);}}}><Link2 size={16}/>{busy?'Conferindo vínculos…':'Vincular fichas e trazer totais conferidos'}</Button><p className="house-caption">Somente fontes com identidade e total final únicos. Compras preservadas; fontes múltiplas e erros aguardam decisão. Não importa tropas ou posses legadas.</p>{error&&<p role="alert">{error}</p>}<ul aria-live="polite">{results.map(r=><li key={r.house}><strong>{r.house}</strong> · {r.status==='linked'?'Vinculada':'Pendente'} · {r.message}</li>)}</ul></div>;
}