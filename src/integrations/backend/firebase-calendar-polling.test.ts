import {describe,it,expect,vi} from 'vitest';
import {
  FIREBASE_CALENDAR_POLL_MS,validateFirebaseCalendarVersion,watchFirebaseCalendar,
} from './firebase-calendar-polling';

const clock=(version=1)=>({
  year:1522,month:0,day:1,festival:null,version,
});
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

function fakeScheduler(){
  let tick:()=>void=()=>{};
  const setInterval=vi.fn((callback:()=>void,_ms:number)=>{tick=callback;return 42;});
  const clearInterval=vi.fn((_handle:unknown)=>{});
  return {scheduler:{setInterval,clearInterval},getTick:()=>tick};
}

describe('Firebase calendar opt-in polling — emulador apenas',()=>{
  it('validates canonical Harptos dates without falling back to a device clock',()=>{
    expect(validateFirebaseCalendarVersion(clock())).toEqual(clock());
    for(const invalid of [
      null,{},'not a date',{...clock(),version:-1},
      {...clock(),day:31},{...clock(),month:12},
      {...clock(),year:0},{...clock(),festival:'nao-existe'},
    ])expect(()=>validateFirebaseCalendarVersion(invalid)).toThrow();
  });

  it('deduplicates unchanged calendar snapshots and exposes only changed versions',async()=>{
    const v={current:clock()};
    const read=vi.fn(async()=>v.current);
    const received=vi.fn();
    const timers=fakeScheduler();
    const watch=watchFirebaseCalendar({
      read,onSnapshot:received,scheduler:timers.scheduler,
    });
    await flush();
    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(clock());
    expect(timers.scheduler.setInterval).toHaveBeenCalledWith(expect.any(Function),FIREBASE_CALENDAR_POLL_MS);
    await watch.refresh();
    expect(received).toHaveBeenCalledOnce();
    v.current=clock(2);
    timers.getTick()();await flush();
    expect(received).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenLastCalledWith(clock(2));
    watch.stop();
    expect(timers.scheduler.clearInterval).toHaveBeenCalledWith(42);
    timers.getTick()();await flush();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('ignores an in-flight response after a session leaves the preview',async()=>{
    let deliver:(value:unknown)=>void=()=>{};
    const received=vi.fn();
    const read=vi.fn(()=>new Promise<unknown>(resolve=>{deliver=resolve;}));
    const timers=fakeScheduler();
    const monitor=watchFirebaseCalendar({read,onSnapshot:received,scheduler:timers.scheduler});
    await flush();
    timers.getTick()();
    expect(read).toHaveBeenCalledOnce();
    monitor.stop();monitor.stop();
    deliver(clock(3));
    await flush();
    expect(received).not.toHaveBeenCalled();
    expect(timers.scheduler.clearInterval).toHaveBeenCalledOnce();
  });

  it('never accepts a cadence that would bypass the 15-second polling limit',()=>{
    const timers=fakeScheduler();
    expect(()=>watchFirebaseCalendar({
      read:async()=>clock(),onSnapshot:()=>{},scheduler:timers.scheduler,intervalMs:0,
    })).toThrow();
    expect(()=>watchFirebaseCalendar({
      read:async()=>clock(),onSnapshot:()=>{},scheduler:timers.scheduler,intervalMs:14_999,
    })).toThrow();
    expect(timers.scheduler.setInterval).not.toHaveBeenCalled();
  });

  it('reports an unavailable calendar without logging or exposing private error objects',async()=>{
    const timers=fakeScheduler();
    const error=vi.fn(),received=vi.fn();
    const monitor=watchFirebaseCalendar({
      read:async()=>{throw Error('SENSITIVE DETAILS');},
      onSnapshot:received,onError:error,scheduler:timers.scheduler,
    });
    await flush();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Calendário Firebase indisponível.');
    expect(received).not.toHaveBeenCalled();
    monitor.stop();
  });
});
