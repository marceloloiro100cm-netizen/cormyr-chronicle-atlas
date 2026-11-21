import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readSpyOverlay,SPY_OVERLAY_COLLECTIONS} from '../../scripts/firebase/workspace-spy-overlay.mjs';

const snap='a'.repeat(64);
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
function fakeDb(meta:Record<string,unknown>,docs:Record<string,any[]>={}){
 const calls={collections:0};
 const root={
  get:async()=>({exists:true,data:()=>meta}),
  collection:(name:string)=>({limit:()=>({get:async()=>{
   calls.collections++;
   return {docs:(docs[name]??[]).map(d=>({id:d.id,data:()=>d.data}))};
  }})}),
 };
 return {calls,db:{collection:()=>({doc:()=>root})}};
}
const active={status:'active',private:true,sourceSnapshotId:snap,
 sourceSnapshotReconciled:true,applicationEnabled:true};

describe('Espionagem: leitura com aprovação pendente',()=>{
 it('overlay vazio projeta o acervo (sem 503) e lê as coleções em paralelo, uma vez por lote',async()=>{
  const {db,calls}=fakeDb({...active,spyReadApproved:false});
  const [a,b]=await Promise.all([readSpyOverlay(db,snap),readSpyOverlay(db,snap)]);
  expect(a).toBe(b);
  expect(Object.keys(a).sort()).toEqual(Object.keys(SPY_OVERLAY_COLLECTIONS).sort());
  expect(Object.values(a).every((l:any)=>Array.isArray(l)&&l.length===0)).toBe(true);
  expect(calls.collections).toBe(Object.keys(SPY_OVERLAY_COLLECTIONS).length);
 });
 it('com ação operacional real e leitura não aprovada, continua bloqueado',async()=>{
  const payload={id:'agente',ownerHouseId:'h1',codename:'X',version:1};
  const {db}=fakeDb({...active,spyReadApproved:false},{spyAgents:[{
   id:hash('agent:agente'),data:{key:'agente',sourceSnapshotId:snap,payload}}]});
  await expect(readSpyOverlay(db,snap)).rejects.toThrow('spy_overlay_not_approved');
 });
 it('runtime inativo continua bloqueado; aprovado devolve os documentos',async()=>{
  await expect(readSpyOverlay(fakeDb({...active,applicationEnabled:false}).db,snap))
   .rejects.toThrow('spy_overlay_not_approved');
  const payload={id:'agente',ownerHouseId:'h1',codename:'X',version:1};
  const {db}=fakeDb({...active,spyReadApproved:true},{spyAgents:[{
   id:hash('agent:agente'),data:{key:'agente',sourceSnapshotId:snap,payload}}]});
  expect((await readSpyOverlay(db,snap)).spyAgents).toEqual([payload]);
 });
});

const session=vi.hoisted(()=>({uid:'a'}));
vi.mock('../lib/auth/firebase-pilot-session',()=>({firebasePilotAuth:()=>({
 current:()=>({uid:session.uid}),getToken:async()=>'token'})}));
import {workspaceRequest,invalidateWorkspaceReads,isCacheableWorkspaceRead} from '../lib/firebase-workspace/client';

describe('Cache curto de leituras no navegador',()=>{
 beforeEach(()=>{
  invalidateWorkspaceReads();session.uid='a';
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>({ok:true,json:async()=>({result:{n:1,list:[1]}})})));
 });
 it('classifica só leituras conhecidas',()=>{
  expect(isCacheableWorkspaceRead({kind:'house',houseId:'h'})).toBe(true);
  expect(isCacheableWorkspaceRead({kind:'query',table:'t',steps:[{op:'select',args:['*']}]})).toBe(true);
  expect(isCacheableWorkspaceRead({kind:'query',table:'t',steps:[{op:'update',args:[{}]}]})).toBe(false);
  expect(isCacheableWorkspaceRead({kind:'rpc',name:'spy_house_management'})).toBe(true);
  expect(isCacheableWorkspaceRead({kind:'rpc',name:'spy_rename_agent'})).toBe(false);
 });
 it('repete a ficha sem ir ao servidor e entrega cópias independentes',async()=>{
  const first=await workspaceRequest({kind:'house',houseId:'ashkar'});
  first.list.push(2);
  const second=await workspaceRequest({kind:'house',houseId:'ashkar'});
  expect(second).toEqual({n:1,list:[1]});
  expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('qualquer gravação descarta o cache; outra conta não reaproveita',async()=>{
  await workspaceRequest({kind:'house',houseId:'ashkar'});
  await workspaceRequest({kind:'rpc',name:'spy_rename_agent',args:{}});
  await workspaceRequest({kind:'house',houseId:'ashkar'});
  expect(fetch).toHaveBeenCalledTimes(3);
  session.uid='b';
  await workspaceRequest({kind:'house',houseId:'ashkar'});
  expect(fetch).toHaveBeenCalledTimes(4);
 });
 it('erros nunca ficam guardados',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:503,json:async()=>({})} as Response);
  await expect(workspaceRequest({kind:'house',houseId:'ashkar'})).rejects.toThrow();
  expect(await workspaceRequest({kind:'house',houseId:'ashkar'})).toEqual({n:1,list:[1]});
  expect(fetch).toHaveBeenCalledTimes(2);
 });
});

describe('Infraestrutura: instância aquecida',()=>{
 it('mantém uma instância mínima e memória para o acervo em cache',()=>{
  const yaml=readFileSync('apphosting.yaml','utf8');
  expect(yaml).toMatch(/minInstances: 1/);
  expect(yaml).toMatch(/memoryMiB: 1024/);
 });
});
