import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { exportHouseToDrive } from '@/lib/house/drive.functions';

export function HouseDriveStatus({ houseId, version, canEdit }: { houseId: string; version: number; canEdit: boolean }) {
  const send = useServerFn(exportHouseToDrive), qc = useQueryClient();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['house-drive', houseId, version], queryFn: async () => {
    const r = await supabase.from('noble_house_drive_exports').select('exported_version,status,error,last_synced_at').eq('house_id', houseId);
    if (r.error) throw new Error('Status do Drive indisponível.'); return r.data;
  } });
  return <div className="house-ledger"><h4>Ficha no Google Drive</h4>
    <p className="house-caption">Destino: pasta técnica existente · Site → Drive · Alterações no Drive não substituem compras no site.</p>
    {version === 0 && <p>Nenhuma Ficha estruturada salva; nenhuma exportação ou migração realizada.</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    {query.data?.map((r,i) => <p key={i}>v{r.exported_version} · {r.status === 'synced' && r.exported_version === version ? 'Confirmada' : r.status === 'error' ? 'Falha / revisão necessária' : 'Atualização pendente'}{r.error ? ` · ${r.error}` : ''}</p>)}
    {version > 0 && query.data?.length === 0 && <p>Exportação ainda não confirmada.</p>}
    {canEdit && <Button variant="outline" disabled={busy || version === 0} onClick={async () => {
      setBusy(true); setMessage(''); try { setMessage((await send({ data: { houseId } })).message); } catch (e) { setMessage(e instanceof Error ? e.message : 'Falha na exportação.'); } finally { await qc.invalidateQueries({ queryKey: ['house-drive',houseId] }); setBusy(false); }
    }}><CloudUpload size={16}/>{busy ? 'Exportando…' : 'Atualizar Ficha no Drive'}</Button>}
    <p className="house-caption">Arquivo identificado pela casa; sem confirmação segura da versão remota, novas versões são preservadas separadamente.</p>
    <p role="status">{message}</p>
  </div>;
}