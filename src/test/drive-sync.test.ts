import { describe,it,expect,vi,afterEach } from 'vitest';
import { allowed,canonical,decide,envelopeSchema,retryDelay,filename,type Envelope,type Binding } from '@/lib/drive-sync';
import { createDriveAdapter } from '@/lib/drive-adapter.server';
const id='52200000-0000-4000-8000-000000000001';
const base:Envelope={schema:'cormyr-record-v1',entityType:'record',id,houseId:'erdenor',playerId:null,visibility:'house',version:1,baseVersion:0,title:'Fixture',content:'Original',kind:'document',createdAt:'2026-10-23',updatedAt:'2026-10-23',origin:'site',mutationId:id};
const binding:Binding={id,folder_id:'isolated',scope:'house',house_id:'erdenor',player_id:null,owner_user_id:id,enabled:true,privacy_reviewed:true,runtime_authorized:true};
afterEach(()=>vi.unstubAllEnvs());
describe('Drive privacy and versions',()=>{
 it('blocks execution without explicit runtime authorization',()=>expect(allowed({...binding,runtime_authorized:false},base)).toBe(false));
 it('blocks mappings without privacy review',()=>expect(allowed({...binding,privacy_reviewed:false},base)).toBe(false));
 it('blocks disabled mappings',()=>expect(allowed({...binding,enabled:false},base)).toBe(false));
 it('never exports master secrets to shared folders',()=>expect(allowed(binding,{...base,visibility:'master'})).toBe(false));
 it('isolates other houses',()=>expect(allowed(binding,{...base,houseId:'ashkar'})).toBe(false));
 it('isolates private player documents from shared folders',()=>expect(allowed(binding,{...base,visibility:'player',playerId:id})).toBe(false));
 it('prevents mutation-only loops',()=>expect(canonical({...base,origin:'drive',mutationId:crypto.randomUUID()})).toBe(canonical(base)));
 it('accepts a sequential remote edit only from the unchanged base',()=>expect(decide(base,base,{...base,content:'Folder',version:2,baseVersion:1})).toBe('import'));
 it('preserves simultaneous edits as conflict',()=>expect(decide(base,{...base,content:'Site',version:2},{...base,content:'Folder',version:2,baseVersion:1})).toBe('conflict'));
 it('rejects stale remote ancestry',()=>expect(decide(base,base,{...base,content:'Folder',version:2,baseVersion:0})).toBe('conflict'));
 it('exports site changes when remote is unchanged',()=>expect(decide(base,{...base,content:'Site',version:2},base)).toBe('export'));
 it('retries exponentially with a one-hour maximum',()=>{expect(retryDelay(1)).toBe(30000);expect(retryDelay(2)).toBe(60000);expect(retryDelay(50)).toBe(3600000);});
 it('rejects permission fields from external documents',()=>expect(envelopeSchema.safeParse({...base,role:'admin'}).success).toBe(false));
});
describe('Drive adapter isolated fixtures',()=>{
 function adapter(){vi.stubEnv('GOOGLE_DRIVE_API_KEY','fixture');vi.stubEnv('LOVABLE_API_KEY','fixture');const calls:{method:string;path:string;match:string|null}[]=[];let doc=base;const fake:typeof fetch=async(input,init)=>{const path=String(input),method=init?.method??'GET';calls.push({method,path,match:new Headers(init?.headers).get('If-Match')});if(method==='PATCH'){doc=JSON.parse(String(init?.body));return new Response('{}');}if(path.includes('alt=media'))return new Response(JSON.stringify(doc),{headers:{etag:'"v1"'}});if(path.includes('generateIds'))return Response.json({ids:['fixture-file']});if(method==='POST'){const body=String(init?.body);expect(body).toContain(filename(base));return new Response('{}');}return Response.json({files:[]});};return {drive:createDriveAdapter(fake),calls};}
 it('updates with If-Match and verifies the returned document',async()=>{const {drive,calls}=adapter();const edit={...base,content:'Changed',version:2};const result=await drive.write('isolated',edit,'fixture-file','"v1"');expect(result.envelope.content).toBe('Changed');expect(calls.find(c=>c.method==='PATCH')?.match).toBe('"v1"');expect(calls.at(-1)?.path).toContain('alt=media');});
 it('refuses an overwrite without a provider version',async()=>{const {drive,calls}=adapter();await expect(drive.write('isolated',base,'fixture-file')).rejects.toThrow('Versão remota');expect(calls).toEqual([]);});
 it('preserves a failed write as an error instead of success',async()=>{vi.stubEnv('GOOGLE_DRIVE_API_KEY','fixture');vi.stubEnv('LOVABLE_API_KEY','fixture');const log=vi.spyOn(console,'error').mockImplementation(()=>{});const drive=createDriveAdapter(async()=>new Response('fixture conflict',{status:412}));await expect(drive.write('isolated',base,'fixture-file','v1')).rejects.toThrow('412');log.mockRestore();});
 it('reads without ETag using a content hash that cannot authorize overwrites',async()=>{vi.stubEnv('GOOGLE_DRIVE_API_KEY','fixture');vi.stubEnv('LOVABLE_API_KEY','fixture');const drive=createDriveAdapter(async()=>Response.json(base));const result=await drive.read('fixture-file');expect(result.etag).toMatch(/^sha256:[a-f0-9]{64}$/);expect(result.envelope).toEqual(base);});
 it('appends a verified version rather than overwriting when the provider omits ETag',async()=>{
  vi.stubEnv('GOOGLE_DRIVE_API_KEY','fixture');vi.stubEnv('LOVABLE_API_KEY','fixture');const calls:{method:string;path:string;body:string}[]=[];const edited={...base,content:'Version 2',version:2};
  const drive=createDriveAdapter(async(input,init)=>{const path=String(input),method=init?.method??'GET';calls.push({method,path,body:String(init?.body??'')});if(path.includes('generateIds'))return Response.json({ids:['new-version']});if(path.includes('alt=media'))return Response.json(edited);if(method==='POST')return Response.json({id:'new-version'});return Response.json({files:[]});});
  const result=await drive.write('isolated',edited,'original','sha256:old');expect(result.id).toBe('new-version');expect(result.envelope.content).toBe('Version 2');expect(calls.some(c=>c.method==='PATCH')).toBe(false);expect(calls.find(c=>c.method==='POST')?.body).toMatch(/-v2-[a-f0-9]{64}\.json/);
 });
 it('reuses an accepted immutable version after a lost upload confirmation',async()=>{
  vi.stubEnv('GOOGLE_DRIVE_API_KEY','fixture');vi.stubEnv('LOVABLE_API_KEY','fixture');const methods:string[]=[];const drive=createDriveAdapter(async(input,init)=>{methods.push(init?.method??'GET');return String(input).includes('alt=media')?Response.json(base):Response.json({files:[{id:'already-uploaded'}]});});const result=await drive.write('isolated',base);expect(result.id).toBe('already-uploaded');expect(methods).toEqual(['GET','GET']);
 });
});

describe('metadados estruturados de missivas',()=>{
 const links={originHouseId:'erdenor',courtMemberId:'court-1',courtAssignment:'executor' as const,militaryUnitId:'unit-1',sheetVersion:2,deliveryWeek:3};
 it('aceita envelopes antigos sem alterar sua forma canônica',()=>{
  expect(envelopeSchema.parse(base)).toEqual(base);
  expect(canonical(base)).toBe(JSON.stringify([base.schema,base.entityType,base.id,base.houseId,base.playerId,base.visibility,base.version,base.title,base.content,base.kind??null,base.letterId??null,base.createdAt,base.updatedAt,base.authorName??null]));
 });
 it('preserva IDs e detecta alterações dos vínculos na reconciliação',()=>{
  const letter={...base,entityType:'letter' as const,mailLinks:links};
  expect(envelopeSchema.parse(letter).mailLinks).toEqual(links);
  expect(canonical(letter)).not.toBe(canonical({...letter,mailLinks:{...links,militaryUnitId:'unit-2'}}));
  expect(JSON.stringify(letter.mailLinks)).not.toContain('biography');
 });
});
