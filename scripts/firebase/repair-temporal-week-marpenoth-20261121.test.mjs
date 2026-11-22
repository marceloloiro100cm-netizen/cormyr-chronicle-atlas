import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWeekCorrection,verifyEventRestore} from './repair-temporal-week-marpenoth-20261121.mjs';
import {publishEvent} from './cloud-schedule-events-core.mjs';

const ID='a'.repeat(64);
const date={year:1522,month:9,day:21,festival:null,version:6};
function fixture(){
  const event={id:'eventabcd',version:1,updatedAt:'2026-11-21T22:00:00Z',
    draft:{date:'1522-10-21',title:'Evento de teste',description:'',deleted:false,
      scope:'kingdom',region:null},published:null};
  return {
    live:{status:'active',private:true,sourceSnapshotId:ID,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      calendarSource:'operational',sourceAuthority:'owner_adopted_firebase',
      publicTimeApproved:true,mailWriteApproved:true,
      publishedTimeVersion:6,calendarVersion:6,openRound:4,
      lastAdvanceAuditId:'advance20261121',calendar:{...date}},
    mail:{status:'active',private:true,sourceSnapshotId:ID,
      sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,
      openRound:4,calendarVersion:6},
    archive:{year:1522,month:9,day:11,festival:null,version:5},
    last:{action:'advance_week',fromRound:3,toRound:4,
      from:{year:1522,month:9,day:11,festival:null,version:5},
      to:{...date},monthsCrossed:0,flashback:false,
      at:'2026-11-21T22:00:00Z',
      eventsBefore:[{id:'eventabcd',doc:event}]},
    snapshotId:ID,
  };
}
test('21 Marpenoth is eligible only as a reversible 4-to-3 operation',()=>{
  const s=fixture();
  assert.deepEqual(verifyWeekCorrection(s),{eventCount:1});
  verifyEventRestore(s.last.eventsBefore,[publishEvent(s.last.eventsBefore[0].doc,s.last.at)]);
});
test('incorrect date or round and mismatched mail gate abort',()=>{
  for(const variant of [
    s=>{s.live.calendar.day=20;},
    s=>{s.live.openRound=5;},
    s=>{s.mail.openRound=3;},
    s=>{s.live.calendarVersion=7;},
    s=>{s.last.toRound=5;},
    s=>{s.last.fromRound=2;},
    s=>{s.last.monthsCrossed=1;},
    s=>{s.last.action='start_season';},
    s=>{s.last.undoneAt='2026-11-21T22:30:00Z';},
    s=>{s.last.eventsBefore=null;},
    s=>{s.last.from.month=8;},
    s=>{s.live.sourceSnapshotReconciled=false;},
  ]){
    const s=fixture();variant(s);
    assert.throws(()=>verifyWeekCorrection(s));
  }
});
test('event edits after publication are never overwritten',()=>{
  const s=fixture();
  const published=publishEvent(s.last.eventsBefore[0].doc,s.last.at);
  verifyEventRestore(s.last.eventsBefore,[published]);
  assert.throws(()=>verifyEventRestore(s.last.eventsBefore,[{...published,version:3}]),
    /event_modified_since_week_opening/);
  assert.throws(()=>verifyEventRestore(s.last.eventsBefore,[{...published,published:null}]),
    /event_modified_since_week_opening/);
  assert.throws(()=>verifyEventRestore(s.last.eventsBefore,[null]),
    /event_modified_since_week_opening/);
});
test('invalid and duplicate event snapshots fail closed',()=>{
  const s=fixture();
  s.last.eventsBefore.push(s.last.eventsBefore[0]);
  assert.throws(()=>verifyWeekCorrection(s),/event_audit_invalid/);
});
