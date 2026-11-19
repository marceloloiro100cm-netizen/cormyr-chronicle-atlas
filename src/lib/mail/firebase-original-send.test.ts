import {describe,expect,it} from 'vitest';
import {originalMailSend,OriginalMailBridgeError} from './firebase-original-send';
const dt='1522-01-01';
const form=(changes:Record<string,unknown>={})=>({
 p_action:'send_linked_mail',p_date:dt,p_args:{
  p_key:'valid_mail_123',p_origin:'house-a',p_targets:['h:house-b'],
  p_subject:'Mensagem',p_content:'Texto real',p_draft:false,
  p_court:null,p_unit:null,p_role:null,p_week:null,p_signed_by:null,
  ...changes,
 },
});
describe('original composer -> one atomic Firebase Cloud delivery',()=>{
 it('translates exactly one House or Narrator target with an expected game date',()=>{
  expect(originalMailSend(form(),dt)).toEqual({
   requestKey:'valid_mail_123',originHouseId:'house-a',
   recipientKind:'house',recipientHouseId:'house-b',
   subject:'Mensagem',content:'Texto real',
   expectedCampaignDate:dt,
  });
  expect(originalMailSend(form({p_targets:['narrator']}),dt)).toMatchObject({
   recipientKind:'narrator',recipientHouseId:null,
  });
 });
 it('rejects unsupported multi-recipient and unsaved linked features',()=>{
  for(const changes of [
   {p_targets:['h:house-b','h:house-c']},{p_targets:[]},
   {p_draft:true},{p_week:3},{p_court:'court-1'},
   {p_unit:'unit-1'},{p_role:'executor'},{p_signed_by:'Um NPC'},
  ])expect(()=>originalMailSend(form(changes),dt)).toThrow('mail_feature_not_yet_available');
 });
 it('denies forged origin/destination and stale date instead of sending',()=>{
  expect(()=>originalMailSend(form(),'1522-01-02')).toThrow('campaign_date_changed');
  for(const changes of [{p_targets:['h:../private']},{p_targets:['p:some-user']},
    {p_key:'short'},{p_origin:'../other'},{p_content:''}])
    expect(()=>originalMailSend(form(changes),dt)).toThrow('invalid_mail_request');
  expect(()=>originalMailSend({...form(),other:'silent'},dt)).toThrow(OriginalMailBridgeError);
 });
});
