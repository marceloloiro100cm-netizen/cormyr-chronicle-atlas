import {describe,expect,it} from 'vitest';
import {nextTendayStart,crossesMonth} from './firebase-next-tenday';
describe('próxima désdia do HUB',()=>{
  it('sugere os dias 11, 21 e o primeiro dia do mês seguinte',()=>{
    expect(nextTendayStart({year:1522,month:9,day:3,festival:null})).toEqual({year:1522,month:9,day:11,festival:null});
    expect(nextTendayStart({year:1522,month:9,day:11,festival:null})).toEqual({year:1522,month:9,day:21,festival:null});
    expect(nextTendayStart({year:1522,month:9,day:21,festival:null})).toEqual({year:1522,month:10,day:1,festival:null});
    expect(nextTendayStart({year:1522,month:11,day:25,festival:null})).toEqual({year:1523,month:0,day:1,festival:null});
    expect(nextTendayStart({year:1522,month:0,day:30,festival:'midwinter'})).toEqual({year:1522,month:1,day:1,festival:null});
  });
  it('detecta virada de mês e de ano',()=>{
    expect(crossesMonth({year:1522,month:9,day:21,festival:null},{year:1522,month:10,day:1,festival:null})).toBe(true);
    expect(crossesMonth({year:1522,month:9,day:11,festival:null},{year:1522,month:9,day:21,festival:null})).toBe(false);
  });
});
