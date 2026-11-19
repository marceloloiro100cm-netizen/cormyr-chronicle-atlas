import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createFirebaseLetterConsequences} from './firebase-letter-consequences';
import {constructionStateHash} from './firebase-construction-transaction';
const snap='a'.repeat(64);
const h=(s:string)=>createHash('sha256').update(s).digest('hex');
function fakeDb(){
  const data=new Map<string,any>();
  const ref=(path:string):any=>({path,collection:(n:string)=>ref(path+'/'+n),doc:(id:string)=>ref(path+'/'+id),
    limit:()=>({get:async()=>({docs:[...data].filter(([p])=>p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1)
      .map(([p,v])=>({id:p.split('/').at(-1),data:()=>v}))})}),
    get:async()=>({exists:data.has(path),data:()=>data.get(path)})});
  const db:any={collection:(n:string)=>ref(n),async runTransaction(work:any){
    const w:[string,string,any][]=[];
    const tx={get:(r:any)=>r.get(),update:(r:any,v:any)=>w.push(['u',r.path,v]),create:(r:any,v:any)=>w.push(['c',r.path,v]),
      set:(r:any,v:any)=>w.push(['s',r.path,v]),delete:(r:any)=>w.push(['d',r.path,null])};
    const out=await work(tx);
    for(const [op,p,v] of w){
      if(op==='c'&&data.has(p))throw Error('exists');
      if(op==='d')data.delete(p);else data.set(p,op==='u'?{...data.get(p),...v}:v);
    }
    return out;
  }};
  return {db,data};
}
// Minimal canonical state accepted by the engine and validators.
const state=()=>({schemaVersion:1,houseId:'ashkar',phase:'active',method:'import',month:24300,
  identity:{region:'Dragon Coast'},regionalApplied:false,
  base:{defense:20,influence:20,lands:20,law:20,population:20,power:20,wealth:20},
  permanent:{defense:0,influence:0,lands:0,law:0,population:0,power:0,wealth:0},
  domains:[],holdings:[],units:[],projects:[],court:[],fortunes:[],actions:[],importSources:[],pending:[],
  mailConsequences:[]});
function seeded(){
  const f=fakeDb();
  const st=state();
  f.data.set(`campaignCloudRuntime/${snap}/houseEconomies/${h('house:ashkar')}`,{houseId:'ashkar',status:'active',
    seedVerified:true,sourceSnapshotId:snap,version:3,state:st,stateHash:constructionStateHash(st)});
  return {...f,svc:createFirebaseLetterConsequences({db:f.db,snapshotId:snap,now:()=>'2026-11-19T20:00:00Z'})};
}
const eco=(f:any)=>f.data.get(`campaignCloudRuntime/${snap}/houseEconomies/${h('house:ashkar')}`);
describe('consequências de missivas na ficha operacional',()=>{
  it('aplica, impede duplicidade, estorna e mantém o hash da ficha coerente',async()=>{
    const f=seeded();
    const input={actorUid:'gm',letterId:'carta-1',houseId:'ashkar',changes:{wealth:-2,influence:1},
      explanation:'Pedágio cobrado na estrada',key:'consequence-key-1',expectedVersion:3};
    const r=await f.svc.apply(input);
    expect(r).toMatchObject({duplicate:false,version:4});
    expect(eco(f).state.mailConsequences[0]).toMatchObject({letterId:'carta-1',active:true,changes:{wealth:-2,influence:1}});
    expect(eco(f).stateHash).toBe(constructionStateHash(eco(f).state));
    expect((await f.svc.apply(input)).duplicate).toBe(true);
    await expect(f.svc.apply({...input,key:'consequence-key-2',expectedVersion:4})).rejects.toThrow('consequence_already_active');
    await expect(f.svc.reverse({actorUid:'gm',id:r.id,key:'reverse-key-1',expectedVersion:3,reason:'Correção do Narrador'})).rejects.toThrow('house_version_conflict');
    const back=await f.svc.reverse({actorUid:'gm',id:r.id,key:'reverse-key-1',expectedVersion:4,reason:'Correção do Narrador'});
    expect(back.version).toBe(5);
    expect(eco(f).state.mailConsequences[0].active).toBe(false);
    expect((await f.svc.reverse({actorUid:'gm',id:r.id,key:'reverse-key-1',expectedVersion:5,reason:'Correção do Narrador'})).duplicate).toBe(true);
    const list=await f.svc.list();
    expect(list[0]).toMatchObject({letter_id:'carta-1',house_id:'ashkar',active:false});
    expect(JSON.stringify(list)).not.toContain('Pedágio');
  });
  it('recusa Casa não ativada, valores inválidos e justificativa curta',async()=>{
    const f=seeded();
    const base={actorUid:'gm',letterId:'carta-1',houseId:'ashkar',changes:{wealth:-2},explanation:'Evento narrativo',key:'consequence-key-9',expectedVersion:3};
    await expect(f.svc.apply({...base,houseId:'goldfin'})).rejects.toThrow('house_not_activated');
    for(const changes of [{wealth:101},{wealth:1.5},{ouro:1},{wealth:0}])
      await expect(f.svc.apply({...base,changes})).rejects.toThrow('invalid_consequence');
    await expect(f.svc.apply({...base,explanation:'curta'})).rejects.toThrow('invalid_consequence_explanation');
  });
});
