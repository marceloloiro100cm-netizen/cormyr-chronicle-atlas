import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { filename, type DriveAdapter, type Envelope } from '@/lib/drive-sync';
type Row=Record<string,unknown>;
export function isolatedExecutor(){
 const tables:Record<string,Row[]>={drive_sync_bindings:[],user_roles:[],campaign_players:[],campaign_records:[],campaign_letters:[],letter_replies:[],sync_outbox:[],drive_sync_files:[],drive_sync_inbox:[],record_versions:[]};
 const remote=new Map<string,{folder:string;doc:Envelope;etag:string}>();
 const calls:{method:string;folder?:string;file?:string}[]=[];
 let failWrites=0,writeHook:(()=>void)|undefined;
 function rows(name:string){return tables[name]??(tables[name]=[]);}
 function matches(row:Row,params:URLSearchParams){
  for(const [k,v] of params){if(['select','order','limit','on_conflict'].includes(k))continue;
   const dot=v.indexOf('.'),op=v.slice(0,dot),value=v.slice(dot+1),actual=row[k];
   if(op==='eq'&&String(actual)!==value)return false;
   if(op==='lte'&&String(actual)>value)return false;
   if(op==='in'&&!value.slice(1,-1).split(',').includes(String(actual)))return false;
  }return true;
 }
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!=='http://isolated.invalid')throw new Error('Non-fixture network blocked');
  const method=init?.method??'GET',name=url.pathname.split('/').at(-1)??'';
  const body=init?.body?JSON.parse(String(init.body)) as Row:{};
  if(url.pathname.includes('/rpc/')){
   if(name==='claim_drive_binding'){
    const b=rows('drive_sync_bindings').find(r=>r.id===body.p_id);
    const claim=Boolean(b&&b.enabled&&b.privacy_reviewed&&b.runtime_authorized&&(!b.lease_until||String(b.lease_until)<new Date().toISOString()));
    if(b&&claim){b.lease_token=body.p_token;b.lease_until=new Date(Date.now()+120000).toISOString();}
    return Response.json(claim);
   }
   if(name==='apply_drive_record'){
    const doc=body.p_doc as Row,r=rows('campaign_records').find(x=>x.id===doc.id);
    if(!r||r.version!==body.p_site_version)return Response.json(false);
    Object.assign(r,{title:doc.title,content:doc.content,version:Number(r.version)+1,updated_at:'2026-10-23T19:00:01Z',sync_state:'pending'});
    rows('record_versions').push({record_id:r.id,version:r.version,content:r.content});
    enqueue(r,'record');return Response.json(true);
   }
   throw new Error('Unexpected fixture RPC: '+name);
  }
  const selected=rows(name).filter(r=>matches(r,url.searchParams));
  if(method==='PATCH'){for(const r of selected)Object.assign(r,body);return Response.json(selected);}
  if(method==='POST'){
   const unique=url.searchParams.get('on_conflict')?.split(',')??[];
   let current=unique.length?rows(name).find(r=>unique.every(k=>r[k]===body[k])):undefined;
   if(current){if(!new Headers(init?.headers).get('Prefer')?.includes('ignore-duplicates'))Object.assign(current,body);}
   else {current={id:crypto.randomUUID(),...body};rows(name).push(current);}
   return Response.json([current]);
  }
  const order=url.searchParams.get('order');if(order){const key=order.split('.')[0];if(key)selected.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??'')));}
  const output=selected.slice(0,Number(url.searchParams.get('limit')??10000));
  const accept=new Headers(init?.headers).get('Accept')??'';
  return Response.json(accept.includes('vnd.pgrst.object')?(output[0]??null):output);
 };
 const db=createClient<Database>('http://isolated.invalid','fixture',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const adapter:DriveAdapter={
  async list(folder){calls.push({method:'list',folder});return [...remote].filter(([,r])=>r.folder===folder).map(([id,r])=>({id,name:filename(r.doc),parents:[folder],size:'500'}));},
  async read(file){calls.push({method:'read',file});const r=remote.get(file);if(!r)throw new Error('Fixture missing');return {envelope:structuredClone(r.doc),etag:r.etag};},
  async write(folder,doc,file,etag){calls.push({method:'write',folder,file});if(failWrites>0){failWrites--;throw new Error('Fixture 503');}writeHook?.();
   const id=file??crypto.randomUUID(),previous=remote.get(id);if(previous&&previous.etag!==etag)throw new Error('Fixture 412');
   const entry={folder,doc:structuredClone(doc),etag:crypto.randomUUID()};remote.set(id,entry);return {id,envelope:entry.doc,etag:entry.etag};
  }
 };
 function binding(scope='house',extra:Row={}){
  const id=crypto.randomUUID(),owner=crypto.randomUUID();rows('user_roles').push({user_id:owner,role:'admin'});
  const b={id,folder_id:'isolated_'+id,scope,house_id:scope==='house'?'fixture-house':null,player_id:null,owner_user_id:owner,confirmed_by:owner,enabled:true,privacy_reviewed:true,runtime_authorized:true,last_checked_at:null,...extra};rows('drive_sync_bindings').push(b);return b;
 }
 function enqueue(r:Row,type:string){const q={id:crypto.randomUUID(),entity_type:type,entity_id:r.id,version:r.version??1,state:'pending',attempts:0,payload:{...r},next_attempt_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',last_attempt_at:null};rows('sync_outbox').push(q);return q;}
 function record(extra:Row={}){const r={id:crypto.randomUUID(),house_id:'fixture-house',player_id:null,visibility:'house',kind:'document',title:'Isolated',content:'Original',version:1,created_at:'2026-10-23T19:00:00Z',updated_at:'2026-10-23T19:00:00Z',sync_state:'pending',...extra};rows('campaign_records').push(r);enqueue(r,'record');return r;}
 return {db,adapter,tables,remote,calls,binding,record,enqueue,fail:(n:number)=>{failWrites=n;},onWrite:(fn:()=>void)=>{writeHook=fn;}};
}
