import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {REGIONS} from '@/lib/house/regions';

const {rpcCalls,rows}=vi.hoisted(()=>{
 const regions=['Crownlands','Veilstone','Shieldmark','Helmlands','Horselands',
  'Dragon Coast','Swordmarch','Ferlin','Stonelands','Elfhold','Volkumburgh'];
 return {
  rpcCalls:[] as string[],
  rows:Array.from({length:172},(_,i)=>({
   id:'casa-'+i,name:'Casa '+i,region:regions[i%11]!,
  })),
 };
});
vi.mock('@/integrations/supabase/client',()=>{
 // An unbound rpc() loses "this" and MUST fail, just like SupabaseClient.rpc.
 const mockClient={
  auth:{getSession:vi.fn(async()=>({
   data:{session:{access_token:'signed-in-test-session'}},error:null,
  }))},
  rest:{ready:true},
  rpc(this:{rest:{ready:boolean}},name:string){
   if(!this?.rest?.ready)throw new Error('Lost SupabaseClient receiver');
   rpcCalls.push(name);
   if(name==='spy_public_noble_targets')return Promise.resolve({data:rows,error:null});
   if(name==='spy_player_mission_preview')return Promise.resolve({
    data:{
     houseId:'ashkar',
     agentId:'0f65d8bc-3f30-4538-8398-6d4f52e5631f',
     targetHouseId:'casa-0',houseName:'Casa 0',targetRegionId:'crownlands',
     houseDefense:12,agentRank:'Verde',agentCunning:3,
     source:'official_spreadsheet',provisional:true,
    },error:null,
   });
   return Promise.resolve({data:null,error:{message:'Unknown RPC'}});
  },
  from(name:string){
   if(name!=='spy_agent_upgrades')throw new Error('Unexpected table');
   const query={
    select:()=>query,
    eq:()=>query,
    then(resolve:(value:unknown)=>void){resolve({data:[],error:null});},
   };
   return query;
  },
 };
 return {supabase:mockClient};
});

import {readSpyNobleHouseTargetsBrowser,readSpyMissionOddsBrowser}
 from '@/lib/espionage/spy-target-browser';

describe('Espionagem · consulta autenticada do catálogo oficial',()=>{
 it('carrega as 172 casas por RPC com receptor Supabase preservado e região normalizada',async()=>{
  const targets=await readSpyNobleHouseTargetsBrowser();
  expect(targets).toHaveLength(172);
  expect(Object.keys(REGIONS)).toHaveLength(11);
  expect(new Set(targets.map(x=>x.regionId)).size).toBe(11);
  expect(targets[5]).toMatchObject({id:'casa-5',regionId:'dragoncoast'});
  expect(targets[6]).toMatchObject({id:'casa-6',regionId:'swordmark'});
  expect(rpcCalls).toContain('spy_public_noble_targets');
 });
 it('consulta a chance para somente uma Casa pela mesma chamada autenticada',async()=>{
  const odds=await readSpyMissionOddsBrowser({
   houseId:'ashkar',
   agentId:'0f65d8bc-3f30-4538-8398-6d4f52e5631f',
   targetHouseId:'casa-0',
  });
  expect(odds.targetHouseId).toBe('casa-0');
  expect(odds.successPercent).toBe(37.5);
  expect(odds.targetRegionId).toBe('crownlands');
  expect(rpcCalls).toContain('spy_player_mission_preview');
 });
 it('não extrai o método rpc do SupabaseClient sem associá-lo ao objeto',()=>{
  const src=readFileSync('src/lib/espionage/spy-target-browser.ts','utf8');
  expect(src).toContain('await browserDb.rpc(');
  expect(src).not.toContain('const rpc=supabase.rpc');
  expect(src).not.toMatch(/await rpc\(/);
 });
});
