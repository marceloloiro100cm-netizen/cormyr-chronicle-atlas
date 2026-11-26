/* eslint-disable @typescript-eslint/no-explicit-any -- limite do Firebase Admin e da API de consulta original. */
import {createHash,randomUUID} from 'node:crypto';
import type {QueryStep,Row} from './query';
import {readAllPaged} from './paged-read';

/**
 * Tabelas operacionais do workspace Firebase (20/11/2026).
 *
 * O acervo importado continua imutável. Cada gravação das telas originais
 * (insert, update, delete, upsert) nestas tabelas vira um documento por linha
 * em campaignCloudRuntime/{snapshot}/workspaceTableRows, sempre em
 * transação e com auditoria. A leitura junta o acervo e essas linhas, de
 * modo que a interface original funciona sem mudar o código das telas.
 *
 * Só as tabelas abaixo entram aqui, cada uma com o perfil que pode ler e
 * gravar. Todo o resto continua bloqueado (501).
 */
export class TableOverlayError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}
const fail=(code:string,status=400):never=>{throw new TableOverlayError(code,status);};
type Profile='narrador'|'jogador'|'editor';
type TableConfig={
 key:string;
 read:(p:Profile)=>boolean;write:(p:Profile)=>boolean;
 ops:readonly ('insert'|'update'|'delete'|'upsert')[];
 /** Campos aceitos na gravação; o resto é recusado. */
 fields:readonly string[];
 /** Valores padrão de uma linha nova (id, datas, situação). */
 create:(row:Row,now:string)=>Row;
 maxRows:number;maxBytes:number;
};
const editorial=(p:Profile)=>p==='editor'||p==='narrador';
const narrator=(p:Profile)=>p==='narrador';
export const OVERLAY_TABLES:Readonly<Record<string,TableConfig>>={
 campaign_newspaper_story_models:{key:'id',read:editorial,write:editorial,
  ops:['insert','update','delete'],fields:['id','name','description','blocks','updated_at'],
  create:(r,now)=>({id:r['id']??randomUUID(),description:'',blocks:[],created_at:now,updated_at:now,...r}),
  maxRows:100,maxBytes:300_000},
 campaign_newspaper_engravings:{key:'id',read:editorial,write:editorial,
  ops:['insert','update','delete'],fields:['id','name','image_path','public_src','in_collection'],
  create:(r,now)=>({id:r['id']??randomUUID(),image_path:null,public_src:null,in_collection:true,created_at:now,...r}),
  maxRows:300,maxBytes:8_000},
 campaign_newspaper_settings:{key:'id',read:editorial,write:editorial,
  ops:['upsert','update'],fields:['id','title','subtitle','template','font_style','updated_at'],
  create:(r,now)=>({id:true,updated_at:now,...r}),maxRows:1,maxBytes:4_000},
 noble_house_gm_notes:{key:'house_id',read:narrator,write:narrator,
  ops:['upsert','update','insert'],fields:['house_id','notes','secret_state'],
  create:(r,now)=>({notes:'',secret_state:{},updated_at:now,...r}),maxRows:600,maxBytes:60_000},
 campaign_houses:{key:'id',read:()=>true,write:narrator,
  ops:['insert','update'],fields:['id','name','castle','source','region','crest','lord_name','active','season','details'],
  create:(r,now)=>({active:true,season:2,region:null,crest:null,lord_name:null,castle:null,details:'',created_at:now,...r}),
  maxRows:400,maxBytes:20_000},
};
export const isOverlayTable=(name:string)=>Object.prototype.hasOwnProperty.call(OVERLAY_TABLES,name);

/** campaignCloudRuntime/{snapshot}/workspaceTableRows: um documento por linha, com o nome da tabela. */
const collection=(db:any,snapshotId:string,_table:string)=>db.collection('campaignCloudRuntime').doc(snapshotId)
 .collection('workspaceTableRows');
const docId=(table:string,key:unknown)=>createHash('sha256').update(table+':'+JSON.stringify(key)).digest('hex');

const OVERLAY_CACHE_TTL_MS=15_000;
const overlayCache=new WeakMap<object,Map<string,{at:number;rows:Promise<{key:unknown;row:Row|null}[]>}>>();

export function clearOverlayCache(db:any,snapshotId?:string,table?:string){
 const byDb=overlayCache.get(db);
 if(!byDb)return;
 if(!snapshotId||!table){byDb.clear();return;}
 byDb.delete(snapshotId+'|'+table);
}

/** Linhas operacionais de uma tabela (inclui marcas de exclusão). */
export async function readOverlayRows(
 db:any,snapshotId:string,table:string,{useCache=false}:{useCache?:boolean}={},
):Promise<{key:unknown;row:Row|null}[]>{
 const run=async():Promise<{key:unknown;row:Row|null}[]>=>{
  const col=collection(db,snapshotId,table);
  // Filter directly in Firestore by `table` whenever the client supports `.where`,
  // avoiding a full-collection scan across all overlay tables.
  if(typeof col.where==='function'){
   const config=OVERLAY_TABLES[table];
   const maxRows=config?Math.max(config.maxRows*3,2000):50_000;
   const filtered=col.where('table','==',table);
   const snap=typeof filtered?.limit==='function'
    ?await filtered.limit(maxRows+1).get()
    :await filtered.get();
   const docs=Array.isArray(snap?.docs)?snap.docs:null;
   if(!docs||docs.length>maxRows)fail('overlay_too_large',503);
   return docs.map((d:any)=>d.data()).filter((v:any)=>v&&v.table===table)
    .map((v:any)=>({key:v.key,row:v.deleted?null:(v.row??null)}));
  }
  const snap=await readAllPaged<any>(col,50_000);
  if(snap.overLimit)fail('overlay_too_large',503);
  return snap.docs.map((d:any)=>d.data()).filter((v:any)=>v&&v.table===table)
   .map((v:any)=>({key:v.key,row:v.deleted?null:(v.row??null)}));
 };
 if(!useCache)return run();
 let byDb=overlayCache.get(db);
 if(!byDb){byDb=new Map();overlayCache.set(db,byDb);}
 const key=snapshotId+'|'+table,now=Date.now(),hit=byDb.get(key);
 if(hit&&now-hit.at<OVERLAY_CACHE_TTL_MS)return hit.rows;
 const entry={at:now,rows:run()};
 byDb.set(key,entry);
 entry.rows.catch(()=>{if(byDb.get(key)===entry)byDb.delete(key);});
 return entry.rows;
}

/** Acervo + linhas operacionais, pela chave da tabela. */
export function mergeOverlay(imported:Row[],overlay:{key:unknown;row:Row|null}[],key:string):Row[]{
 const byKey=new Map<string,Row|null>();
 for(const r of imported)byKey.set(JSON.stringify(r[key]),r);
 for(const o of overlay)byKey.set(JSON.stringify(o.key),o.row);
 return [...byKey.values()].filter((r):r is Row=>r!==null);
}

const FILTERS=new Set(['eq','match','in']);
const SHAPE=new Set(['select','single','maybeSingle','returns','abortSignal','throwOnError']);
function matches(row:Row,filters:QueryStep[]):boolean{
 return filters.every(f=>{
  const [k,v]=f.args;
  if(f.op==='eq')return row[k]===v;
  if(f.op==='in')return Array.isArray(v)&&v.includes(row[k]);
  return Object.entries(k??{}).every(([field,value])=>row[field]===value);
 });
}
function clean(config:TableConfig,raw:unknown):Row{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('invalid_row');
 const row=raw as Row;
 for(const field of Object.keys(row)){
  if(!config.fields.includes(field)&&field!=='updated_at'&&field!=='created_at')fail('field_not_allowed');
 }
 if(Buffer.byteLength(JSON.stringify(row),'utf8')>config.maxBytes)fail('row_too_large',413);
 return row;
}

export type OverlayPlan={writes:{key:unknown;row:Row|null}[];result:{data:any;error:null;count:null}};

/** Traduz a gravação original (passos do construtor de consulta) em linhas. Pura. */
export function planOverlayMutation(table:string,profile:Profile,current:Row[],steps:QueryStep[],now:string):OverlayPlan{
 const config=OVERLAY_TABLES[table];
 if(!config)return fail('table_not_supported',501);
 if(!config.write(profile))fail('access_denied',403);
 if(!Array.isArray(steps)||steps.length<1||steps.length>12)fail('invalid_query');
 const [first,...rest]=steps;
 const op=first!.op as TableConfig['ops'][number];
 if(!config.ops.includes(op))fail('operation_not_supported',501);
 const filters=rest.filter(s=>FILTERS.has(s.op));
 if(rest.some(s=>!FILTERS.has(s.op)&&!SHAPE.has(s.op)))fail('invalid_query');
 const single=rest.some(s=>s.op==='single'||s.op==='maybeSingle');
 const writes:{key:unknown;row:Row|null}[]=[];
 const key=config.key;
 const find=(k:unknown)=>current.find(r=>JSON.stringify(r[key])===JSON.stringify(k));
 if(op==='insert'||op==='upsert'){
  const input=first!.args[0];
  const list=(Array.isArray(input)?input:[input]).map(r=>clean(config,r));
  if(list.length<1||list.length>50)fail('invalid_row');
  for(const raw of list){
   const fresh=config.create(raw,now);
   if(fresh[key]===undefined||fresh[key]===null||fresh[key]==='')fail('missing_key');
   const old=find(fresh[key]);
   if(op==='insert'&&old)fail('duplicate_key',409);
   writes.push({key:fresh[key],row:old&&op==='upsert'?{...old,...raw,updated_at:now}:fresh});
  }
 }else{
  if(filters.length===0)fail('filter_required');
  const targets=current.filter(r=>matches(r,filters));
  if(op==='update'){
   const patch=clean(config,first!.args[0]);
   if(key in patch&&targets.some(t=>JSON.stringify(t[key])!==JSON.stringify(patch[key])))fail('key_change_not_allowed');
   for(const t of targets)writes.push({key:t[key],row:{...t,...patch}});
  }else for(const t of targets)writes.push({key:t[key],row:null});
 }
 const after=mergeOverlay(current,writes,key);
 if(after.length>config.maxRows)fail('table_too_large',413);
 const changed=writes.map(w=>w.row).filter((r):r is Row=>r!==null);
 return {writes,result:{data:single?changed[0]??null:changed,error:null,count:null}};
}

/** Grava o plano em transação, com auditoria por linha. */
export async function commitOverlayPlan(db:any,snapshotId:string,table:string,actorUid:string,plan:OverlayPlan,now:string){
 if(plan.writes.length===0)return;
 const rows=collection(db,snapshotId,table);
 const audits=db.collection('campaignCloudRuntime').doc(snapshotId).collection('workspaceTableAudits');
 await db.runTransaction(async(tx:any)=>{
  const refs=plan.writes.map(w=>rows.doc(docId(table,w.key)));
  const before=await Promise.all(refs.map((r:any)=>tx.get(r)));
  plan.writes.forEach((w,i)=>{
   const prev=before[i];
   const version=(prev?.exists&&Number.isSafeInteger(prev.data()?.version)?prev.data().version:0)+1;
   tx.set(refs[i],{table,key:w.key,row:w.row,deleted:w.row===null,version,
    updatedBy:actorUid,updatedAt:now,sourceSnapshotId:snapshotId});
   tx.create(audits.doc(createHash('sha256').update(docId(table,w.key)+':'+version+':'+now).digest('hex')),
    {table,key:w.key,action:w.row===null?'delete':'write',version,actorUid,occurredAt:now});
  });
 });
 clearOverlayCache(db,snapshotId,table);
}
