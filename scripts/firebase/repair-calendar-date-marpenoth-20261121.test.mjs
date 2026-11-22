import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDateChange} from './repair-calendar-date-marpenoth-20261121.mjs';
const id='a'.repeat(64);
const fixture=()=>({
 snapshotId:id,
 live:{
  status:'active',private:true,sourceSnapshotId:id,
  sourceSnapshotReconciled:true,applicationEnabled:true,
  calendarSource:'operational',sourceAuthority:'owner_adopted_firebase',
  publicTimeApproved:true,mailWriteApproved:true,
  calendar:{year:1522,month:9,day:20,festival:null,version:3},
  calendarVersion:3,publishedTimeVersion:3,openRound:3,
 },
 mail:{
  status:'active',private:true,sourceSnapshotId:id,sourceLiveReconciled:true,
  applicationEnabled:true,mailEnabled:true,openRound:3,calendarVersion:3,
 },
 archive:{year:1522,month:9,day:11,festival:null,version:2},
});
test('3rd desdia date correction does not advance a mail round',()=>{
 assert.deepEqual(verifyDateChange(fixture()),{
  fromDay:20,toDay:21,week:3,previousVersion:3,
 });
});
test('reject incorrect week, changed calendar or mail gate',()=>{
 for(const mutate of [
  s=>{s.live.openRound=4;},
  s=>{s.live.calendar.day=21;},
  s=>{s.live.calendar.month=8;},
  s=>{s.live.calendar.year=1523;},
  s=>{s.live.calendar.festival='highharvestide';},
  s=>{s.mail.openRound=4;},
  s=>{s.mail.calendarVersion=2;},
  s=>{s.live.calendarVersion=4;},
  s=>{s.live.publishedTimeVersion=2;},
  s=>{s.live.sourceSnapshotReconciled=false;},
  s=>{s.live.sourceSnapshotId='b'.repeat(64);},
  s=>{s.snapshotId='x';},
  s=>{s.live.calendarSource='imported';},
 ]){
  const s=fixture();mutate(s);
  assert.throws(()=>verifyDateChange(s));
 }
});
