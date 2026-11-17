import {describe,expect,it,vi} from 'vitest';
import {loadFirebasePilotResources} from './firebase-pilot-resource-loader';

const makeLoaders=()=>{
  const listHouses=vi.fn(async()=>[{id:'house-1'}]);
  const getCalendar=vi.fn(async()=>({year:1522}));
  const listMailbox=vi.fn(async()=>({items:['a']}));
  const listNewspaper=vi.fn(async()=>({items:['edition']}));
  const mailStatus=vi.fn(async()=>({enabled:false}));
  const publishingStatus=vi.fn(async()=>({enabled:false}));
  return {listHouses,getCalendar,listMailbox,listNewspaper,
    mailStatus,publishingStatus};
};

describe('Firebase pilot optional reads keep verified session separate',()=>{
  it('keeps the House catalog, calendar and messages for a player',async()=>{
    const ops=makeLoaders();
    const result=await loadFirebasePilotResources('jogador',ops);
    expect(result.houseCatalogAvailable).toBe(true);
    expect(result.houses).toEqual([{id:'house-1'}]);
    expect(result.calendar).toEqual({year:1522});
    expect(result.inbox).toEqual({items:['a']});
    expect(result.newspaper).toEqual({items:['edition']});
    expect(result.publishing).toBeNull();
    expect(ops.publishingStatus).not.toHaveBeenCalled();
  });

  it('a temporary House catalog failure never blocks independent authorized reads',async()=>{
    const ops=makeLoaders();
    ops.listHouses.mockRejectedValueOnce(Error('PRIVATE_SERVER_REASON'));
    const result=await loadFirebasePilotResources('jogador',ops);
    expect(result.houseCatalogAvailable).toBe(false);
    expect(result.houses).toEqual([]);
    expect(result.calendar).toEqual({year:1522});
    expect(result.inbox).toEqual({items:['a']});
    expect(result.newspaper).toEqual({items:['edition']});
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SERVER_REASON');
  });

  it('an empty but accessible catalog is not mistaken for an outage',async()=>{
    const ops=makeLoaders();
    ops.listHouses.mockResolvedValueOnce([]);
    const result=await loadFirebasePilotResources('narrador',ops);
    expect(result.houseCatalogAvailable).toBe(true);
    expect(result.houses).toEqual([]);
  });

  it('an editor never requests calendar, mailbox or mail status',async()=>{
    const ops=makeLoaders();
    const result=await loadFirebasePilotResources('editor',ops);
    expect(ops.getCalendar).not.toHaveBeenCalled();
    expect(ops.listMailbox).not.toHaveBeenCalled();
    expect(ops.mailStatus).not.toHaveBeenCalled();
    expect(ops.listNewspaper).toHaveBeenCalledTimes(1);
    expect(ops.publishingStatus).toHaveBeenCalledTimes(1);
    expect(result.calendar).toBeNull();
    expect(result.inbox).toBeNull();
    expect(result.mailStatus).toBeNull();
  });

  it('one optional failure does not fabricate data or fail unrelated reads',async()=>{
    const ops=makeLoaders();
    ops.listMailbox.mockRejectedValueOnce(Error('PRIVATE_LETTER'));
    ops.listNewspaper.mockRejectedValueOnce(Error('PRIVATE_EDITION'));
    const result=await loadFirebasePilotResources('narrador',ops);
    expect(result.houses).toEqual([{id:'house-1'}]);
    expect(result.inbox).toBeNull();
    expect(result.newspaper).toBeNull();
    expect(result.mailStatus).toEqual({enabled:false});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_LETTER|PRIVATE_EDITION/);
  });
});
