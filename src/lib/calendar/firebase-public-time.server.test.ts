import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {readApprovedFirebasePublicTime,PublicFirebaseTimeUnavailable}
  from './firebase-public-time.server';

const SNAPSHOT='a'.repeat(64);
const runtimePath='campaignCloudRuntime/'+SNAPSHOT;
const stagePath='migrationTimeEngineStage/'+SNAPSHOT;
const calendarPath=stagePath+'/calendar/current';

function setup(overrides:Record<string,unknown>={}){
  const map:Record<string,unknown>={
    [runtimePath]:{
      status:'active',private:true,sourceSnapshotId:SNAPSHOT,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      publicTimeApproved:true,publishedTimeVersion:4,calendarVersion:4,
      privateSecret:'private runtime data',
    },
    [stagePath]:{status:'complete',private:true,privateValue:'not public'},
    [calendarPath]:{
      year:1522,month:0,day:11,festival:null,version:4,
      updatedBy:'private uid',houseEconomies:[{houseId:'secret',money:99}],
    },
    ...overrides,
  };
  const reads:string[]=[];
  const doc=(path:string):any=>({
    get:async()=>{
      reads.push(path);
      const v=map[path];
      return {exists:v!==undefined&&v!==null,data:()=>v};
    },
    collection:(name:string)=>({
      doc:(id:string)=>doc(path+'/'+name+'/'+id),
    }),
  });
  const db={collection:(name:string)=>({
    doc:(id:string)=>doc(name+'/'+id),
  })} as unknown as Firestore;
  const read=(args:Partial<Parameters<typeof readApprovedFirebasePublicTime>[0]>={})=>
    readApprovedFirebasePublicTime({
      db,snapshotId:SNAPSHOT,projectId:'cormyr',enabled:true,
      env:{},...args,
    });
  return {read,reads,map};
}

describe('Firebase Cloud — tempo público sem Supabase',()=>{
  it('retorna somente os oito campos publicados e nunca dados da Casa',async()=>{
    const s=setup();
    const result=await s.read();
    expect(result).toEqual({
      year:1522,month:0,day:11,festival:null,version:4,
      date:'1522-01-11',period:'2ª désdia · Hammer · 1522 CV',
      label:'11 de Hammer · 1522 CV',
    });
    expect(s.reads).toEqual([runtimePath,stagePath,calendarPath]);
    const json=JSON.stringify(result);
    expect(json).not.toContain('private');
    expect(json).not.toContain('secret');
    expect(json).not.toContain(SNAPSHOT);
  });

  it('serve dia 21 e 3ª désdia usando a versão operacional publicada, sem alterar arquivo histórico',async()=>{
    const baseline=setup();
    const controls={...(baseline.map[runtimePath] as Record<string,unknown>),
      calendarSource:'operational',
      calendar:{year:1522,month:0,day:21,festival:null,version:5},
      calendarVersion:5,publishedTimeVersion:5,
    };
    const s=setup({[runtimePath]:controls});
    const result=await s.read();
    expect(result.date).toBe('1522-01-21');
    expect(result.period).toBe('3ª désdia · Hammer · 1522 CV');
    expect(result.version).toBe(5);
    expect((s.map[calendarPath] as {day:number}).day).toBe(11);
    expect(s.reads).toEqual([runtimePath,stagePath,calendarPath]);
  });
  it('nunca consulta Firestore com a flag desligada ou snapshot inválido',async()=>{
    const s=setup();
    const args=[
      {enabled:false},{projectId:'wrong'},
      {snapshotId:'../private'},{snapshotId:''},
      {env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'}},
      {env:{FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'}},
    ];
    for(const arg of args){
      await expect(s.read(arg)).rejects.toBeInstanceOf(
        PublicFirebaseTimeUnavailable);
    }
    expect(s.reads).toEqual([]);
  });

  it('não publica calendário com runtime incompleto ou sem aprovação separada',async()=>{
    const fields=[
      ['status','pending'],['private',false],
      ['sourceSnapshotId','b'.repeat(64)],
      ['sourceSnapshotReconciled',false],
      ['applicationEnabled',false],['publicTimeApproved',false],
      ['publicTimeApproved',undefined],
      ['publishedTimeVersion',0],['publishedTimeVersion',4.2],
      ['calendarVersion',5],
    ] as const;
    for(const [key,value] of fields){
      const base=setup();
      const controls={...(base.map[runtimePath] as Record<string,unknown>),
        [key]:value};
      const s=setup({[runtimePath]:controls});
      await expect(s.read()).rejects.toBeInstanceOf(PublicFirebaseTimeUnavailable);
      expect(s.reads).toEqual([runtimePath]);
    }
  });

  it('rejeita estágio histórico ausente, incompleto ou não privado',async()=>{
    for(const change of [
      null,{status:'pending',private:true},
      {status:'complete',private:false},
    ]){
      const s=setup({[stagePath]:change});
      await expect(s.read()).rejects.toBeInstanceOf(PublicFirebaseTimeUnavailable);
      expect(s.reads).toEqual([runtimePath,stagePath]);
    }
  });

  it('rejeita versão diferente, data inválida ou calendário ausente',async()=>{
    for(const record of [
      null,{year:1522,month:0,day:11,festival:null,version:3},
      {year:1522,month:12,day:11,festival:null,version:4},
      {year:1522,month:0,day:31,festival:null,version:4},
      {year:1522,month:0,day:11,festival:'shieldmeet',version:4},
    ]){
      const s=setup({[calendarPath]:record});
      await expect(s.read()).rejects.toBeInstanceOf(PublicFirebaseTimeUnavailable);
    }
  });

  it('não confunde stage completo com autorização para publicação',async()=>{
    const s=setup({[runtimePath]:null});
    await expect(s.read()).rejects.toBeInstanceOf(PublicFirebaseTimeUnavailable);
    expect(s.reads).toEqual([runtimePath]);
  });
});
