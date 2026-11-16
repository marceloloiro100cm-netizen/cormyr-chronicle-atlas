import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {readFirebaseNarratorContent} from './firebase-private-gm.server';

const HASH='a'.repeat(64);
const access='migrationDomainStage/'+HASH+'/access/narrator-a';
const runtime='campaignCloudRuntime/'+HASH;
const stage='migrationPrivateGmStage/'+HASH;
const contentId=createHash('sha256').update('gm:atlas').digest('hex');
const path=stage+'/content/'+contentId;

function fixture(changes:{
  docs?:Record<string,unknown>;
  disabledUser?:boolean;
  uid?:string;
  enabled?:boolean;
  env?:NodeJS.ProcessEnv;
  tokenRejected?:boolean;
}={}){
  const docs:Record<string,unknown>={
    ['migrationDomainStage/'+HASH]:{status:'complete',private:true},
    ['migrationAuthStage/'+HASH]:{status:'complete',private:true},
    [access]:{
      userId:'narrator-a',active:true,requirePasswordChange:false,
      profile:'narrador',admin:true,memberHouseIds:[],editHouseIds:[],
      playerId:null,
    },
    [runtime]:{
      status:'active',private:true,sourceSnapshotId:HASH,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      privateGmReadApproved:true,
    },
    [stage]:{status:'complete',private:true},
    [path]:{id:'atlas',payload:{
      events:[{id:1,title:'Evento privado'}],
      adventures:[{id:'adv1',title:'Aventura privada'}],
      secret:'NOT_FOR_CLIENT',
    }},
    ...changes.docs,
  };
  const reads:string[]=[];
  const doc=(id:string):any=>({
    get:async()=>{reads.push(id);return {exists:docs[id]!=null,data:()=>docs[id]??undefined};},
    collection:(name:string)=>({doc:(item:string)=>doc(id+'/'+name+'/'+item)}),
  });
  const db={collection:(name:string)=>({doc:(id:string)=>doc(name+'/'+id)})} as unknown as Firestore;
  const auth={
    verifyIdToken:async()=>{if(changes.tokenRejected)throw Error('bad token');
      return {uid:changes.uid??'narrator-a'};},
    getUser:async(uid:string)=>({uid,disabled:changes.disabledUser??false}),
  };
  return {
    docs,reads,
    run:()=>readFirebaseNarratorContent({
      db,auth,snapshotId:HASH,projectId:'cormyr',
      enabled:changes.enabled??true,env:changes.env??{},
    },'firebase-id-token-example'),
  };
}
const denied=async(p:Promise<unknown>,status:number)=>
  expect(p).rejects.toMatchObject({status});

describe('Firebase Narrator-only GM content',()=>{
  it('returns only approved events and adventures to an active Narrator',async()=>{
    const f=fixture();
    const result=await f.run();
    expect(result.events).toEqual([{id:1,title:'Evento privado'}]);
    expect(result.adventures).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('NOT_FOR_CLIENT');
    expect(f.reads).toContain(path);
  });
  it('fails before Firestore if disabled or on emulator',async()=>{
    const a=fixture({enabled:false});
    await denied(a.run(),503);expect(a.reads).toEqual([]);
    const b=fixture({env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'}});
    await denied(b.run(),503);expect(b.reads).toEqual([]);
  });
  it('denies disabled Firebase accounts and revoked tokens',async()=>{
    const a=fixture({disabledUser:true});
    await denied(a.run(),401);
    const b=fixture({tokenRejected:true});
    await denied(b.run(),401);
  });
  it('does not accept a player who chooses the Narrator profile',async()=>{
    const base=fixture();
    const player=fixture({docs:{[access]:{
      ...(base.docs[access] as object),profile:'jogador',admin:false,
      memberHouseIds:['hA'],editHouseIds:[],
    }}});
    await denied(player.run(),403);
    expect(player.reads).not.toContain(path);
  });
  it('denies a forged admin mismatch or unreviewed private data',async()=>{
    const base=fixture();
    const forged=fixture({docs:{[access]:{...(base.docs[access] as object),admin:false}}});
    await denied(forged.run(),403);
    const unapproved=fixture({docs:{[runtime]:{
      ...(base.docs[runtime] as object),privateGmReadApproved:false,
    }}});
    await denied(unapproved.run(),503);
    expect(unapproved.reads).not.toContain(path);
  });
  it('does not publish an incomplete stage or a wrong content ID',async()=>{
    const s=fixture({docs:{[stage]:{status:'pending',private:true}}});
    await denied(s.run(),503);
    const d=fixture({docs:{[path]:{id:'not-atlas',payload:{events:[],adventures:[]}}}});
    await denied(d.run(),503);
  });
  it('rejects unrecognized content shapes and excessive response sizes',async()=>{
    const bad=fixture({docs:{[path]:{id:'atlas',payload:{
      events:null,adventures:[],
    }}}});
    await denied(bad.run(),503);
    const giant=fixture({docs:{[path]:{id:'atlas',payload:{
      events:[{text:'A'.repeat(810_000)}],adventures:[],
    }}}});
    await denied(giant.run(),503);
  });
});
