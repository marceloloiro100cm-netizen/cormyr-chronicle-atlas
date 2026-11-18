import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';
const archived={year:1522,month:0,day:1,festival:null,version:4};
const live={calendarSource:'operational',status:'active',private:true,sourceSnapshotId:'s',
 sourceSnapshotReconciled:true,applicationEnabled:true,mailWriteApproved:true,
 openRound:3,calendarVersion:5,calendar:{...archived,day:11,version:5}};
const mail={status:'active',private:true,sourceSnapshotId:'s',sourceLiveReconciled:true,
 applicationEnabled:true,mailEnabled:true,openRound:3,calendarVersion:5};
test('operational date and mail share the explicitly published version',()=>{
 assert.equal(effectiveCloudCalendar(archived,live,'s').day,11);
 assert.equal(cloudMailRuntimeApproved(live,mail,archived,'s'),true);
 assert.equal(cloudMailRuntimeApproved(live,{...mail,calendarVersion:4},archived,'s'),false);
});
test('unlaunched import stays readable and invalid operational dates fail closed',()=>{
 assert.equal(effectiveCloudCalendar(archived,{},'s'),archived);
 for(const change of [{status:'pending'},{sourceSnapshotId:'other'},{calendarVersion:9},
   {calendar:{...live.calendar,day:99}},{applicationEnabled:false}]){
  assert.equal(effectiveCloudCalendar(archived,{...live,...change},'s'),null);
  assert.equal(cloudMailRuntimeApproved({...live,...change},mail,archived,'s'),false);
 }
});

