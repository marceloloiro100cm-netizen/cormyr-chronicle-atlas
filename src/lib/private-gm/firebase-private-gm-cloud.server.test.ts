import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {readApprovedFirebasePrivateGmContent,PrivateGmCloudError}
  from './firebase-private-gm-cloud.server';

const SNAP='b'.repeat(64);
const UID='narrator-1';
const GM_ID=createHash('sha256').update('gm:atlas').digest('hex');
const domain='migrationDomainStage/'+SNAP;
const authStage='migrationAuthStage/'+SNAP;
const access=domain+'/access/'+UID;
const runtime='campaignCloudRuntime/'+SNAP;
const gmStage='migrationPrivateGmStage/'+SNAP;
const docPath=gmStage+'/content/'+GM_ID;
const TOKEN='firebase-id-token-verified-by-admin';
function fixture(custom:Record<string,unknown>={},profile='narrador'){
  const docs:Record<string,unknown>={
    [domain]:{status:'complete',private:true},
    [authStage]:{status:'complete',private:true},
    [access]:{userId:UID,active:true,profile,
      admin:profile==='narrador',requirePasswordChange:false},
    [runtime]:{status:'active',private:true,
      sourceSnapshotId:SNAP,sourceSnapshotReconciled:true,
      applicationEnabled:true,privateGmContentApproved:true,
      gmContentVersion:4,publishedGmContentVersion:4},
    [gmStage]:{status:'complete',formatVersion:1,private:true,
      counts:{content:1,vassal:0,audit:0}},
    [docPath]:{id:'atlas',payload:{events:[{title:'test event'}],
      adventures:[{title:'test adventure'}],privateWorkbooks:'hidden'}},
    ...custom,
  };
  const reads:string[]=[];
  const doc=(p:string):any=>({
    get:async()=>{reads.push(p);return {
      exists:docs[p]!=null,data:()=>docs[p]??undefined,
    };},
    collection:(c:string)=>({doc:(id:string)=>doc(p+'/'+c+'/'+id)}),
  });
  const db={collection:(c:string)=>({doc:(id:string)=>doc(c+'/'+id)})} as unknown as Firestore;
  const auth={
    verifyIdToken:async(_token:string,check:boolean)=>{
      if(!check)throw Error('revocation not checked');
      return {uid:UID};
    },
    getUser:async()=>({uid:UID,disabled:false}),
  } as unknown as Pick<Auth,'verifyIdToken'|'getUser'>;
  const opts={auth,db,snapshotId:SNAP,projectId:'cormyr',enabled:true,env:{}};
  return {reads,docs,opts,run:()=>readApprovedFirebasePrivateGmContent(opts,TOKEN)};
}
async function denied(p:Promise<unknown>,status:401|403|503){
  await expect(p).rejects.toMatchObject({name:'PrivateGmCloudError',status});
}
describe('Firebase-only narrator GM material',()=>{
  it('returns only events/adventures with independently verified narrator identity',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result).toEqual({events:[{title:'test event'}],
      adventures:[{title:'test adventure'}]});
    expect(JSON.stringify(result)).not.toContain('privateWorkbooks');
    expect(f.reads).toContain(access);
    expect(f.reads).toContain(docPath);
  });
  it('reads the imported, explicitly approved GM archive even without legacy version fields',async()=>{
    // No production write path initializes these version fields. A reviewed
    // immutable import must not be blocked solely because they are absent.
    const f=fixture();
    const runtimeDoc={...(f.docs[runtime] as Record<string,unknown>)};
    delete runtimeDoc['gmContentVersion'];
    delete runtimeDoc['publishedGmContentVersion'];
    f.docs[runtime]=runtimeDoc;
    const result=await f.run();
    expect(result.events).toHaveLength(1);
    expect(f.reads).toContain(docPath);
  });
  it('still requires approval and refuses half-versioned or stale published data',async()=>{
    const cases=[
      {privateGmContentApproved:false,gmContentVersion:undefined,publishedGmContentVersion:undefined},
      {gmContentVersion:5,publishedGmContentVersion:undefined},
      {gmContentVersion:undefined,publishedGmContentVersion:4},
      {gmContentVersion:5,publishedGmContentVersion:4},
      {gmContentVersion:0,publishedGmContentVersion:0},
    ];
    for(const patch of cases){
      const f=fixture();
      f.docs[runtime]={...(f.docs[runtime] as object),...patch};
      await denied(f.run(),503);
      expect(f.reads).not.toContain(docPath);
    }
  });
  it('denies player and editor without reading the private payload',async()=>{
    for(const p of ['jogador','editor']){
      const f=fixture({},p);
      await denied(f.run(),403);
      expect(f.reads).not.toContain(docPath);
    }
  });
  it('denies unsigned, disabled or revoked identities',async()=>{
    const f=fixture();
    await denied(readApprovedFirebasePrivateGmContent(f.opts,'bad'),401);
    const disabled=fixture();
    disabled.opts.auth.getUser=async()=>({uid:UID,disabled:true}) as never;
    await denied(disabled.run(),401);
    const revoked=fixture();
    revoked.opts.auth.verifyIdToken=async()=>{throw Error('revoked');};
    await denied(revoked.run(),401);
  });
  it('requires an active, password-reviewed narrator',async()=>{
    for(const patch of [
      {active:false},{admin:false},{requirePasswordChange:true},{profile:'editor'},
      {userId:'someone-else'},
    ]){
      const base=fixture();
      const f=fixture({[access]:{...(base.docs[access] as object),...patch}});
      await denied(f.run(),403);
      expect(f.reads).not.toContain(docPath);
    }
  });
  it('fails closed on missing stages or unpublished and mismatched runtime',async()=>{
    for(const changes of [
      {[domain]:null},{[authStage]:null},{[gmStage]:null},
      {[runtime]:null},
      {[runtime]:{status:'active',private:true,
        sourceSnapshotId:SNAP,sourceSnapshotReconciled:true,
        applicationEnabled:true,privateGmContentApproved:false,
        gmContentVersion:4,publishedGmContentVersion:4}},
      {[docPath]:{id:'wrong',payload:{events:[],adventures:[]}}},
    ]){
      const f=fixture(changes);
      await denied(f.run(),503);
    }
  });
  it('blocks Cloud access in emulators or without explicitly enabled flag',async()=>{
    const f=fixture();
    await denied(readApprovedFirebasePrivateGmContent({...f.opts,enabled:false},TOKEN),503);
    await denied(readApprovedFirebasePrivateGmContent(
      {...f.opts,env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}},TOKEN),503);
    expect(f.reads).toHaveLength(0);
  });
  it('does not import Supabase credentials or use its admin RPC',()=>{
    const route=readFileSync('src/routes/api/public/gm-content.ts','utf8');
    expect(route).not.toMatch(/resolvePublicSupabase|is_campaign_admin|supabaseAdmin|SUPABASE_URL/);
    expect(route).toContain('readApprovedFirebasePrivateGmContent');
  });
});
