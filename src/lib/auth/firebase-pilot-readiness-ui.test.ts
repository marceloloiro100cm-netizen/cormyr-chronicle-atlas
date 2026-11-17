import {describe,expect,it} from 'vitest';
import {describeFirebasePilotSignals,type FirebasePilotSignalInput}
  from './firebase-pilot-readiness-ui';

const base:FirebasePilotSignalInput={
  profile:'jogador',sessionConfirmed:true,
  snapshotReconciliationPending:true,roleSelfTestPassed:false,
  houseLoaded:false,calendarLoaded:false,
  mailboxLoaded:false,mailCanSend:false,
};
describe('Firebase player pilot readiness — session-only display',()=>{
  it('shows limited evidence and never allows GO even when all checks pass',()=>{
    const s=describeFirebasePilotSignals({...base,
      roleSelfTestPassed:true,houseLoaded:true,calendarLoaded:true,
      mailboxLoaded:true,mailCanSend:true,
      snapshotReconciliationPending:false,
    });
    expect(s.signals.every(x=>x.status==='conferido')).toBe(true);
    expect(s.readyForPlayers).toBe(false);
    expect(s.readyForCutover).toBe(false);
    expect(s.signals.find(x=>x.key==='mail')?.detail).toContain('aceite real');
  });
  it('treats read-only mail and single-account role checks as insufficient',()=>{
    const s=describeFirebasePilotSignals({...base,
      roleSelfTestPassed:true,houseLoaded:true,
      calendarLoaded:true,mailboxLoaded:true,mailCanSend:false,
    });
    expect(s.signals.find(x=>x.key==='mail')?.status).toBe('pendente');
    expect(s.signals.find(x=>x.key==='snapshot')?.status).toBe('pendente');
    expect(s.readyForPlayers).toBe(false);
  });
  it('never asks editor to access private Houses, mail or calendar',()=>{
    const s=describeFirebasePilotSignals({...base,profile:'editor',
      snapshotReconciliationPending:false,
    });
    expect(s.signals.filter(x=>x.status==='nao-aplicavel').map(x=>x.key))
      .toEqual(['house','calendar','mail']);
    expect(s.readyForPlayers).toBe(false);
  });
  it('keeps a narrator without selected House in pending state',()=>{
    const s=describeFirebasePilotSignals({...base,profile:'narrador',
      roleSelfTestPassed:true,houseLoaded:false,
    });
    expect(s.signals.find(x=>x.key==='house')?.status).toBe('pendente');
    expect(s.readyForPlayers).toBe(false);
  });
  it('does not leak any House or user identifiers in signal text',()=>{
    const s=describeFirebasePilotSignals({...base,
      roleSelfTestPassed:true,
    });
    const output=JSON.stringify(s);
    for(const forbidden of ['PRIVATE_UID','SECRET_HOUSE_ID','Bearer '])
      expect(output).not.toContain(forbidden);
  });
});
