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
});
