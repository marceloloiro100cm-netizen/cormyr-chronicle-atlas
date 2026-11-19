import {describe,expect,it} from 'vitest';
import {buildThirdTendayRequest} from './firebase-third-tenday';

const archived={year:1522,month:0,day:20,festival:null,version:7};

describe('Third Harptos tenday — official Hub opening',()=>{
  it('day 20 is the end of the second ten-day; third begins on day 21',()=>{
    const request=buildThirdTendayRequest(archived,0);
    expect(request.proposedDate).toEqual({year:1522,month:0,day:21,festival:null});
    expect(request.openRound).toBe(3);
    expect(request.expectedCalendarVersion).toBe(7);
    expect(request.expectedDraftVersion).toBe(0);
    expect(request.reason.length).toBeGreaterThanOrEqual(12);
  });
  it('keeps source month and year instead of guessing a different month',()=>{
    const request=buildThirdTendayRequest(
      {...archived,year:1523,month:5,day:11,version:9},4);
    expect(request.proposedDate).toEqual({year:1523,month:5,day:21,festival:null});
    expect(request.expectedDraftVersion).toBe(4);
  });
  it('never moves historical time backward or converts a festival into a day',()=>{
    for(const source of [
      {...archived,day:22}, {...archived,day:30},
      {...archived,day:0}, {...archived,festival:'midwinter'},
      {...archived,month:12},{...archived,version:0},
    ])expect(()=>buildThirdTendayRequest(source,0)).toThrow(
      /calendário importado/);
  });
  it('cannot infer the draft version from a historical round',()=>{
    expect(()=>buildThirdTendayRequest(archived,-1)).toThrow();
    expect(buildThirdTendayRequest({...archived,day:21},2).openRound).toBe(3);
  });
});
