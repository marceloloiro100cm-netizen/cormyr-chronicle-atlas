import { z } from 'zod';

export const envelopeSchema = z.object({
  schema: z.literal('cormyr-record-v1'), entityType: z.enum(['record','letter','reply']),
  id: z.string().uuid(), houseId: z.string().nullable(), playerId: z.string().uuid().nullable(),
  visibility: z.enum(['house','player','master']), version: z.number().int().positive(),
  baseVersion: z.number().int().nonnegative(), title: z.string().max(500), content: z.string().max(2_000_000),
  kind: z.enum(['document','character','details']).optional(), letterId: z.string().uuid().optional(),
  createdAt: z.string(), updatedAt: z.string(), authorName: z.string().max(160).optional(),
  mailLinks: z.object({originHouseId:z.string().nullable(),courtMemberId:z.string().nullable(),courtAssignment:z.enum(['executor','order_recipient']).nullable(),militaryUnitId:z.string().nullable(),sheetVersion:z.number().int().nullable(),deliveryWeek:z.number().int().nullable()}).strict().optional(),
  mutationId: z.string().uuid(), origin: z.enum(['site','drive']),
}).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export type Binding = {id:string;folder_id:string;scope:string;house_id:string|null;player_id:string|null;owner_user_id:string;enabled:boolean;privacy_reviewed:boolean;runtime_authorized:boolean};
export function allowed(b:Binding,e:Envelope) {
  if(!b.enabled || !b.privacy_reviewed || !b.runtime_authorized) return false;
  if(e.entityType==='record' && e.visibility==='master')return false;
  return b.scope==='house' ? e.visibility==='house'&&e.houseId===b.house_id&&e.playerId===null :
    b.scope==='player' ? e.visibility==='player'&&e.playerId===b.player_id : e.visibility==='master';
}
export function canonical(e:Envelope){
  const base=[e.schema,e.entityType,e.id,e.houseId,e.playerId,e.visibility,e.version,e.title,e.content,e.kind??null,e.letterId??null,e.createdAt,e.updatedAt,e.authorName??null];
  return JSON.stringify(e.mailLinks?[...base,[e.mailLinks.originHouseId,e.mailLinks.courtMemberId,e.mailLinks.courtAssignment,e.mailLinks.militaryUnitId,e.mailLinks.sheetVersion,e.mailLinks.deliveryWeek]]:base);
}
export async function digest(e:Envelope){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(e))))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function decide(base:Envelope,site:Envelope,remote:Envelope):'noop'|'export'|'import'|'conflict'{
  const a=canonical(base),s=canonical(site),r=canonical(remote);
  if(s===r)return 'noop';
  if(r===a)return 'export';
  if(s===a && remote.baseVersion===base.version && remote.version===base.version+1)return 'import';
  return 'conflict';
}
export const retryDelay=(attempt:number)=>Math.min(3_600_000,30_000*2**Math.min(Math.max(attempt-1,0),7));
export const filename=(e:Envelope)=>`cormyr-${e.entityType}-${e.id}.json`;
export type RemoteFile={id:string;name:string;parents?:string[];mimeType?:string;size?:string};
export type ReadResult={envelope:Envelope;etag:string};
export interface DriveAdapter {
  list(folder:string):Promise<RemoteFile[]>;
  read(file:string):Promise<ReadResult>;
  write(folder:string,e:Envelope,file?:string,etag?:string):Promise<{id:string;etag:string;envelope:Envelope}>;
}
