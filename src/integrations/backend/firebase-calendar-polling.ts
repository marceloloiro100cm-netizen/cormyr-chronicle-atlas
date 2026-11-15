/**
 * Read-only Firebase calendar polling for the isolated homologation bench.
 * No direct Firestore client access, no cache of private identity data and
 * absolutely no fallback to Supabase. Never enabled in production by default.
 */
import {dateKey,parseDate} from '@/lib/calendar/harptos';

export type FirebaseCalendarVersion={
  year:number;month:number;day:number;festival:string|null;version:number;
};
type PollingScheduler={
  setInterval:(callback:()=>void,ms:number)=>unknown;
  clearInterval:(handle:unknown)=>void;
};
export const FIREBASE_CALENDAR_POLL_MS=15_000;

export function validateFirebaseCalendarVersion(value:unknown):FirebaseCalendarVersion{
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error('Calendário Firebase inválido.');
  const v=value as Record<string,unknown>;
  if(!Number.isSafeInteger(v['year'])||!Number.isSafeInteger(v['month'])||
    !Number.isSafeInteger(v['day'])||!Number.isSafeInteger(v['version'])||
    (v['version'] as number)<0||(v['festival']!==null&&typeof v['festival']!=='string'))
    throw Error('Calendário Firebase inválido.');
  const row=v as FirebaseCalendarVersion;
  const parsed=parseDate(dateKey(row));
  if(!parsed||parsed.year!==row.year||parsed.month!==row.month||
     parsed.day!==row.day||parsed.festival!==row.festival)
    throw Error('Data de Harptos inválida.');
  return row;
}

export function watchFirebaseCalendar({
  read,onSnapshot,onError=()=>{},intervalMs=FIREBASE_CALENDAR_POLL_MS,
  scheduler={
    setInterval:(callback,ms)=>setInterval(callback,ms),
    clearInterval:handle=>clearInterval(handle as ReturnType<typeof setInterval>),
  },
}:{
  read:()=>Promise<unknown>;
  onSnapshot:(value:FirebaseCalendarVersion)=>void;
  onError?:(message:string)=>void;
  intervalMs?:number;
  scheduler?:PollingScheduler;
}){
  if(typeof read!=='function'||typeof onSnapshot!=='function'||
    !Number.isInteger(intervalMs)||intervalMs<FIREBASE_CALENDAR_POLL_MS)
    throw Error('Configuração inválida para acompanhamento do calendário.');
  let active=true,inFlight=false,fingerprint:string|null=null;
  async function refresh(){
    if(!active||inFlight)return;
    inFlight=true;
    try{
      const data=validateFirebaseCalendarVersion(await read());
      if(!active)return;
      const key=JSON.stringify([data.version,data.year,data.month,data.day,data.festival]);
      if(key!==fingerprint){fingerprint=key;onSnapshot(data);}
    }catch{
      if(active)onError('Calendário Firebase indisponível.');
    }finally{
      inFlight=false;
    }
  }
  const handle=scheduler.setInterval(()=>{void refresh();},intervalMs);
  void refresh();
  return {
    refresh,
    stop(){
      if(!active)return;
      active=false;
      scheduler.clearInterval(handle);
    },
  };
}
