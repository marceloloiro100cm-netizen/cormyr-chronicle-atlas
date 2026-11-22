import {describe,it,expect} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {readApprovedPublicCalendarEvents} from './firebase-public-events.server';

const SNAP='f'.repeat(64);
const root='campaignCloudRuntime/'+SNAP;
const documents:Record<string,unknown>={
 ['migrationDomainStage/'+SNAP]:{status:'complete',private:true},
 ['migrationTimeEngineStage/'+SNAP]:{status:'complete',private:true},
 [root]:{
  status:'active',private:true,sourceSnapshotId:SNAP,sourceSnapshotReconciled:true,
  applicationEnabled:true,publicTimeApproved:true,
  calendarVersion:3,publishedTimeVersion:3,
 },
};
const published=(id:string,date:string,title:string,publicFlag?:boolean)=>({
 id,version:2,published:{date,title,description:'Evento aprovado',scope:'kingdom',
  ...(publicFlag!==undefined?{public:publicFlag}:{})},
 draft:null,
});
const rows={
 [root+'/scheduleEvents']:[
  published('public-001','1522-11-05','Conselho aberto',true),
  published('private-001','1522-11-05','Segredo de uma Casa'),
  published('private-002','1522-11-06','Evento restrito',false),
  {id:'draft-001',version:1,published:null,draft:{
    date:'1522-11-05',title:'Evento em rascunho',public:true}},
  published('other-year','1521-11-05','Outro ano',true),
  {id:'public-region-01',version:2,published:{date:'1522-11-08',
   title:'Conselho de Dragon Coast',scope:'region',region:'1',public:true}},
 ],
 [root+'/festivals']:[
  {id:'public-festival',public:true,deleted:false,name:'Festival das águas',
   scope:'kingdom',region:null,date:{year:1510,month:10,day:15,festival:null},
   repeat:'yearly',durationDays:1,description:'Festa pública'},
  {id:'private-festival',name:'Celebração secreta',deleted:false,
   scope:'kingdom',region:null,date:{year:1510,month:10,day:15,festival:null},
   repeat:'yearly',durationDays:1},
 ],
};
function database(overrides:Record<string,unknown>={}):Firestore{
 const docs={...documents,...overrides};
 const collection=(path:string):any=>({
   doc:(id:string)=>({
    get:async()=>({exists:docs[path+'/'+id]!=null,
     data:()=>docs[path+'/'+id]}),
    collection:(sub:string)=>collection(path+'/'+id+'/'+sub),
   }),
   limit:(max:number)=>({get:async()=>{
    const list=(rows as Record<string,unknown[]>)[path]??[];
    const found=list.slice(0,max);
    return {size:found.length,docs:found.map(data=>({data:()=>data}))};
   }}),
 });
 return {collection} as unknown as Firestore;
}
const options=(db:Firestore)=>({db,snapshotId:SNAP,year:1522,projectId:'cormyr',
 enabled:true,env:{}});
describe('projeção pública de eventos do calendário',()=>{
 it('retorna apenas eventos publicados com opt-in, jamais rascunho ou carta',async()=>{
  const result=await readApprovedPublicCalendarEvents(options(database()));
  expect(result.year).toBe(1522);
  expect(result.events.map(x=>x.title)).toEqual([
   'Conselho aberto','Conselho de Dragon Coast','Festival · Festival das águas',
  ]);
  expect(result.events.some(x=>x.scope==='region'&&x.region==='1')).toBe(true);
  const text=JSON.stringify(result);
  for(const forbidden of ['Segredo','restrito','rascunho','Outro ano','secreta'])
    expect(text).not.toContain(forbidden);
 });
 it('falha fechado sem origem íntegra, autorização pública ou versão oficial',async()=>{
  for(const patch of [
   {[root]:{...documents[root] as object,publicTimeApproved:false}},
   {[root]:{...documents[root] as object,publishedTimeVersion:2}},
   {['migrationDomainStage/'+SNAP]:null},
   {['migrationTimeEngineStage/'+SNAP]:null},
  ]){
   await expect(readApprovedPublicCalendarEvents(options(database(patch))))
    .rejects.toThrow('public_calendar_unavailable');
  }
 });
 it('não consulta Cloud sem ambiente válido',async()=>{
  await expect(readApprovedPublicCalendarEvents({...options(database()),enabled:false}))
   .rejects.toThrow('public_calendar_unavailable');
  await expect(readApprovedPublicCalendarEvents({...options(database()),year:10000}))
   .rejects.toThrow('public_calendar_unavailable');
 });
});
