import { houseExportSchema, houseExportHash, houseExportName, serializeHouseExport, type HouseExportAdapter } from './drive-export';
import { DriveError } from '@/lib/drive-adapter.server';

export function createHouseExportAdapter(request: typeof fetch = fetch): HouseExportAdapter {
  const key = process.env['GOOGLE_DRIVE_API_KEY'], bearer = process.env['LOVABLE_API_KEY'];
  if (!key || !bearer) throw new Error('Conexão Google Drive indisponível.');
  async function call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${bearer}`); headers.set('X-Connection-Api-Key', key ?? '');
    const r = await request(`https://connector-gateway.lovable.dev/google_drive${path}`, { ...init, headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) { const body = await r.text(); console.error(`Drive [${r.status}]: ${body}`); throw new DriveError(r.status, body); }
    return r;
  }
  const valid = (id: string) => { if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador Drive inválido.'); return id; };
  const adapter: HouseExportAdapter = {
    async read(id, folder) {
      valid(id); valid(folder);
      const meta = await (await call(`/drive/v3/files/${id}?fields=id,parents,trashed,mimeType`)).json() as { parents?: string[]; trashed?: boolean; mimeType?: string };
      if (meta.trashed || !meta.parents?.includes(folder) || meta.mimeType !== 'application/json') throw new Error('Arquivo fora da pasta técnica autorizada.');
      const response = await call(`/drive/v3/files/${id}?alt=media`), text = await response.text();
      if (text.length > 2_000_000) throw new Error('Ficha excede o limite da exportação.');
      return { document: houseExportSchema.parse(JSON.parse(text)), etag: response.headers.get('etag') };
    },
    async write(folder, document, fileId, etag) {
      valid(folder);
      const bodyText = serializeHouseExport(document);
      if (bodyText.length > 2_000_000) throw new Error('Ficha excede o limite da exportação.');
      if (fileId && (!etag || !etag.startsWith('sha256:'))) {
        valid(fileId);
        await call(`/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) }, body: bodyText });
      } else {
        // A missing provider ETag is not a reason to create duplicates; this branch is for missing identity or a synthetic tag.
        const name = fileId ? houseExportName(document.houseId).replace('.json', `-v${document.version}-${await houseExportHash(document)}.json`) : houseExportName(document.houseId);
        const q = new URLSearchParams({ q: `'${folder}' in parents and trashed=false and name='${name}'`, fields: 'files(id)', pageSize: '10' });
        const found = await (await call('/drive/v3/files?' + q)).json() as { files: { id: string }[] };
        if (found.files.length > 1) throw new Error('Arquivos técnicos duplicados; revisão necessária.');
        const existing = found.files[0];
        if (existing) {
          const read = await adapter.read(existing.id, folder);
          if (await houseExportHash(read.document) !== await houseExportHash(document)) throw new Error('Arquivo existente divergiu; nada foi sobrescrito.');
          return { fileId: existing.id, ...read };
        }
        const ids = await (await call('/drive/v3/files/generateIds?count=1&space=drive&type=files')).json() as { ids: string[] };
        const id = ids.ids[0]; if (!id) throw new Error('Drive não retornou identidade do arquivo.');
        const boundary = 'house_' + crypto.randomUUID();
        const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ id, name, parents: [folder], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${bodyText}\r\n--${boundary}--`;
        await call('/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }); fileId = id;
      }
      if (!fileId) throw new Error('Arquivo não confirmado.');
      return { fileId, ...await adapter.read(fileId, folder) };
    },
  };
  return adapter;
}