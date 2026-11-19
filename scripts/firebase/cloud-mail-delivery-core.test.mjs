import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveCloudMail,deliveryOptions,deliveryPlan} from './cloud-mail-delivery-core.mjs';
const deny=()=>{throw Error('bad');};
test('scheduled letters are delivered only when the open round reaches them',()=>{
  const v={publicationState:'scheduled',deliveryRound:4,createdAt:'2026-11-19T10:00:00Z',deliveredAt:null};
  assert.equal(effectiveCloudMail(v,3).publicationState,'scheduled');
  const d=effectiveCloudMail(v,4);
  assert.equal(d.publicationState,'delivered');assert.equal(d.deliveredAt,'2026-11-19T10:00:00Z');
  assert.equal(effectiveCloudMail({publicationState:'draft',deliveryRound:2},9).publicationState,'draft');
});
test('delivery plan: drafts, open round, bounded schedule and no past rounds',()=>{
  assert.deepEqual(deliveryPlan('jogador',{},3),{state:'delivered',deliveryRound:3});
  assert.deepEqual(deliveryPlan('jogador',{draft:true},3),{state:'draft',deliveryRound:null});
  assert.deepEqual(deliveryPlan('jogador',{deliveryRound:4},3),{state:'scheduled',deliveryRound:4});
  assert.equal(deliveryPlan('jogador',{deliveryRound:5},3).error,'invalid_delivery_round');
  assert.deepEqual(deliveryPlan('narrador',{deliveryRound:11},3),{state:'scheduled',deliveryRound:11});
  assert.equal(deliveryPlan('narrador',{deliveryRound:2},3).error,'invalid_delivery_round');
});
test('options keep plain sends unchanged and reject malformed links or signatures',()=>{
  assert.deepEqual(deliveryOptions({draft:false,deliveryRound:null,signedBy:null},deny),{});
  assert.deepEqual(deliveryOptions({courtMemberId:'c1',courtAssignment:'executor',unitId:'u1',signedBy:' Vetrus '},deny),
    {courtMemberId:'c1',courtAssignment:'executor',unitId:'u1',signedBy:'Vetrus'});
  for(const bad of [{draft:'yes'},{deliveryRound:0},{signedBy:''},{signedBy:'x'.repeat(121)},
    {courtMemberId:'c1'},{courtAssignment:'executor'},{unitId:'../x'}])
    assert.throws(()=>deliveryOptions(bad,deny),/bad/);
});
