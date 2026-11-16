import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {readApprovedFirebaseHouseCatalog,PublicFirebaseCatalogUnavailable}
  from './firebase-public-house-catalog.server';

const SNAPSHOT='a'.repeat(64);
const runtime='campaignCloudRuntime/'+SNAPSHOT;
const spy='migrationSpyStage/'+SNAPSHOT;
const domain='migrationDomainStage/'+SNAPSHOT;
const spyCatalog=spy+'/catalog';
const domainHouses=domain+'/houses';
const baseCatalog=[
  {id:'h-a',name:'Casa A',region:'Ferlin',classification:'noble',
    publicReviewed:true,privateLedger:{money:1000},narrativeText:'PRIVATE'},
  {id:'h-b',name:'Casa B',region:'Horselands',classification:'major',
    publicReviewed:true,secretUid:'UID_SHOULD_NOT_APPEAR'},
  {id:'h-hidden',name:'Casa Secreta',region:null,classification:'noble',
    publicReviewed:false,privateNote:'NEVER_VISIBLE'},
];
const baseHouses=[
  {sourceId:'h-a',name:'Casa A',season:2,active:true,uid:'PRIVATE'},
  {sourceId:'h-b',name:'Casa B',season:1,active:true},
];

function setup({
  runtimeData={},
  spyRoot={},
  domainRoot={},
  catalog=baseCatalog,
  houses=baseHouses,
  missing=[],
}:{
  runtimeData?:Record<string,unknown>;
  spyRoot?:Record<string,unknown>;
  domainRoot?:Record<string,unknown>;
  catalog?:Array<Record<string,unknown>>;
  houses?:Array<Record<string,unknown>>;
  missing?:string[];
}={}){
  const docs:Record<string,Record<string,unknown>>={
    [runtime]:{
      status:'active',private:true,sourceSnapshotId:SNAPSHOT,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      publicCatalogApproved:true,publicCatalogVersion:1,
      publicCatalogExpectedReviewedCount:2,
      publicCatalogExpectedPlayerHouseCount:1,
      publicCatalogPlayerHouseIds:['h-a'],hiddenSecret:'PRIVATE_DOC',
      ...runtimeData,
    },
    [spy]:{status:'complete',private:true,
      counts:{catalog:catalog.length},...spyRoot},
    [domain]:{status:'complete',private:true,
      counts:{houses:houses.length},...domainRoot},
  };
  const reads:string[]=[];
  const makeDoc=(path:string):any=>({
    get:async()=>{
      reads.push(path);
      const value=missing.includes(path)?undefined:docs[path];
      return {exists:value!==undefined,data:()=>value};
    },
    collection:(id:string)=>makeCollection(path+'/'+id),
    set:()=>{throw Error('writes forbidden');},
  });
  const makeCollection=(path:string)=>({
    doc:(id:string)=>makeDoc(path+'/'+id),
    limit:(limit:number)=>({
      get:async()=>{
        reads.push(path+'?limit='+limit);
        const items=path===spyCatalog?catalog:path===domainHouses?houses:[];
        const result=items.slice(0,limit).map((data,index)=>({
          id:typeof data['id']==='string'?data['id']:
            typeof data['sourceId']==='string'?data['sourceId']:String(index),
          data:()=>data,
        }));
        return {size:result.length,docs:result};
      },
    }),
  });
  const db={collection:(name:string)=>makeCollection(name)} as unknown as Firestore;
  const read=(change:Partial<Parameters<typeof readApprovedFirebaseHouseCatalog>[0]>={})=>
    readApprovedFirebaseHouseCatalog({
      db,snapshotId:SNAPSHOT,projectId:'cormyr',enabled:true,env:{},
      ...change,
    });
  return {db,read,reads};
}
const blocked=async (read:()=>Promise<unknown>)=>
  expect(read()).rejects.toBeInstanceOf(PublicFirebaseCatalogUnavailable);

describe('Firebase Cloud: catálogo público somente depois de revisão e aprovação',()=>{
  it('devolve apenas campos aprovados, sem UIDs, notas, galerias ou conteúdo inventado',async()=>{
    const s=setup();
    const result=await s.read();
    expect(result).toEqual({
      houses:[
        {id:'h-a',name:'Casa A',region:'Ferlin',classification:'noble',
          updated_at:null,gallery:[],narrative_text:null},
        {id:'h-b',name:'Casa B',region:'Horselands',classification:'major',
          updated_at:null,gallery:[],narrative_text:null},
      ],
      playerHouses:[{house_id:'h-a'}],
    });
    expect(s.reads).toContain(spyCatalog+'?limit=251');
    expect(s.reads).toContain(domainHouses+'?limit=251');
    const json=JSON.stringify(result);
    for(const text of ['PRIVATE','UID_SHOULD_NOT_APPEAR','NEVER_VISIBLE',
      SNAPSHOT,'privateLedger','Casa Secreta'])
      expect(json).not.toContain(text);
  });
  it('não faz nenhuma consulta se desabilitado, fora do projeto ou emulador',async()=>{
    const s=setup();
    for(const input of [
      {enabled:false},{projectId:'other'},{snapshotId:'invalid'},
      {env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'}},
      {env:{FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'}},
    ])await blocked(()=>s.read(input));
    expect(s.reads).toEqual([]);
  });
  it('bloqueia sem publicação explicitamente reconciliada e contagens confiáveis',async()=>{
    const invalid=[
      ['status','pending'],['private',false],
      ['sourceSnapshotId','b'.repeat(64)],
      ['sourceSnapshotReconciled',false],['applicationEnabled',false],
      ['publicCatalogApproved',false],['publicCatalogApproved',undefined],
      ['publicCatalogVersion',0],['publicCatalogVersion',1.5],
      ['publicCatalogExpectedReviewedCount',0],
      ['publicCatalogExpectedReviewedCount',3],
      ['publicCatalogExpectedPlayerHouseCount',0],
      ['publicCatalogExpectedPlayerHouseCount',2],
      ['publicCatalogPlayerHouseIds',['h-a','h-a']],
      ['publicCatalogPlayerHouseIds',['h-hidden']],
      ['publicCatalogPlayerHouseIds',['espiao']],
      ['publicCatalogPlayerHouseIds',['../secret']],
    ] as const;
    for(const [key,value] of invalid){
      const s=setup({runtimeData:{[key]:value}});
      await blocked(s.read);
      // Local validation can stop immediately for invalid approval metadata.
      // Plausible published counts or House IDs need a private read to be
      // rejected against the actual imported source; no data is returned.
      const requiresSourceCrossCheck=
        (key==='publicCatalogExpectedReviewedCount'&&value===3)||
        (key==='publicCatalogPlayerHouseIds'&&
          Array.isArray(value)&&value.includes('h-hidden'));
      if(!requiresSourceCrossCheck)expect(s.reads).toEqual([runtime]);
      else expect(s.reads[0]).toBe(runtime);
    }
  });
  it('recusa etapas históricas incompletas, incomparáveis ou ausentes',async()=>{
    for(const opts of [
      {spyRoot:{status:'pending'}},
      {spyRoot:{private:false}},
      {domainRoot:{status:'pending'}},
      {domainRoot:{private:false}},
      {spyRoot:{counts:{catalog:4}}},
      {domainRoot:{counts:{houses:300}}},
      {missing:[spy]},{missing:[domain]},
    ]){
      const s=setup(opts);
      await blocked(s.read);
      // An incorrect *but plausible* source count is discovered after
      // bounded collection reads; missing/incomplete roots stop sooner.
      if('spyRoot' in opts&&'counts' in (opts.spyRoot??{}))
        expect(s.reads).toContain(spyCatalog+'?limit=251');
      else expect(s.reads).not.toContain(spyCatalog+'?limit=251');
    }
  });
  it('recusa documentos duplicados, alterados, não revisados ou conteúdo malformado',async()=>{
    for(const catalog of [
      [baseCatalog[0]!,baseCatalog[0]!,baseCatalog[2]!],
      [{...baseCatalog[0],publicReviewed:false},baseCatalog[1]!,baseCatalog[2]!],
      [{...baseCatalog[0],publicReviewed:'true'},baseCatalog[1]!,baseCatalog[2]!],
      [{...baseCatalog[0],id:'bad/path'},baseCatalog[1]!,baseCatalog[2]!],
      [{...baseCatalog[0],classification:'admin'},baseCatalog[1]!,baseCatalog[2]!],
      [{...baseCatalog[0],name:'<script>\n</script>'},baseCatalog[1]!,baseCatalog[2]!],
    ]){
      const s=setup({catalog});
      await blocked(s.read);
    }
  });
  it('não divulga afiliação incorreta a jogador, temporada ou Casa não aprovada',async()=>{
    for(const opts of [
      {runtimeData:{publicCatalogPlayerHouseIds:['h-b']}},
      {runtimeData:{publicCatalogPlayerHouseIds:['h-hidden']}},
      {houses:[{...baseHouses[0],active:false},baseHouses[1]!]},
      {houses:[{...baseHouses[0],season:1},baseHouses[1]!]},
      {houses:[{...baseHouses[0],sourceId:'other'},baseHouses[1]!]},
    ]){
      const s=setup(opts);
      await blocked(s.read);
    }
  });
  it('recusa estágio truncado em 251 documentos sem retornar lista parcial',async()=>{
    const catalog=Array.from({length:251},(_,i)=>({
      id:'h-'+i,name:'Casa '+i,region:'Ferlin',
      classification:'noble',publicReviewed:i<2,
    }));
    const s=setup({catalog});
    await blocked(s.read);
    expect(s.reads).not.toContain(spyCatalog+'?limit=251');
  });
});
