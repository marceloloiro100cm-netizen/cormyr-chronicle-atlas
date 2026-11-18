import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';

const id='a'.repeat(64);
const approved=()=>({
  live:{status:'active',private:true,sourceSnapshotId:id,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    mailWriteApproved:true,openRound:3,calendarVersion:5},
  mail:{status:'active',private:true,sourceSnapshotId:id,
    sourceLiveReconciled:true,applicationEnabled:true,
    mailEnabled:true,openRound:3,calendarVersion:5},
  calendar:{version:5,year:1522,month:1,day:10},
  snapshotId:id,
});

test('explicit dual runtime and current calendar agreement authorizes mail',()=>{
  const f=approved();
  assert.equal(cloudMailRuntimeApproved(f.live,f.mail,f.calendar,id),true);
});

test('every independent gate fails closed without leaking configuration',()=>{
  const checks=[
    ['live','status','pending'],['live','private',false],
    ['live','sourceSnapshotReconciled',false],
    ['live','mailWriteApproved',false],
    ['live','applicationEnabled',false],
    ['live','sourceSnapshotId','b'.repeat(64)],
    ['live','openRound',4],['live','openRound',0],
    ['live','calendarVersion',4],
    ['mail','status','pending'],['mail','private',false],
    ['mail','sourceLiveReconciled',false],
    ['mail','mailEnabled',false],['mail','applicationEnabled',false],
    ['mail','sourceSnapshotId','b'.repeat(64)],
    ['mail','openRound',4],['mail','calendarVersion',4],
    ['calendar','version',6],['calendar','version',0],
  ];
  for(const [section,key,bad] of checks){
    const f=approved();
    f[section][key]=bad;
    assert.equal(cloudMailRuntimeApproved(f.live,f.mail,f.calendar,id),
      false,section+'.'+key);
  }
  for(const missing of ['live','mail','calendar']){
    const f=approved();
    f[missing]=null;
    assert.equal(cloudMailRuntimeApproved(f.live,f.mail,f.calendar,id),false);
  }
  const f=approved();
  assert.equal(cloudMailRuntimeApproved(f.live,f.mail,f.calendar,
    'b'.repeat(64)),false);
});
