import {validateHarptosDate} from './stage-temporal-emulator.mjs';

/** The immutable import remains the fallback until the narrator launches the campaign. */
export function effectiveCloudCalendar(archived,live,snapshotId){
  if(live?.calendarSource!== 'operational')return archived;
  const c=live.calendar;
  if(live.status!=='active'||live.private!==true||
     live.sourceSnapshotId!==snapshotId||live.sourceSnapshotReconciled!==true||
     live.applicationEnabled!==true||!c||
     !Number.isSafeInteger(c.version)||c.version<1||
     c.version!==live.calendarVersion||
     !validateHarptosDate(c.year,c.month,c.day,c.festival??null))return null;
  return c;
}

