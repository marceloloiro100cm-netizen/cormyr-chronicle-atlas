import { describe, it, expect, vi } from 'vitest';
import { buildHouseExport, exportHouseVersion, houseExportHash, houseExportName, type HouseExportAdapter } from '@/lib/house/drive-export';
import { newHouseState } from '@/lib/house/types';
import { createHouseExportAdapter } from '@/lib/house/drive-adapter.server';
const document = (v=1) => { const s=newHouseState('ashkar');s.base.defense=50;s.holdings=[{id:'castle',itemId:'castle',name:'Castelo',domainId:'domain',costs:[{resource:'defense',amount:40,mode:'allocation'}],effects:[],ruleVersion:'1',source:'Livro',status:'active'}];return buildHouseExport('ashkar',v,'2026-10-24',s,[]); };
describe('exportação da casa preserva compras',()=>{
 it('exporta total 50 e alocação 40 intactos sem notas extras do Narrador',()=>{
  const s=newHouseState('ashkar');Object.assign(s,{secret_state:{secret:'private'}});
  const d=document();expect(d.state['base']).toMatchObject({defense:50});expect(d.state['holdings']).toMatchObject([{costs:[{resource:'defense',amount:40,mode:'allocation'}]}]);
  expect(buildHouseExport('ashkar',1,'date',s,[]).state).not.toHaveProperty('secret_state');
  expect(houseExportName('ashkar')).toBe('cormyr-house-ashkar.json');
 });
 it('não escreve novamente a mesma versão',async()=>{
  const d=document(),write=vi.fn();const a:HouseExportAdapter={read:async()=>({document:d,etag:'provider'}),write};
  await exportHouseVersion(a,'technical',d,{fileId:'stable',hash:await houseExportHash(d),version:1});expect(write).not.toHaveBeenCalled();
 });
 it('bloqueia alteração externa sem substituir a ficha local',async()=>{
  const before=document(),local=document(2),remote=document();remote.state['treasury']=90;
  const original=JSON.stringify(local),write=vi.fn();const a:HouseExportAdapter={read:async()=>({document:remote,etag:'provider'}),write};
  await expect(exportHouseVersion(a,'technical',local,{fileId:'stable',hash:await houseExportHash(before),version:1})).rejects.toThrow('Arquivo alterado no Drive');expect(write).not.toHaveBeenCalled();expect(JSON.stringify(local)).toBe(original);
 });
 it('usa ETag real para manter arquivo estável e confere retorno',async()=>{
  const previous=document(),next=document(2);const write=vi.fn(async()=>({fileId:'stable',document:next,etag:'new'}));
  const a:HouseExportAdapter={read:async()=>({document:previous,etag:'real'}),write};
  await exportHouseVersion(a,'technical',next,{fileId:'stable',hash:await houseExportHash(previous),version:1});expect(write).toHaveBeenCalledWith('technical',next,'stable','real');
 });
 it('nunca autoriza sobrescrita com hash sintético; usa versão imutável',async()=>{
  vi.stubEnv('GOOGLE_DRIVE_API_KEY','test');vi.stubEnv('LOVABLE_API_KEY','test');
  const d=document(2);const calls:{path:string;method:string;body:string}[]=[];
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);calls.push({path,method:init?.method??'GET',body:typeof init?.body==='string'?init.body:''});
   if(path.includes('generateIds'))return Response.json({ids:['versionid']});
   if(init?.method==='POST')return Response.json({id:'versionid'});
   if(path.includes('alt=media'))return Response.json(d);
   if(path.includes('/files/versionid?fields'))return Response.json({parents:['technical'],mimeType:'application/json'});
   return Response.json({files:[]});
  });
  try {await createHouseExportAdapter(request).write('technical',d,'stable','sha256:fake');expect(calls.some(c=>c.method==='PATCH')).toBe(false);expect(calls.find(c=>c.method==='POST')?.body).toContain('cormyr-house-ashkar-v2-');}finally{vi.unstubAllEnvs();}
 });
 it('bloqueia arquivo fora da pasta técnica autorizada',async()=>{
  vi.stubEnv('GOOGLE_DRIVE_API_KEY','test');vi.stubEnv('LOVABLE_API_KEY','test');
  try {const a=createHouseExportAdapter(async()=>Response.json({parents:['other'],mimeType:'application/json'}));await expect(a.read('file','technical')).rejects.toThrow('fora da pasta');}finally{vi.unstubAllEnvs();}
 });
});