import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { createDriveAdapter } from './drive-adapter.server';
import { allowed, canonical, decide, digest, envelopeSchema, filename, retryDelay, type Binding, type DriveAdapter, type Envelope } from './drive-sync';
type DB=SupabaseClient<Database>;
type Row=Record<string,unknown>;
function text(r:Row,k:string){return typeof r[k]==='string'?String(r[k]):'';}
function check<T extends {error:unknown}>(r:T):T{if(r.error)throw r.error;return r;}
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Json;
async function siteEnvelope(db:DB,type:string,id:string,b:Binding):Promise<Envelope|null>{
  const table=type==='record'?'campaign_records':type==='letter'?'campaign_letters':'letter_replies';
  const result=check(await db.from(table).select('*').eq('id',id).maybeSingle());if(!result.data)return null;
  const r=result.data as unknown as Row;
  // Technical folders are still readable by their owners. Never export a draft
  // or a scheduled message there, including copies for the author.
  if(type!=='record'&&b.scope!=='master'&&r['publication_state']&&r['publication_state']!=='delivered')return null;
  let visibility:string,houseId:string|null=null,playerId:string|null=null;
  if(type==='record'){
    if(r['visibility']==='gm')return null;
    visibility=text(r,'visibility');houseId=text(r,'house_id')||null;playerId=text(r,'player_id')||null;
    if(visibility==='house'&&b.scope==='player'&&b.player_id&&houseId&&houseId===b.house_id){
      const member=check(await db.from('house_memberships').select('player_id').eq('house_id',houseId).eq('player_id',b.player_id).maybeSingle()).data;
      if(!member)return null;visibility='player';playerId=b.player_id;
    }
  }else if(type==='letter'){
    playerId=text(r,'recipient_player_id')||null;houseId=text(r,'recipient_house_id')||null;visibility=playerId?'player':'house';
    if(b.scope==='master'){visibility='master';}
    if(b.scope==='player'&&b.player_id){
      const p=check(await db.from('campaign_players').select('user_id').eq('id',b.player_id).maybeSingle()).data;
      const member=houseId?check(await db.from('house_memberships').select('player_id').eq('house_id',houseId).eq('player_id',b.player_id).maybeSingle()).data:null;
      if(playerId===b.player_id||member||p?.user_id===r['sender_user_id']){visibility='player';playerId=b.player_id;houseId=b.house_id;}
      else return null;
    }
  }else{
    const l=check(await db.from('campaign_letters').select('*').eq('id',text(r,'letter_id')).single()).data;
    if(!l)return null;
    // Replies are copied only to the original audience and the sender's explicitly approved private/master folder.
    const p=b.player_id?check(await db.from('campaign_players').select('user_id').eq('id',b.player_id).maybeSingle()).data:null;
    if(b.scope==='master'&&(b.owner_user_id===r['recipient_user_id']||b.owner_user_id===r['author_user_id']))visibility='master';
    else if(b.scope==='player'&&(b.player_id===l.recipient_player_id||p?.user_id===r['recipient_user_id']||p?.user_id===r['author_user_id'])){visibility='player';playerId=b.player_id;}
    // A private reply to a general letter must not fan out to a house folder.
    else return null;
  }
  const version=type==='reply'?1:Number(r['version']??1);
  const e=envelopeSchema.parse({schema:'cormyr-record-v1',entityType:type,id,houseId,playerId,visibility,version,baseVersion:Math.max(version-1,0),title:text(r,type==='record'?'title':type==='letter'?'subject':'author_name'),content:text(r,'content'),...(type==='record'?{kind:r['kind']}:{}),...(type==='reply'?{letterId:r['letter_id']}:{}),createdAt:text(r,'created_at'),updatedAt:text(r,'updated_at')||text(r,'created_at'),authorName:text(r,type==='letter'?'sender_name':'author_name'),mutationId:id,origin:'site'});
  return allowed(b,e)?e:null;
}
async function stage(db:DB,b:Binding,file:string,etag:string,remote:Envelope,site:Envelope|null,conflict:boolean){
  check(await db.from('drive_sync_inbox').upsert({binding_id:b.id,file_id:file,etag,remote_hash:await digest(remote),folder_snapshot:json(remote),site_snapshot:site?json(site):null,state:conflict?'conflict':'review'},{onConflict:'binding_id,file_id,remote_hash',ignoreDuplicates:true}));
  if(conflict&&site?.entityType==='record')check(await db.from('campaign_records').update({sync_state:'conflict'}).eq('id',site.id));
}
export async function runDriveSync(db:DB,adapter:DriveAdapter=createDriveAdapter(),bindingIds?:string[]){
  const bindings=check(await db.from('drive_sync_bindings').select('*').eq('enabled',true).eq('privacy_reviewed',true).eq('runtime_authorized',true).order('last_checked_at',{ascending:true,nullsFirst:true})).data??[];
  let synced=0,review=0,failed=0;
  // Bounded executions; each binding has a durable lease. The schedule supplies reconciliation/retry.
  for(const b of (bindingIds?bindings.filter(b=>bindingIds.includes(b.id)):bindings).slice(0,bindingIds?10:2)){
    const token=crypto.randomUUID();if(!check(await db.rpc('claim_drive_binding',{p_id:b.id,p_token:token})).data)continue;
    try{
      const admin=check(await db.from('user_roles').select('user_id').eq('user_id',b.confirmed_by).eq('role','admin')).data;
      if(!admin?.length)throw new Error('Administrador que confirmou a pasta não está mais autorizado.');
      if(b.scope==='player'){
        const player=check(await db.from('campaign_players').select('user_id').eq('id',b.player_id??'').maybeSingle()).data;
        if(!player||player.user_id!==b.owner_user_id)throw new Error('Identidade da pasta individual não confirmada.');
      }
      if(b.scope==='master'&&!check(await db.from('user_roles').select('user_id').eq('user_id',b.owner_user_id).eq('role','admin')).data?.length)throw new Error('Pasta do mestre sem proprietário administrador.');
      const technicalFolder=b.technical_folder_id??b.folder_id;
      const files=await adapter.list(technicalFolder);
      const mappings=check(await db.from('drive_sync_files').select('*').eq('binding_id',b.id)).data??[];
      // Inspect only compatible new files; historical files are never loaded.
      for(const f of files){
        if(!/^cormyr-(record|letter|reply)-[0-9a-f-]{36}(-v[0-9]+-[0-9a-f]{64})?\.json$/.test(f.name)||Number(f.size??0)>2_100_000||!f.parents?.includes(technicalFolder))continue;
        const remote=await adapter.read(f.id);if(!allowed(b,remote.envelope))continue;
        const canonicalName=filename(remote.envelope);
        const versionName=canonicalName.replace('.json',`-v${remote.envelope.version}-${await digest(remote.envelope)}.json`);
        if(f.name!==canonicalName&&f.name!==versionName)continue;
        const site=await siteEnvelope(db,remote.envelope.entityType,remote.envelope.id,b);
        const m=mappings.find(x=>x.file_id===f.id);
        const h=await digest(remote.envelope);
        // Append-only prior versions remain in Drive but are not new imports/conflicts.
        const head=mappings.find(x=>x.entity_id===remote.envelope.id&&x.entity_type===remote.envelope.entityType);
        if(!m&&head&&remote.envelope.version<=envelopeSchema.parse(head.base_snapshot).version)continue;
        if(!m){
          if(site&&canonical(site)===canonical(remote.envelope)){
            check(await db.from('drive_sync_files').upsert({binding_id:b.id,entity_type:site.entityType,entity_id:site.id,file_id:f.id,etag:remote.etag,base_snapshot:json(site),remote_hash:h},{onConflict:'binding_id,entity_type,entity_id'}));
          }else{await stage(db,b,f.id,remote.etag,remote.envelope,site,Boolean(site));review++;}continue;
        }
        if(!site)continue;
        const reviewed=check(await db.from('drive_sync_inbox').select('id').eq('binding_id',b.id).eq('file_id',f.id).eq('remote_hash',h).eq('state','applied')).data;
        if(reviewed?.length)continue;
        const decision=decide(envelopeSchema.parse(m.base_snapshot),site,remote.envelope);
        if(decision==='import'){
          // Previously reviewed mapped record changes can apply automatically; new identities/replies require review.
          if(site.entityType==='record'){
            const applied=check(await db.rpc('apply_drive_record',{p_binding:b.id,p_file:f.id,p_doc:json(remote.envelope),p_site_version:site.version})).data;
            if(!applied){await stage(db,b,f.id,remote.etag,remote.envelope,site,true);review++;}
            else {
              // Record audit trigger retains the previous/current versions. Base is remote until export reads back the new site version.
              check(await db.from('drive_sync_files').update({base_snapshot:json(remote.envelope),remote_hash:h,etag:remote.etag}).eq('id',m.id));
            }
          }else{await stage(db,b,f.id,remote.etag,remote.envelope,site,true);review++;}
        }else if(decision==='conflict'){await stage(db,b,f.id,remote.etag,remote.envelope,site,true);review++;}
      }
      const queue=check(await db.from('sync_outbox').select('*').in('state',['pending','error']).lte('next_attempt_at',new Date().toISOString()).order('last_attempt_at',{ascending:true,nullsFirst:true}).limit(100)).data??[];
      for(const q of queue){
        const lease=check(await db.from('drive_sync_bindings').update({lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',b.id).eq('lease_token',token).select('id')).data;
        if(!lease?.length)throw new Error('Execução perdeu a autorização temporária da pasta.');
        const e=await siteEnvelope(db,q.entity_type,q.entity_id,b);if(!e)continue;
        // A single queue row can have multiple authorized destinations; don't drain before all are confirmed.
        const mapped=check(await db.from('drive_sync_files').select('*').eq('binding_id',b.id).eq('entity_type',q.entity_type).eq('entity_id',q.entity_id).maybeSingle()).data;
        const candidates=files.filter(f=>f.name===filename(e));
        if(candidates.length>1){await db.from('drive_sync_bindings').update({last_error:'Arquivos duplicados; revisão necessária.'}).eq('id',b.id);continue;}
        const fileId=mapped?.file_id??candidates[0]?.id;
        try{
          const remote=fileId?await adapter.read(fileId):null;
          if(remote&&canonical(remote.envelope)!==canonical(e)){
            const reviewed=check(await db.from('drive_sync_inbox').select('id').eq('binding_id',b.id).eq('file_id',fileId??'').eq('remote_hash',await digest(remote.envelope)).eq('state','applied')).data;
            if(!reviewed?.length && (!mapped||decide(envelopeSchema.parse(mapped.base_snapshot),e,remote.envelope)!=='export')){await stage(db,b,fileId??'',remote.etag,remote.envelope,e,true);review++;continue;}
          }
          const done=remote&&canonical(remote.envelope)===canonical(e)?{id:fileId??'',...remote}:await adapter.write(technicalFolder,e,fileId,remote?.etag);
          check(await db.from('drive_sync_files').upsert({binding_id:b.id,entity_type:e.entityType,entity_id:e.id,file_id:done.id,etag:done.etag,base_snapshot:json(e),remote_hash:await digest(done.envelope),last_synced_at:new Date().toISOString()},{onConflict:'binding_id,entity_type,entity_id'}));
          // Reply destinations may still be pending. Never claim all-destination completion from one copy.
          if(e.entityType!=='reply'){
            if(e.entityType==='record')check(await db.from('campaign_records').update({sync_state:'synced',last_synced_at:new Date().toISOString()}).eq('id',e.id).eq('version',e.version));
            // A letter fan-out completes only after every authorized audience has this version.
            const destinations=[];
            for(const target of bindings){if(await siteEnvelope(db,q.entity_type,q.entity_id,target))destinations.push(target);}
            const copies=check(await db.from('drive_sync_files').select('*').eq('entity_type',e.entityType).eq('entity_id',e.id)).data??[];
            const complete=destinations.every(target=>copies.some(copy=>copy.binding_id===target.id&&envelopeSchema.parse(copy.base_snapshot).version===e.version));
            if(complete){
              if(e.entityType==='letter')check(await db.from('campaign_letters').update({sync_state:'synced',last_synced_at:new Date().toISOString()}).eq('id',e.id).eq('version',e.version));
              check(await db.from('sync_outbox').update({state:'synced',error:null,last_attempt_at:new Date().toISOString()}).eq('entity_id',e.id).lte('version',e.version));
            }
          }else{
            const reply=check(await db.from('letter_replies').select('author_user_id,recipient_user_id').eq('id',e.id).single()).data;
            const copies=check(await db.from('drive_sync_files').select('binding_id').eq('entity_type','reply').eq('entity_id',e.id)).data??[];
            const delivered=(user:string)=>bindings.some(target=>target.owner_user_id===user&&(target.scope==='player'||target.scope==='master')&&copies.some(copy=>copy.binding_id===target.id));
            if(reply&&delivered(reply.author_user_id)&&delivered(reply.recipient_user_id)){
              check(await db.from('letter_replies').update({sync_state:'synced',last_synced_at:new Date().toISOString()}).eq('id',e.id));
              check(await db.from('sync_outbox').update({state:'synced',error:null}).eq('entity_id',e.id));
            }
          }
          synced++;
          // Do not postpone the next destination in the same execution. The hourly callback
          // already bounds repeated work when an author/recipient folder is still missing.
          if(e.entityType==='reply')check(await db.from('sync_outbox').update({last_attempt_at:new Date().toISOString()}).eq('id',q.id));
        }catch(error){failed++;const message=error instanceof Error?error.message:'Falha no Drive';check(await db.from('sync_outbox').update({state:'error',attempts:q.attempts+1,error:message,last_attempt_at:new Date().toISOString(),next_attempt_at:new Date(Date.now()+retryDelay(q.attempts+1)).toISOString()}).eq('id',q.id));}
      }
      check(await db.from('drive_sync_bindings').update({last_checked_at:new Date().toISOString(),last_error:null}).eq('id',b.id));
    }catch(error){failed++;check(await db.from('drive_sync_bindings').update({last_error:error instanceof Error?error.message:'Falha de sincronização',last_checked_at:new Date().toISOString()}).eq('id',b.id));}
    finally{check(await db.from('drive_sync_bindings').update({lease_token:null,lease_until:null}).eq('id',b.id).eq('lease_token',token));}
  }
  return {synced,review,failed,message:`${synced} cópias confirmadas; ${review} revisões; ${failed} falhas. Pastas não autorizadas permanecem desligadas.`};
}
