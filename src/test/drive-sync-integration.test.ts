import {it,expect} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {runDriveSync} from '@/lib/drive-executor.server';
import {filename,type DriveAdapter,type Envelope} from '@/lib/drive-sync';
const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_SERVICE_ROLE_KEY'],pub=process.env['SUPABASE_PUBLISHABLE_KEY'];
it.skipIf(!url||!key||!pub)('exports, imports, preserves conflict snapshots and resolves with isolated provider fixtures',async()=>{
 if(!url||!key||!pub)throw new Error('Fixture configuration unavailable');
 const shim=(k:string):typeof fetch=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(k.startsWith('sb_'))h.delete('Authorization');return fetch(input,{...init,headers:h});};
 const db=createClient<Database>(url,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
 const rid=crypto.randomUUID(),folder='fixture_'+crypto.randomUUID();let uid='',bid='',remote:Envelope|undefined,writes=0;
 try{
  const email=`fixture-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+'aA9!';
  const user=await db.auth.admin.createUser({email,password,email_confirm:true});if(user.error||!user.data.user)throw user.error;uid=user.data.user.id;
  await db.from('user_roles').insert({user_id:uid,role:'admin'});
  const client=createClient<Database>(url,pub,{auth:{persistSession:false},global:{fetch:shim(pub)}});expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
  const binding=await db.from('drive_sync_bindings').insert({folder_id:folder,scope:'house',house_id:'erdenor',owner_user_id:uid,confirmed_by:uid,enabled:true,privacy_reviewed:true,runtime_authorized:true}).select().single();if(binding.error||!binding.data)throw binding.error;bid=binding.data.id;
  expect((await db.from('campaign_records').insert({id:rid,house_id:'erdenor',visibility:'house',kind:'document',title:'Isolated fixture',content:'Original',created_by:uid,updated_by:uid})).error).toBeNull();
  const adapter:DriveAdapter={list:async()=>remote?[{id:'fixture-file',name:filename(remote),parents:[folder]}]:[],read:async()=>{if(!remote)throw new Error('No fixture');return {envelope:remote,etag:'fixture-etag'};},write:async(_folder,e)=>{writes++;remote={...e};return {id:'fixture-file',envelope:remote,etag:'fixture-etag'};}};
  await runDriveSync(db,adapter);expect(writes).toBe(1);expect(remote?.content).toBe('Original');
  if(!remote)throw new Error('Export missing');remote={...remote,content:'Remote change',version:2,baseVersion:1,origin:'drive'};
  await runDriveSync(db,adapter);
  const imported=await db.from('campaign_records').select('content,version').eq('id',rid).single();expect(imported.data).toEqual({content:'Remote change',version:2});
  expect((await client.rpc('save_campaign_record',{p_id:rid,p_version:2,p_title:'Site change',p_content:'Site concurrent'})).error).toBeNull();
  remote={...remote,content:'Folder concurrent',version:3,baseVersion:2};
  const before=writes;await runDriveSync(db,adapter);expect(writes).toBe(before);
  const conflict=await db.from('drive_sync_inbox').select('*').eq('binding_id',bid).eq('state','conflict').single();expect(conflict.error).toBeNull();if(!conflict.data)throw new Error('Conflict missing');
  expect((await client.rpc('resolve_drive_import',{p_id:conflict.data.id,p_choice:'merge',p_content:'Reconciled'})).error).toBeNull();
  await runDriveSync(db,adapter);expect(remote.content).toBe('Reconciled');
  const versions=await db.from('record_versions').select('version').eq('record_id',rid).order('version');expect(versions.data?.map(r=>r.version)).toEqual([1,2,3,4]);
  const preserved=await db.from('drive_sync_inbox').select('folder_snapshot,state').eq('id',conflict.data.id).single();expect(preserved.data?.state).toBe('applied');expect(JSON.stringify(preserved.data?.folder_snapshot)).toContain('Folder concurrent');
  const repeat=writes;await runDriveSync(db,adapter);expect(writes).toBe(repeat);
 }finally{
  await db.from('drive_sync_inbox').delete().eq('binding_id',bid);await db.from('drive_sync_files').delete().eq('binding_id',bid);await db.from('drive_sync_bindings').delete().eq('id',bid);await db.from('sync_outbox').delete().eq('entity_id',rid);await db.from('record_versions').delete().eq('record_id',rid);await db.from('campaign_records').delete().eq('id',rid);await db.from('user_roles').delete().eq('user_id',uid);if(uid)await db.auth.admin.deleteUser(uid);
 }
},60000);
