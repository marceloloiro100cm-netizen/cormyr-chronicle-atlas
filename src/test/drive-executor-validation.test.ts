import {describe,it,expect,vi,afterEach} from 'vitest';
import {runDriveSync} from '@/lib/drive-executor.server';
import {isolatedExecutor} from './fixtures/drive-executor';

// All persistence and provider operations are in memory. Any non-fixture network call fails.
afterEach(()=>vi.unstubAllGlobals());
function fixture(){vi.stubGlobal('fetch',()=>{throw new Error('Real network forbidden in isolated validation');});return isolatedExecutor();}
describe('Executor validation — simulated isolated folders only',()=>{
 it('exports once and does not loop on repeated execution',async()=>{const f=fixture();f.binding();const r=f.record();await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(1);expect(r.sync_state).toBe('synced');expect(f.remote.size).toBe(1);});
 it.each(['enabled','privacy_reviewed','runtime_authorized'])('does not even list a folder without %s',async(flag)=>{const f=fixture();f.binding('house',{[flag]:false});f.record();await runDriveSync(f.db,f.adapter);expect(f.calls).toEqual([]);});
 it('never exports GM secrets, another house, or private players into shared folders',async()=>{const f=fixture();f.binding();f.record({visibility:'gm',content:'Master secret'});f.record({house_id:'other-house'});f.record({visibility:'player',player_id:crypto.randomUUID()});const result=await runDriveSync(f.db,f.adapter);expect(result.synced).toBe(0);expect(f.remote.size).toBe(0);});
 it('stops before folder access after confirming admin loses authorization',async()=>{const f=fixture();f.binding();f.tables['user_roles']=[];await runDriveSync(f.db,f.adapter);expect(f.calls).toEqual([]);expect(f.tables['drive_sync_bindings']?.[0]?.['last_error']).toContain('não está mais autorizado');});
 it('rejects an individual folder belonging to a different authenticated identity',async()=>{const f=fixture();const p=crypto.randomUUID();f.binding('player',{player_id:p});f.tables['campaign_players']?.push({id:p,user_id:crypto.randomUUID()});await runDriveSync(f.db,f.adapter);expect(f.calls).toEqual([]);});
 it('retains failed work, respects retry deadline and then succeeds without duplication',async()=>{const f=fixture();f.binding();f.record();f.fail(1);const result=await runDriveSync(f.db,f.adapter);expect(result.failed).toBe(1);const q=f.tables['sync_outbox']?.[0];expect(q?.['state']).toBe('error');expect(q?.['attempts']).toBe(1);expect(f.remote.size).toBe(0);await runDriveSync(f.db,f.adapter);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(1);if(!q)throw new Error('Missing queue');q['next_attempt_at']='2026-01-01';await runDriveSync(f.db,f.adapter);expect(q['state']).toBe('synced');expect(f.remote.size).toBe(1);});
 it('does not claim a currently leased folder',async()=>{const f=fixture();f.binding('house',{lease_until:new Date(Date.now()+120000).toISOString(),lease_token:crypto.randomUUID()});f.record();await runDriveSync(f.db,f.adapter);expect(f.calls).toEqual([]);});
 it('concurrent executions export the record once',async()=>{const f=fixture();f.binding();f.record();await Promise.all([runDriveSync(f.db,f.adapter),runDriveSync(f.db,f.adapter)]);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(1);expect(f.tables['drive_sync_bindings']?.[0]?.['lease_token']).toBeNull();});
 it('imports a mapped sequential change, preserves its version and stops looping',async()=>{const f=fixture();f.binding();const r=f.record();await runDriveSync(f.db,f.adapter);const remote=[...f.remote.values()][0];if(!remote)throw new Error('Missing remote');remote.doc={...remote.doc,content:'Remote change',version:2,baseVersion:1,origin:'drive'};await runDriveSync(f.db,f.adapter);expect(r.content).toBe('Remote change');expect(r.version).toBe(2);expect(f.tables['record_versions']?.[0]?.['content']).toBe('Remote change');const writes=f.calls.filter(c=>c.method==='write').length;await runDriveSync(f.db,f.adapter);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(writes);});
 it('simultaneous site/folder edits preserve both and never overwrite',async()=>{const f=fixture();f.binding();const r=f.record();await runDriveSync(f.db,f.adapter);const remote=[...f.remote.values()][0];if(!remote)throw new Error('Missing remote');r.version=2;r.content='Site concurrent';f.enqueue(r,'record');remote.doc={...remote.doc,content:'Folder concurrent',version:2,baseVersion:1};await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(1);expect(f.tables['drive_sync_inbox']).toHaveLength(1);expect(JSON.stringify(f.tables['drive_sync_inbox']?.[0]?.['site_snapshot'])).toContain('Site concurrent');expect(JSON.stringify(f.tables['drive_sync_inbox']?.[0]?.['folder_snapshot'])).toContain('Folder concurrent');expect(r.sync_state).toBe('conflict');});
 it('does not erase a site document when its remote copy disappears',async()=>{const f=fixture();f.binding();const r=f.record();await runDriveSync(f.db,f.adapter);f.remote.clear();await runDriveSync(f.db,f.adapter);expect(r.content).toBe('Original');expect(f.tables['campaign_records']).toHaveLength(1);});
 it('does not falsely mark a newly edited site version as synchronized',async()=>{const f=fixture();f.binding();const r=f.record();f.onWrite(()=>{r.version=2;r.content='Edited during export';f.enqueue(r,'record');});await runDriveSync(f.db,f.adapter);expect(r.sync_state).toBe('pending');expect(f.tables['sync_outbox']?.find(q=>q['version']===2)?.['state']).toBe('pending');});
 it('does not read historical incompatible files',async()=>{const f=fixture();f.binding();f.adapter.list=async()=>[{id:'history',name:'historical.json',parents:['isolated']}];await runDriveSync(f.db,f.adapter);expect(f.calls).toEqual([]);});
 it('stages a new external document once, without importing before review',async()=>{
  const f=fixture();const b=f.binding();const r=f.record();await runDriveSync(f.db,f.adapter);
  const doc=[...f.remote.values()][0]?.doc;if(!doc)throw new Error('Missing fixture');
  const id=crypto.randomUUID();f.remote.set('new-file',{folder:b.folder_id,doc:{...doc,id,title:'New external document'},etag:'new'});
  await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);
  expect(f.tables['drive_sync_inbox']).toHaveLength(1);expect(f.tables['drive_sync_inbox']?.[0]?.['state']).toBe('review');
  expect(f.tables['campaign_records']).toHaveLength(1);expect(r.content).toBe('Original');
 });
 it('exports private replies only to the intended author and master and confirms both before completion',async()=>{
  const f=fixture(),player=crypto.randomUUID(),user=crypto.randomUUID();
  const master=f.binding('master');const privateFolder=f.binding('player',{player_id:player,owner_user_id:user});
  f.tables['campaign_players']?.push({id:player,user_id:user});
  const letter={id:crypto.randomUUID(),recipient_player_id:player,recipient_house_id:null,sender_user_id:master.owner_user_id,sender_name:'Fixture master',subject:'Private fixture',content:'Private letter',created_at:'2026-10-23'};
  f.tables['campaign_letters']?.push(letter);
  const reply={id:crypto.randomUUID(),letter_id:letter.id,author_user_id:user,author_player_id:player,recipient_user_id:master.owner_user_id,author_name:'Fixture player',content:'Private reply',created_at:'2026-10-23',version:1,deleted_at:null as string|null,sync_state:'pending'};
  f.tables['letter_replies']?.push(reply);const q=f.enqueue(reply,'reply');
  await runDriveSync(f.db,f.adapter);
  q['next_attempt_at']='2026-01-01';await runDriveSync(f.db,f.adapter);
  expect(reply.sync_state).toBe('synced');expect(f.remote.size).toBe(2);
  expect([...f.remote.values()].map(r=>r.folder).sort()).toEqual([master.folder_id,privateFolder.folder_id].sort());
  const count=f.calls.filter(c=>c.method==='write').length;await runDriveSync(f.db,f.adapter);expect(f.calls.filter(c=>c.method==='write')).toHaveLength(count);
 });
 it('exports corrected reply versions and publishes a redacted deletion notice to both private folders',async()=>{
  const f=fixture(),player=crypto.randomUUID(),user=crypto.randomUUID();
  const master=f.binding('master');
  const privateFolder=f.binding('player',{player_id:player,owner_user_id:user});
  f.tables['campaign_players']?.push({id:player,user_id:user});
  const letter={id:crypto.randomUUID(),recipient_player_id:player,recipient_house_id:null,
    sender_user_id:master.owner_user_id,sender_name:'Narrador',subject:'Fio',content:'Texto',
    publication_state:'delivered',created_at:'2026-10-23'};
  f.tables['campaign_letters']?.push(letter);
  const reply={id:crypto.randomUUID(),letter_id:letter.id,author_user_id:user,author_player_id:player,
    recipient_user_id:master.owner_user_id,author_name:'Jogadora',content:'Versão original',
    publication_state:'delivered',created_at:'2026-10-23',version:1,sync_state:'pending'};
  f.tables['letter_replies']?.push(reply);
  f.enqueue(reply,'reply');
  await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);
  expect(reply.sync_state).toBe('synced');
  reply.version=2;reply.content='Versão revisada';reply.sync_state='pending';
  f.enqueue(reply,'reply');
  await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);
  expect(reply.sync_state).toBe('synced');
  expect([...f.remote.values()].map(v=>v.doc.version)).toEqual([2,2]);
  expect([...f.remote.values()].map(v=>v.doc.content)).toEqual(['Versão revisada','Versão revisada']);
  reply.version=3;reply.deleted_at='2026-10-30T10:00:00Z';reply.sync_state='pending';
  f.enqueue(reply,'reply');
  await runDriveSync(f.db,f.adapter);await runDriveSync(f.db,f.adapter);
  expect(reply.sync_state).toBe('synced');
  expect([...f.remote.values()].map(v=>v.doc.version)).toEqual([3,3]);
  expect([...f.remote.values()].every(v=>v.doc.content==='[Resposta excluída pelo Narrador]')).toBe(true);
  expect([...f.remote.values()].map(v=>v.folder).sort()).toEqual([master.folder_id,privateFolder.folder_id].sort());
 });
 it('keeps a reply pending when its authorized recipient folder is missing',async()=>{
  const f=fixture(),player=crypto.randomUUID(),user=crypto.randomUUID();f.binding('player',{player_id:player,owner_user_id:user});
  f.tables['campaign_players']?.push({id:player,user_id:user});const letter={id:crypto.randomUUID(),recipient_player_id:player,recipient_house_id:null};f.tables['campaign_letters']?.push(letter);
  const reply={id:crypto.randomUUID(),letter_id:letter.id,author_user_id:user,recipient_user_id:crypto.randomUUID(),author_name:'Fixture',content:'Response',created_at:'2026-10-23',version:1,sync_state:'pending'};
  f.tables['letter_replies']?.push(reply);f.enqueue(reply,'reply');await runDriveSync(f.db,f.adapter);
  expect(f.remote.size).toBe(1);expect(reply.sync_state).toBe('pending');expect(f.tables['sync_outbox']?.[0]?.['state']).toBe('pending');
 });
});
