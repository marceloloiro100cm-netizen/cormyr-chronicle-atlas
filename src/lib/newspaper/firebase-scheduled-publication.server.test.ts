import {describe,it,expect} from 'vitest';
import {releaseDueNewspapers} from './firebase-scheduled-publication.server';

const snapshot='a'.repeat(64);
const idA='cloud-'+'b'.repeat(64),idB='cloud-'+'c'.repeat(64);
const runtime='campaignCloudRuntime/'+snapshot;
const issue=(id:string,editionNo:number,blocks?:any[])=>({
 id,editionNo,source:'firebase-cloud',sourceSnapshotId:snapshot,
 state:'draft',publishOn:'1522-01-12',title:'A Folha Sem Selo',
 subtitle:'Notícias do Reino',template:'classico',font_style:'classico',
 version:2,publishedAt:null,createdBy:'editor-uid',campaignDate:'1522-01-01',
 blocks:blocks??[{id:'head'+editionNo,type:'headline',text:'Notícia confirmada',span:12,height:150}],
});

function fixture(options:{two?:boolean;weekly?:boolean;incomplete?:boolean}={}){
 const docs=new Map<string,any>();
 const root={
  status:'active',private:true,sourceSnapshotId:snapshot,
  sourceSnapshotReconciled:true,applicationEnabled:true,
  newspaperWriteApproved:true,openRound:3,
  newspaperOneEditionPerWeek:options.weekly??true,
  newspaperLastPublishedRound:2,
 };
 const stagePath='migrationNewspaperRuntimeStage/'+snapshot;
 docs.set(runtime,root);
 docs.set(stagePath,{status:'complete',private:true});
 docs.set('migrationTimeEngineStage/'+snapshot+'/calendar/current',{
  year:1522,month:0,day:12,festival:null,version:3,
 });
 docs.set(runtime+'/publishedNewspapers/'+idA,issue(idA,3,options.incomplete?
  [{id:'blank',type:'image',text:'',span:12,height:200}]:undefined));
 if(options.two)docs.set(runtime+'/publishedNewspapers/'+idB,issue(idB,4));
 const ref=(path:string):any=>({
  path,collection:(part:string)=>ref(path+'/'+part),
  doc:(id:string)=>ref(path+'/'+id),
  where:(field:string,_op:string,value:unknown)=>({
   limit:(n:number)=>({get:async()=>({
    docs:[...docs.entries()].filter(([key,row])=>
     key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&
     row?.[field]===value).slice(0,n)
     .map(([key,row])=>({id:key.slice(path.length+1),data:()=>structuredClone(row)})),
   })}),
  }),
  get:async()=>({exists:docs.has(path),data:()=>structuredClone(docs.get(path))}),
 });
 const db={
  collection:(name:string)=>ref(name),
  runTransaction:async<T,>(callback:(tx:any)=>Promise<T>):Promise<T>=>{
   const writes:{op:'create'|'update';path:string;row:any}[]=[];
   const tx={
    get:(target:any)=>target.get(),
    update:(target:any,row:any)=>writes.push({op:'update',path:target.path,row}),
    create:(target:any,row:any)=>writes.push({op:'create',path:target.path,row}),
   };
   const result=await callback(tx);
   for(const write of writes){
    if(write.op==='create'&&docs.has(write.path))throw Error('duplicate');
    docs.set(write.path,write.op==='create'?structuredClone(write.row):
     {...docs.get(write.path),...structuredClone(write.row)});
   }
   return result;
  },
 };
 return {db,docs,root,stagePath};
}

describe('Jornal: publicação agendada exclusivamente pelo HUB',()=>{
 it('publica somente quando a data oficial chega, com auditoria e sem mutar o acervo',async()=>{
  const f=fixture(),archived=structuredClone(f.docs.get(f.stagePath));
  const first=await releaseDueNewspapers(f.db,snapshot);
  expect(first).toBe(1);
  expect(f.docs.get(runtime+'/publishedNewspapers/'+idA)).toMatchObject({
   state:'published',publishOn:null,version:3,publishedRound:3,
  });
  expect(f.docs.get(runtime).newspaperLastPublishedRound).toBe(3);
  const audit=[...f.docs.keys()].filter(p=>p.includes('/newspaperAudits/scheduled-'));
  expect(audit).toHaveLength(1);
  expect(f.docs.get(f.stagePath)).toEqual(archived);
  expect(await releaseDueNewspapers(f.db,snapshot)).toBe(0);
  expect([...f.docs.keys()].filter(p=>p.includes('/newspaperAudits/scheduled-'))).toHaveLength(1);
 });
 it('respeita o limite de uma edição por semana, inclusive entre candidatos do mesmo lote',async()=>{
  const f=fixture({two:true});
  expect(await releaseDueNewspapers(f.db,snapshot)).toBe(1);
  expect(f.docs.get(runtime+'/publishedNewspapers/'+idA).state).toBe('published');
  expect(f.docs.get(runtime+'/publishedNewspapers/'+idB).state).toBe('draft');
  expect(await releaseDueNewspapers(f.db,snapshot)).toBe(0);
 });
 it('rascunho sem imagem não pode ser publicado automaticamente',async()=>{
  const f=fixture({incomplete:true});
  expect(await releaseDueNewspapers(f.db,snapshot)).toBe(0);
  expect(f.docs.get(runtime+'/publishedNewspapers/'+idA).state).toBe('draft');
  expect([...f.docs.keys()].filter(p=>p.includes('/newspaperAudits/scheduled-'))).toHaveLength(0);
 });
 it('não atua sem aprovação de publicação do Firebase',async()=>{
  const f=fixture();f.docs.set(runtime,{...f.root,newspaperWriteApproved:false});
  expect(await releaseDueNewspapers(f.db,snapshot)).toBe(0);
  expect(f.docs.get(runtime+'/publishedNewspapers/'+idA).state).toBe('draft');
 });
});
