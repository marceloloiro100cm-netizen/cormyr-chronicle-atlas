import {describe,it,expect,vi,beforeEach} from 'vitest';

const f=vi.hoisted(()=>({
 requested:[] as string[],
 failMail:false,
 tables:{
  campaign_houses:[{id:'h',name:'Casa',active:true,season:2}],
  campaign_players:[{id:'p',user_id:'u',active:true}],
  house_memberships:[{house_id:'h',player_id:'p',can_edit:true}],
  campaign_records:[{id:'r',house_id:'h',content:'Registro'}],
  house_catalog:[],
  campaign_access_profiles:[],
  campaign_letters:[],
  letter_receipts:[],
  letter_replies:[],
  letter_rounds:[],
 } as Record<string,any[]>,
}));
vi.mock('@/lib/auth/campaign-access-scope',()=>({
 loadCampaignAccessScope:async()=>({userId:'u',admin:false}),
 assertUnchangedAccessScope:()=>{},
}));
vi.mock('@/lib/firebase-workspace/state',()=>({
 firebaseWorkspaceClient:()=>({}),
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},
  rpc:async(name:string)=>name==='is_campaign_admin'
   ?{data:false,error:null}:{data:null,error:{message:'unsupported'}},
  from:(table:string)=>{
   const builder:any={
    select:()=>builder,order:()=>builder,eq:()=>builder,
    range:async()=>{f.requested.push(table);
     if(f.failMail&&table==='campaign_letters')return {data:null,error:{message:'mail unavailable'}};
     return {data:f.tables[table]??[],error:null};
    },
    then:(resolve:any,reject:any)=>{
     f.requested.push(table);
     return Promise.resolve({data:f.tables[table]??[],error:null}).then(resolve,reject);
    },
   };
   return builder;
  },
 },
}));

import {loadPanel,loadFirebasePanelMail} from './panel-data';
beforeEach(()=>{f.requested=[];f.failMail=false;});
describe('Firebase Council bootstrap',()=>{
 it('loads Houses and records without reading the mailbox',async()=>{
  const result=await loadPanel();
  expect(result.user.id).toBe('u');
  expect(result.houses).toHaveLength(1);
  expect(result.records).toHaveLength(1);
  expect(result.letters).toEqual([]);
  expect(f.requested).not.toContain('campaign_letters');
  expect(f.requested).not.toContain('letter_replies');
 });
 it('keeps the Council available when a mailbox page is unavailable',async()=>{
  f.failMail=true;
  const panel=await loadPanel();
  expect(panel.houses[0]?.id).toBe('h');
  await expect(loadFirebasePanelMail()).rejects.toMatchObject({message:'mail unavailable'});
  expect(f.requested).toContain('campaign_letters');
 });
});
