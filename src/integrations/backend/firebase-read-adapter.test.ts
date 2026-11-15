import { describe, expect, it, vi } from 'vitest';
import { READ_SURFACES, buildReadRequest, readFirebaseSurface } from './firebase-read-adapter';

describe('Lote 6 Firebase readonly domain surface adapter', () => {
  it('contains all 16 independent read surfaces and never exposes writes', () => {
    expect(READ_SURFACES).toHaveLength(16);
    const keys = READ_SURFACES.map(x => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['house','inbox','calendar','newspaper','spyAgents','spyMissions','spyIntel','battles']));
    const allActions=READ_SURFACES.map(x=>x.action);
    expect(allActions).not.toEqual(expect.arrayContaining(['send','createEdition','livePlay','advanceMissions','saveRecord']));
  });
  it('builds per-module typed domain requests preserving the existing preview contracts', () => {
    expect(buildReadRequest('profile')).toEqual({domain:'access',action:'getProfile',args:[]});
    expect(buildReadRequest('house',{houseId:' Evenhand '})).toEqual({
      domain:'houses',action:'getHouse',args:['Evenhand'],
    });
    expect(buildReadRequest('publishedSchedule',{year:1522,month:9})).toEqual({
      domain:'schedule',action:'getPublished',args:[{year:1522,month:9}],
    });
    expect(buildReadRequest('inbox')).toEqual({domain:'mailbox',action:'list',
      args:[{folder:'all',source:'all',pageSize:10,cursor:null,query:''}],
    });
    expect(buildReadRequest('mailSession')).toEqual({
      domain:'mailCommands',action:'session',args:[{}],
    });
    expect(buildReadRequest('battles')).toEqual({domain:'battle',action:'liveList',args:[]});
  });
  it('requires safe house IDs and valid calendar ranges', () => {
    for (const houseId of ['', ' ', '../outside','house/other', 'x'.repeat(129)]) {
      expect(()=>buildReadRequest('house',{houseId})).toThrow();
    }
    expect(()=>buildReadRequest('spyIntel',{houseId:'  '})).toThrow();
    expect(()=>buildReadRequest('publishedSchedule',{year:1522,month:13})).toThrow();
    expect(()=>buildReadRequest('publishedSchedule',{year:NaN,month:1})).toThrow();
    expect(()=>buildReadRequest('publishedSchedule',{year:1522.5,month:1})).toThrow();
    expect(()=>buildReadRequest('notAnOperation' as never)).toThrow();
  });
  it('fails closed when disabled and never retries against Supabase', async () => {
    const invoke = vi.fn(async () => ({ok:true}));
    await expect(readFirebaseSurface('houses',{}, {enabled:false,invoke}))
      .rejects.toThrow(/desabilitada/);
    expect(invoke).not.toHaveBeenCalled();
    const result=await readFirebaseSurface('houses',{}, {enabled:true,invoke});
    expect(result).toEqual({ok:true});
    expect(invoke).toHaveBeenCalledWith({domain:'houses',action:'listHouses',args:[]});
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
