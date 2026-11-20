import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {newHouseState} from './types';
import {createFirebaseHouseActivation} from './firebase-house-activation';
const snapshot='a'.repeat(64),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(profile='narrador'){
  const docs=new Map<string,any>();
  for(const root of ['migrationDomainStage','migrationAuthStage','migrationTimeEngineStage','migrationNobleHouseStage'])
    docs.set(root+'/'+snapshot,{status:'complete',private:true});
  const scope='migrationDomainStage/'+snapshot+'/access/narrator';
  docs.set(scope,{userId:'narrator',profile,active:true,admin:profile==='narrador',
    requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]});
  const runtime='campaignCloudRuntime/'+snapshot;
  docs.set(runtime,{status:'active',private:true,applicationEnabled:true,
    sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,sourceAuthority:'owner_adopted_firebase',
    calendarSource:'operational',calendarVersion:6,
    calendar:{year:1522,month:0,day:11,festival:null,version:6}});
  docs.set('migrationTimeEngineStage/'+snapshot+'/calendar/current',{year:1522,month:0,day:1,festival:null,version:5});
  docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a'),{sourceId:'house-a',active:true,season:2});
  const source=newHouseState('house-a','Ferlin',1522*12);
  source.phase='active';source.method='import';source.treasury=42;
  for(const key of Object.keys(source.base) as (keyof typeof source.base)[])source.base[key]=120;
  source.domains=[{id:'d1',name:'Vale',terrain:'plains',features:[],notes:''}];
  const sheet='migrationNobleHouseStage/'+snapshot+'/sheets/'+hash('noble-sheet:house-a');
  docs.set(sheet,{houseId:'house-a',state:source,version:4});
  let catalogReads=0;
  const ref=(p:string):any=>({
    path:p,collection:(n:string)=>ref(p+'/'+n),doc:(n:string)=>ref(p+'/'+n),
    get:async()=>{
      if(p==='migrationDomainStage/'+snapshot+'/houses'){
        catalogReads++;
        return {docs:[...docs.entries()].filter(([k])=>k.startsWith(p+'/'))
          .map(([,v])=>({data:()=>v}))};
      }
      return {exists:docs.has(p),data:()=>docs.get(p)};
    },
  });
  const db={collection:(n:string)=>ref(n),runTransaction:async(fn:any)=>{
    const writes:any[]=[];
    const result=await fn({get:async(r:any)=>({exists:docs.has(r.path),data:()=>docs.get(r.path)}),
      create:(r:any,v:any)=>writes.push({path:r.path,value:v,create:true}),
      update:(r:any,v:any)=>writes.push({path:r.path,value:v,create:false})});
    for(const w of writes)if(w.create&&docs.has(w.path))throw Error('exists');
    for(const w of writes)docs.set(w.path,w.create?structuredClone(w.value):{...docs.get(w.path),...w.value});
    return result;
  }} as unknown as Firestore;
  const auth={verifyIdToken:async(_t:string,revoked:boolean)=>{expect(revoked).toBe(true);return {uid:'narrator'};},
    getUser:async()=>({uid:'narrator',disabled:false})} as unknown as Auth;
  const service=createFirebaseHouseActivation({db,auth,snapshotId:snapshot,enabled:true,env:{}});
  const inspect=()=>service.execute('synthetic-token',{action:'inspect',houseId:'house-a'});
  const activate=async()=>{const preview=await inspect();return service.execute('synthetic-token',{
    action:'activate',houseId:'house-a',expectedSourceVersion:preview.preview?.sourceSheetVersion,expectedSourceHash:preview.sourceHash});};
  return {docs,runtime,scope,sheet,service,inspect,activate,catalogReads:()=>catalogReads};
}
describe('Explicit narrator House activation',()=>{
  it('previews without writes then atomically clones the exact baseline and Treasury',async()=>{
    const f=fixture(),before=structuredClone(f.docs);
    const preview=await f.inspect();expect(preview.status).toBe('ready_for_operator_review');
    expect(preview.preview?.treasury).toBe(42);expect(f.docs).toEqual(before);
    expect((await f.activate()).status).toBe('activated');
    const op=f.docs.get(f.runtime+'/houseEconomies/'+hash('house:house-a'));
    expect(op.state).toEqual(before.get(f.sheet).state);expect(op.version).toBe(0);
    expect(f.docs.get(f.runtime+'/houseTreasuries/'+hash('house:house-a')).balance).toBe(42);
    for(const [key,v] of before)if(key.startsWith('migration'))expect(f.docs.get(key)).toEqual(v);
    const after=structuredClone(f.docs);
    expect((await f.inspect()).status).toBe('already_initialized');
    expect(f.docs).toEqual(after);
  });
  it('denies players, stale versions, mismatched month and partial preexisting targets',async()=>{
    await expect(fixture('jogador').inspect()).rejects.toMatchObject({code:'narrator_required'});
    const f=fixture(),p=await f.inspect();
    await expect(f.service.execute('synthetic-token',{action:'activate',houseId:'house-a',
      expectedSourceVersion:99,expectedSourceHash:p.sourceHash})).rejects.toMatchObject({code:'source_version_conflict'});
    expect(f.docs.has(f.runtime+'/houseTreasuries/'+hash('house:house-a'))).toBe(false);
    const source=f.docs.get(f.sheet);source.state.month++;
    expect((await f.inspect()).status).toBe('calendar_mismatch');
    source.state.month--;
    f.docs.set(f.runtime+'/houseTreasuries/'+hash('house:house-a'),{balance:99});
    expect((await f.inspect()).status).toBe('existing_document_requires_review');
    expect(f.docs.get(f.runtime+'/houseTreasuries/'+hash('house:house-a')).balance).toBe(99);
  });
  it('brings an imported sheet up to 3 months behind to the official month with the original engine',async()=>{
    const f=fixture();
    const source=f.docs.get(f.sheet);source.state.month-=2;
    const preview=await f.inspect();
    expect(preview.status).toBe('ready_for_operator_review');
    expect((preview.preview as {catchUpMonths?:number}|null)?.catchUpMonths).toBe(2);
    expect((await f.activate()).status).toBe('activated');
    const op=f.docs.get(f.runtime+'/houseEconomies/'+hash('house:house-a'));
    expect(op.state.month).toBe(1522*12);expect(op.version).toBe(1);
    expect(op.monthlyProcessedTo).toBe(1522*12);
    expect(f.docs.get(f.sheet).state.month).toBe(1522*12-2);
    source.state.month-=5;
    const far=fixture();far.docs.get(far.sheet).state.month-=4;
    expect((await far.inspect()).status).toBe('calendar_mismatch');
  });
});


describe('Batch activation: Narrator authorization and bounded listing',()=>{
 it('does not query private House catalog before checking the Narrator profile',async()=>{
  const player=fixture('jogador');
  await expect(player.service.listHouses('synthetic-token')).rejects
   .toMatchObject({code:'narrator_required',status:403});
  expect(player.catalogReads()).toBe(0);
  const invalid=fixture();
  await expect(invalid.service.listHouses('x')).rejects
   .toMatchObject({code:'authentication_required',status:401});
  expect(invalid.catalogReads()).toBe(0);
 });
 it('lists only active season-2 Houses, then keeps historical data immutable',async()=>{
  const f=fixture(),before=structuredClone(f.docs);
  f.docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:archived'),{
    sourceId:'archived',active:false,season:2,
  });
  f.docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:other-season'),{
    sourceId:'other-season',active:true,season:1,
  });
  expect(await f.service.listHouses('synthetic-token'))
   .toEqual({houseIds:['house-a']});
  expect(f.catalogReads()).toBe(1);
  const result=await f.service.activateAll('synthetic-token');
  expect(result.results).toEqual([{houseId:'house-a',status:'activated'}]);
  for(const [key,val] of before){
   if(key.startsWith('migration')&&f.docs.has(key))
    expect(f.docs.get(key)).toEqual(val);
  }
  const repeated=await f.service.activateAll('synthetic-token');
  expect(repeated.results).toEqual([{houseId:'house-a',status:'already_initialized'}]);
 });
});
