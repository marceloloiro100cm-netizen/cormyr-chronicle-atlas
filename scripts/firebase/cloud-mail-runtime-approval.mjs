import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {runtimeApprovalEnabled} from './runtime-approval-policy.mjs';
/**
 * One shared, fail-closed approval predicate for Cloud mailbox reads and
 * writes. Historical imported mail remains separately readable by its
 * authorized recipient when this new-write runtime is not approved.
 *
 * The private current calendar version is NOT the current open round; both
 * runtime roots must explicitly agree on the round and the same version.
 * No data reads, writes or provider calls happen in this module.
 */
export function cloudMailRuntimeApproved(live,mail,calendar,snapshotId){
  calendar=effectiveCloudCalendar(calendar,live,snapshotId);
  return Boolean(
    live?.status==='active'&&live.private===true&&
    live.sourceSnapshotId===snapshotId&&
    live.sourceSnapshotReconciled===true&&
    live.applicationEnabled===true&&runtimeApprovalEnabled(live,'mailWriteApproved')&&
    Number.isSafeInteger(live.openRound)&&live.openRound>=1&&
    Number.isSafeInteger(live.calendarVersion)&&live.calendarVersion>=1&&
    Number.isSafeInteger(calendar?.version)&&calendar.version>=1&&
    live.calendarVersion===calendar.version&&
    mail?.status==='active'&&mail.private===true&&
    mail.sourceSnapshotId===snapshotId&&
    mail.sourceLiveReconciled===true&&
    mail.applicationEnabled===true&&mail.mailEnabled===true&&
    Number.isSafeInteger(mail.openRound)&&mail.openRound===live.openRound&&
    Number.isSafeInteger(mail.calendarVersion)&&
    mail.calendarVersion===calendar.version
  );
}

