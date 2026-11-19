import {describe,expect,it} from 'vitest';
import {projectCloudLetters} from './firebase-operational-mail';
const snapshot='a'.repeat(64);
const mk=(id:string,changes:Record<string,unknown>={})=>({
 id,data:()=>({
  id,source:'firebase-cloud',sourceSnapshotId:snapshot,
  senderUid:'author',senderPlayerId:'player',senderName:'Mensageiro',
  originHouseId:'house-a',recipientKind:'house',
  recipientHouseId:'house-b',recipientPlayerId:null,
  subject:'Envio oficial',content:'Mensagem íntegra',
  createdAt:'2026-11-19T14:00:00.000Z',
  deliveredAt:'2026-11-19T14:00:00.000Z',
  campaignDate:'1522-01-01',creationRound:2,deliveryRound:2,
  deletedAt:null,publicationState:'delivered',...changes,
 }),
});
describe('Approved operational letters preserve original Council filters',()=>{
 it('maps an authentic Firebase letter, including narrator and reply routing',()=>{
  const id='b'.repeat(64),reply='c'.repeat(64);
  const letters=projectCloudLetters([
   mk(id),mk(reply,{replyToId:id,recipientKind:'narrator',
    recipientHouseId:null,originHouseId:'house-b'}),
  ],snapshot);
  expect(letters).toHaveLength(2);
  expect(letters[0]).toMatchObject({id,sender_user_id:'author',
   recipient_house_id:'house-b',origin_house_id:'house-a',
   delivery_week:2,publication_state:'delivered'});
  expect(letters[1]).toMatchObject({conversation_id:id,
   recipient_house_id:null,origin_house_id:'house-b'});
  expect(JSON.stringify(letters)).not.toContain('sourceSnapshotId');
 });
 it('fails closed for foreign snapshots, malformed source, invalid recipient and duplicated IDs',()=>{
  const id='d'.repeat(64);
  for(const change of [
   {sourceSnapshotId:'c'.repeat(64)},{source:'imported'},
   {recipientKind:'house',recipientHouseId:null},
   {recipientKind:'narrator',recipientHouseId:null,originHouseId:null},
   {senderUid:'../private'}, {publicationState:'draft'},
   {deletedAt:'2026-11-19T14:00:00Z'}, {replyToId:'bad'},
  ])expect(()=>projectCloudLetters([mk(id,change)],snapshot)).toThrow('firebase_operational_mail_integrity_failed');
  expect(()=>projectCloudLetters([mk(id),mk(id)],snapshot)).toThrow();
 });
});
