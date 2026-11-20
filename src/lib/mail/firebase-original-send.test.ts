import {describe,expect,it} from 'vitest';
import {originalMailSend,originalMailBatch,originalMailReply,OriginalMailBridgeError} from './firebase-original-send';
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
 it('rejects multi-recipient in the single path and carries drafts, weeks, signatures and links',()=>{
  for(const changes of [{p_targets:['h:house-b','h:house-c']},{p_targets:[]}])
   expect(()=>originalMailSend(form(changes),dt)).toThrow('mail_feature_not_yet_available');
  expect(originalMailSend(form({p_draft:true,p_week:3,p_signed_by:' Um NPC ',
   p_court:'court-1',p_role:'executor',p_unit:'unit-1'}),dt)).toMatchObject({
   draft:true,deliveryRound:3,signedBy:'Um NPC',courtMemberId:'court-1',
   courtAssignment:'executor',unitId:'unit-1'});
  for(const changes of [{p_role:'executor'},{p_court:'court-1'},{p_court:'court-1',p_role:'chefe'},
   {p_week:0},{p_week:'3'},{p_draft:'sim'},{p_unit:'../u'}])
   expect(()=>originalMailSend(form(changes),dt)).toThrow('invalid_mail_request');
 });
 it('denies forged origin/destination and stale date instead of sending',()=>{
  expect(()=>originalMailSend(form(),'1522-01-02')).toThrow('campaign_date_changed');
  for(const changes of [{p_targets:['h:../private']},{p_targets:['p:some-user']},
    {p_key:'short'},{p_origin:'../other'},{p_content:''}])
    expect(()=>originalMailSend(form(changes),dt)).toThrow('invalid_mail_request');
  expect(()=>originalMailSend({...form(),other:'silent'},dt)).toThrow(OriginalMailBridgeError);
 });
});

describe('multi-target House routing is atomic',()=>{
 it('derives unique idempotency keys without changing original targets',()=>{
  const batch=originalMailBatch(form({p_targets:['h:house-a','h:house-b']}),'1522-01-01');
  expect(batch.map(x=>x.requestKey)).toEqual(['valid_mail_123_0','valid_mail_123_1']);
  expect(batch.map(x=>x.recipientHouseId)).toEqual(['house-a','house-b']);
  expect(batch.every(x=>x.expectedCampaignDate==='1522-01-01')).toBe(true);
 });
 it('rejects duplicates, narrator mixed targets and unsupported feature flags',()=>{
  for(const targets of [
   ['h:house-a','h:house-a'],['h:house-a','narrator'],['narrator','h:house-b'],
  ])expect(()=>originalMailBatch(form({p_targets:targets}),dt)).toThrow();
  expect(originalMailBatch(form({p_targets:['h:house-a','h:house-b'],p_draft:true}),dt)
    .every(x=>x.draft===true)).toBe(true);
  expect(()=>originalMailBatch(form({p_targets:['h:house-a','h:house-b'],p_key:undefined}),dt))
    .toThrow('invalid_mail_request');
  expect(()=>originalMailBatch(form({p_targets:['h:house-a','h:house-b'],p_key:'x'.repeat(126)}),dt))
    .toThrow('invalid_mail_request');
 });
});

describe('historically faithful Cloud reply routing',()=>{
 it('translates a reply to an approved Cloud letter, preserving its date',()=>{
  const id='a'.repeat(64);
  const reply={p_action:'reply_weekly_message',p_date:dt,p_args:{
   p_letter:id,p_reply:null,p_content:'Retorno',p_key:'reply-key-1234',
   p_draft:false,p_signed_by:null,
  }};
  expect(originalMailReply(reply,dt)).toEqual({
   letterId:id,requestKey:'reply-key-1234',
   content:'Retorno',expectedCampaignDate:dt,
  });
  expect(()=>originalMailReply(reply,'1522-01-02')).toThrow('campaign_date_changed');
  expect(originalMailReply({...reply,p_args:{...reply.p_args,p_letter:'legacy-letter-001',p_reply:'legacy-reply-001'}},dt))
   .toMatchObject({letterId:'legacy-letter-001',replyId:'legacy-reply-001',
    content:'Retorno',expectedCampaignDate:dt});
  expect(()=>originalMailReply({...reply,p_args:{...reply.p_args,p_reply:'../other'}},dt))
   .toThrow('invalid_mail_request');
  expect(originalMailReply({...reply,p_args:{...reply.p_args,p_draft:true,p_signed_by:'Vetrus'}},dt))
   .toMatchObject({draft:true,signedBy:'Vetrus'});
 });
});
