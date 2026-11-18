import {describe,expect,it} from 'vitest';
import type {Firestore} from 'firebase-admin/firestore';
import {
  PublicFirebaseContentUnavailable,readApprovedFirebasePublicCatalog,
  readApprovedFirebasePublicTranslations,
} from './firebase-public-content.server';

const HASH='a'.repeat(64);
const runtime='campaignCloudRuntime/'+HASH;
const stage='migrationPublicContentStage/'+HASH;
const catalog=stage+'/catalog/published';
const en=stage+'/translations/en';

const goodHouse={
  id:'hA',name:'Evenhand',region:'Helmlands',classification:'Major',
  updated_at:null,gallery:['/assets/evenhand.png'],
  narrative_text:'Casa nobre',season:2,active:true,publicReviewed:true,
  treasury:999,privateNotes:'SUPER_SECRET_HOUSE_NOTE',
};
const goodRows=[
  {entity_type:'region',entity_id:'Helmlands',field_name:'description',
    translated_text:'Helmlands translated',publicReviewed:true,
    privateNote:'SUPER_SECRET'},
  {entity_type:'house',entity_id:'hA',field_name:'name',
    translated_text:'Evenhand translated',publicReviewed:true},
];
function fixture(overrides:Record<string,unknown>={}){
  const docs:Record<string,unknown>={
    [runtime]:{
      status:'active',private:true,sourceSnapshotId:HASH,
      sourceSnapshotReconciled:true,applicationEnabled:true,
      publicCatalogApproved:true,publishedCatalogVersion:3,catalogVersion:3,
      publicTranslationsApproved:true,publishedTranslationsVersion:2,
      translationsVersion:2,sourceSecret:'PRIVATE_RUNTIME_VALUE',
    },
    [stage]:{status:'complete',private:true,sourceSnapshotId:HASH,
      publicReviewApproved:true,reviewDigest:'b'.repeat(64),
      catalogVersion:3,translationsVersion:2},
    [catalog]:{version:3,houses:[goodHouse],playerHouses:[{house_id:'hA'}]},
    [en]:{version:2,locale:'en',rows:goodRows},
    ...overrides,
  };
  const reads:string[]=[];
  const doc=(path:string):any=>({
    get:async()=>{
      reads.push(path);
      return {exists:docs[path]!=null,data:()=>docs[path]};
    },
    collection:(name:string)=>({doc:(id:string)=>doc(path+'/'+name+'/'+id)}),
  });
  const fakeDb={collection:(name:string)=>({
    doc:(id:string)=>doc(name+'/'+id),
  })};
  const db=fakeDb as unknown as Firestore;
  const opts={db,projectId:'cormyr',snapshotId:HASH,enabled:true,env:{}};
  return {
    opts,reads,docs,
    getCatalog:(changes:Partial<typeof opts>={})=>
      readApprovedFirebasePublicCatalog({...opts,...changes}),
    getTranslations:(locale='en',changes:Partial<typeof opts>={})=>
      readApprovedFirebasePublicTranslations({...opts,...changes,locale}),
  };
}
const denied=(p:Promise<unknown>)=>
  expect(p).rejects.toBeInstanceOf(PublicFirebaseContentUnavailable);

describe('Firebase-only catálogo público com publicação independente',()=>{
  it('projeta campos mínimos sem notas ou saldos das Casas',async()=>{
    const f=fixture();
    const result=await f.getCatalog();
    expect(result).toEqual({houses:[{
      id:'hA',name:'Evenhand',region:'Helmlands',classification:'Major',
      updated_at:null,gallery:['/assets/evenhand.png'],narrative_text:'Casa nobre',
    }],playerHouses:[{house_id:'hA'}]});
    expect(f.reads).toEqual([runtime,stage,catalog]);
    const output=JSON.stringify(result);
    for(const bad of ['SUPER_SECRET','treasury','private','sourceSnapshotId',HASH])
      expect(output).not.toContain(bad);
  });
  it('não consulta nenhum dado se flag, projeto, snapshot ou ambiente falharem',async()=>{
    const f=fixture();
    for(const changes of [
      {enabled:false},{projectId:'not-cormyr'},
      {snapshotId:'bad'},{snapshotId:''},
      {env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'}},
      {env:{FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'}},
    ])await denied(f.getCatalog(changes));
    expect(f.reads).toEqual([]);
  });
  it('não autoriza release implícito da etapa de migração',async()=>{
    const keys=[
      ['status','pending'],['private',false],
      ['sourceSnapshotId','b'.repeat(64)],
      ['sourceSnapshotReconciled',false],
      ['applicationEnabled',false],
      ['publicCatalogApproved',false],['publicCatalogApproved',undefined],
      ['publishedCatalogVersion',0],
      ['publishedCatalogVersion',4],['catalogVersion',4],
    ] as const;
    for(const [k,v] of keys){
      const f=fixture();
      f.docs[runtime]={...(f.docs[runtime] as object),[k]:v};
      await denied(f.getCatalog());
      expect(f.reads).toEqual([runtime]);
    }
    const missing=fixture({[runtime]:null});
    await denied(missing.getCatalog());
    expect(missing.reads).toEqual([runtime]);
  });
  it('rejeita etapa privada incompleta e versão incoerente',async()=>{
    for(const changes of [
      {[stage]:null},
      {[stage]:{status:'pending',private:true,sourceSnapshotId:HASH}},
      {[stage]:{status:'complete',private:false,sourceSnapshotId:HASH}},
      {[stage]:{status:'complete',private:true,sourceSnapshotId:'other'}},
      {[catalog]:{version:2,houses:[goodHouse],playerHouses:[]}},
    ]){
      const f=fixture(changes);
      await denied(f.getCatalog());
    }
  });
  it('exige revisão editorial e digest do estágio antes de servir dados',async()=>{
    const base={
      status:'complete',private:true,sourceSnapshotId:HASH,
      publicReviewApproved:true,reviewDigest:'b'.repeat(64),
      catalogVersion:3,translationsVersion:2,
    };
    for(const modified of [
      {publicReviewApproved:false},{publicReviewApproved:undefined},
      {reviewDigest:undefined},{reviewDigest:'invalid'},
      {catalogVersion:2},{translationsVersion:1},
    ]){
      const f=fixture({[stage]:{...base,...modified}});
      if(Object.hasOwn(modified,'catalogVersion')||
         Object.hasOwn(modified,'publicReviewApproved')||
         Object.hasOwn(modified,'reviewDigest'))
        await denied(f.getCatalog());
      if(Object.hasOwn(modified,'translationsVersion')||
         Object.hasOwn(modified,'publicReviewApproved')||
         Object.hasOwn(modified,'reviewDigest'))
        await denied(f.getTranslations());
    }
  });
  it('rejeita Casa não revisada, não ativa e IDs de roster estranhos',async()=>{
    for(const change of [
      {publicReviewed:false},{active:false},{season:1},
      {id:'../forbidden'},{name:''},{classification:''},
      {gallery:['javascript:alert(1)']},
      {narrative_text:'X'.repeat(15001)},
    ]){
      const f=fixture({[catalog]:{
        version:3,houses:[{...goodHouse,...change}],
        playerHouses:[],
      }});
      await denied(f.getCatalog());
    }
    for(const playerHouses of [
      [{house_id:'another-house'}],
      [{house_id:'hA'},{house_id:'hA'}],
      [{house_id:'../../unsafe'}],
    ]){
      const f=fixture({[catalog]:{version:3,houses:[goodHouse],playerHouses}});
      await denied(f.getCatalog());
    }
  });
  it('bloqueia documentos acima do limite e catálogos duplicados',async()=>{
    const big={...goodHouse,narrative_text:'Z'.repeat(15000)};
    const f=fixture({[catalog]:{version:3,houses:Array.from({length:50},(_,i)=>({
      ...big,id:'h'+i,name:'Casa '+i,
    })),playerHouses:[]}});
    await denied(f.getCatalog());
    const duplicate=fixture({[catalog]:{version:3,houses:[goodHouse,goodHouse],
      playerHouses:[]}});
    await denied(duplicate.getCatalog());
  });
});

describe('Firebase-only traduções públicas por idioma',()=>{
  it('traduz somente tipos públicos revisados e não repassa metadados',async()=>{
    const f=fixture();
    const result=await f.getTranslations('en');
    expect(result).toEqual({translations:{
      'region:Helmlands:description':'Helmlands translated',
      'house:hA:name':'Evenhand translated',
    }});
    expect(f.reads).toEqual([runtime,stage,en,runtime,stage,catalog]);
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET');
  });
  it('rejeita locale estranho antes de leitura ou consulta arbitrária',async()=>{
    const f=fixture();
    for(const locale of ['pt','fr','../private','en/../de','','EN']){
      await denied(f.getTranslations(locale));
    }
    expect(f.reads).toEqual([]);
  });
  it('rejeita versão, localização ou aprovação divergentes',async()=>{
    for(const change of [
      ['publicTranslationsApproved',false],
      ['publishedTranslationsVersion',3],
      ['translationsVersion',3],
    ] as const){
      const f=fixture();
      f.docs[runtime]={...(f.docs[runtime] as object),[change[0]]:change[1]};
      await denied(f.getTranslations());
    }
    for(const data of [
      null,
      {version:2,locale:'fr',rows:goodRows},
      {version:4,locale:'en',rows:goodRows},
      {version:2,locale:'en',rows:'bad'},
    ]){
      const f=fixture({[en]:data});
      await denied(f.getTranslations());
    }
  });
  it('falha se houver entidade privada, entrada não revisada ou duplicação',async()=>{
    for(const rows of [
      [{...goodRows[0],entity_type:'record'}],
      [{...goodRows[0],publicReviewed:false}],
      [{...goodRows[0],field_name:'../../private'}],
      [{...goodRows[0],translated_text:'X'.repeat(12001)}],
      [goodRows[0],goodRows[0]],
    ]){
      const f=fixture({[en]:{version:2,locale:'en',rows}});
      await denied(f.getTranslations());
    }
  });
  it('nunca publica tradução de Casa excluída do catálogo público',async()=>{
    const f=fixture({[en]:{version:2,locale:'en',
      rows:[{...goodRows[1],entity_id:'private-house'}]}});
    await denied(f.getTranslations());
    const noCatalogApproval=fixture();
    noCatalogApproval.docs[runtime]={
      ...(noCatalogApproval.docs[runtime] as object),publicCatalogApproved:false,
    };
    await denied(noCatalogApproval.getTranslations());
  });
  it('pode publicar região revisada sem inferir autorizações de Casa',async()=>{
    const f=fixture({[en]:{version:2,locale:'en',rows:[goodRows[0]]}});
    const result=await f.getTranslations();
    expect(result.translations['region:Helmlands:description'])
      .toBe('Helmlands translated');
    expect(f.reads).toEqual([runtime,stage,en]);
  });
});
