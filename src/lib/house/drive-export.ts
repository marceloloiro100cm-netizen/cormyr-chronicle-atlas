import { z } from 'zod';
import type { HouseState } from './types';

export const houseExportSchema = z.object({
  schema: z.literal('cormyr-house-v1'), houseId: z.string().min(1).max(100),
  version: z.number().int().positive(), updatedAt: z.string(),
  state: z.record(z.string(), z.unknown()),
  ledger: z.array(z.object({ id: z.string(), action: z.string(), explanation: z.string(), rule: z.string(), campaign_month: z.number(), version: z.number(), created_at: z.string() }).strict()),
}).strict();
export type HouseExport = z.infer<typeof houseExportSchema>;
export const houseExportName = (houseId: string) => {
  if (!/^[a-z0-9-]+$/.test(houseId)) throw new Error('Identidade de casa inválida.');
  return `cormyr-house-${houseId}.json`;
};
const fields = ['schemaVersion','houseId','phase','creationStep','identity','method','budget','base','permanent','regionalApplied','rolls','domains','holdings','units','projects','court','month','treasury','fortunes','actions','pending','importSources','vassals'] as const;
export function buildHouseExport(houseId: string, version: number, updatedAt: string, state: HouseState, ledger: HouseExport['ledger']): HouseExport {
  if (state.houseId !== houseId || state.schemaVersion !== 1) throw new Error('Ficha divergente da casa.');
  // A separate explicit projection: never include narrator notes or campaign records.
  const projected = Object.fromEntries(fields.filter(k => state[k] !== undefined).map(k => [k, state[k]]));
  return houseExportSchema.parse(JSON.parse(JSON.stringify({ schema: 'cormyr-house-v1', houseId, version, updatedAt, state: projected, ledger })));
}
export const serializeHouseExport = (e: HouseExport) => JSON.stringify(e);
export async function houseExportHash(e: HouseExport) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeHouseExport(e))))).map(x => x.toString(16).padStart(2, '0')).join('');
}
export type HouseExportHead = { fileId: string; hash: string; version: number };
export interface HouseExportAdapter {
  read(id: string, folder: string): Promise<{ document: HouseExport; etag: string | null }>;
  write(folder: string, document: HouseExport, fileId?: string, etag?: string | null): Promise<{ fileId: string; document: HouseExport; etag: string | null }>;
}
export async function exportHouseVersion(adapter: HouseExportAdapter, folder: string, document: HouseExport, head?: HouseExportHead) {
  const hash = await houseExportHash(document);
  let etag: string | null = null;
  if (head) {
    const remote = await adapter.read(head.fileId, folder);
    if (remote.document.houseId !== document.houseId) throw new Error('Arquivo pertence a outra casa.');
    const remoteHash = await houseExportHash(remote.document);
    if (remoteHash === hash) return { fileId: head.fileId, hash, version: document.version, etag: remote.etag };
    if (remoteHash !== head.hash) throw new Error('Arquivo alterado no Drive; revisão necessária. Compras no site preservadas.');
    if (remote.document.version > document.version) throw new Error('Versão remota mais recente; revisão necessária.');
    etag = remote.etag;
  }
  const result = await adapter.write(folder, document, head?.fileId, etag);
  if (await houseExportHash(result.document) !== hash) throw new Error('Leitura de retorno divergiu.');
  return { fileId: result.fileId, hash, version: document.version, etag: result.etag };
}