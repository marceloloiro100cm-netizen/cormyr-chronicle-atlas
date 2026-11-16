import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {findItem} from './catalog';
import {purchase} from './engine';
import {previewHouseConstruction} from './firebase-construction-quote';
import {newHouseState} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {
  verifyConstructionEconomicReplay,CONSTRUCTION_ECONOMIC_REPLAY_LIMIT,
} from './firebase-construction-economic-replay';
import {verifyConstructionLedger} from './firebase-construction-ledger-verification';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function fixture(){
  const source=newHouseState('house-a','Ferlin',1522*12+1);
  source.phase='active';source.method='import';
  for(const key of Object.keys(source.base) as (keyof typeof source.base)[])
    source.base[key]=200;
  source.domains=[{id:'d1',name:'Vale',terrain:'plains',features:[],notes:''}];
  const item=findItem('tower');
  if(!item)throw Error('catalog tower missing');
  const uid='narrator-1',requestKey='key_12345678',name='Torre de Vigilância';
  const id=hash('construction-purchase:'+uid+':'+requestKey);
  const holdingId=hash('construction-holding:'+id);
  const dice=Array(item.duration.dice??0).fill(2) as number[];
  const quote=previewHouseConstruction(source,{
    houseId:'house-a',itemId:'tower',domainId:'d1',
  },'Evenhand',3);
  if(!quote.purchaseEligibleByRules)throw Error('invalid fixture quote');
  const final=JSON.parse(JSON.stringify(purchase(source,item,{
    id:holdingId,domainId:'d1',name,dice,
  })));
  const event={
    id,action:'purchase',actorUid:uid,houseId:'house-a',
    sourceSnapshotId:'a'.repeat(64),requestKey,
    requestFingerprint:constructionStateHash({
      uid,requestKey,houseId:'house-a',expectedVersion:0,
      itemId:'tower',domainId:'d1',name,
    }),
    holdingId,itemId:'tower',domainId:'d1',
    expectedVersion:0,version:1,sourceSheetVersion:3,
    sourceStateHash:constructionStateHash(source),
    beforeStateHash:constructionStateHash(source),
    afterStateHash:constructionStateHash(final),
    costs:quote.costs,dice,campaignDate:'1522-02-10',
    createdAt:'2026-11-16T12:00:00.000Z',
    replaySchemaVersion:1,catalogVersion:item.version,
    replayInput:{name},
  };
  const doc=(value:Record<string,unknown>=event)=>({
    id:value['id'] as string,data:()=>value,
  });
  const context=(changes:Record<string,unknown>={})=>({
    sourceState:source,operationalState:final,
    houseId:'house-a',houseName:'Evenhand',
    sourceSheetVersion:3,ledgerVerified:true,...changes,
  });
  return {event,source,final,doc,context};
}
describe('Firebase — replay canônico privado das construções',()=>{
  it('reproduz a compra legítima desde a ficha histórica sem alterar fonte',()=>{
    const f=fixture();
    const before=structuredClone(f.source);
    const after=structuredClone(f.final);
    const row=f.doc();
    const v=verifyConstructionLedger([row],{
      houseId:'house-a',snapshotId:'a'.repeat(64),sourceSheetVersion:3,
      sourceHash:constructionStateHash(f.source),
      currentHash:constructionStateHash(f.final),operationalVersion:1,
      lastConstructionEventId:f.event.id,
    });
    expect(v.verifiedHashChain).toBe(true);
    const result=verifyConstructionEconomicReplay([row],f.context({
      ledgerVerified:v.verifiedHashChain,
    }));
    expect(result.status).toBe('verified_purchase_replay');
    expect(result.economicReplayVerified).toBe(true);
    expect(result.purchaseEventsReplayed).toBe(1);
    expect(result.readyForCutover).toBe(false);
    expect(JSON.stringify(result)).not.toContain('narrator-1');
    expect(JSON.stringify(result)).not.toContain('key_12345678');
    expect(f.source).toEqual(before);
    expect(f.final).toEqual(after);
  });
  it('confirma a ausência de eventos com versão zero e estado original',()=>{
    const f=fixture();
    const r=verifyConstructionEconomicReplay([],f.context({
      operationalState:f.source,
    }));
    expect(r.status).toBe('verified_purchase_replay');
    expect(r.purchaseEventsReplayed).toBe(0);
    expect(r.readyForCutover).toBe(false);
  });
  it('não inventa parâmetros ausentes em compras antigas',()=>{
    const f=fixture();
    const old={...f.event};
    const record=old as Record<string,unknown>;
    delete record['replayInput'];delete record['replaySchemaVersion'];
    const result=verifyConstructionEconomicReplay([f.doc(record)],f.context());
    expect(result.status).toBe('legacy_inputs_missing');
    expect(result.economicReplayVerified).toBe(false);
  });
  it('nega replay se a cadeia de hashes não passou',()=>{
    const f=fixture();
    expect(verifyConstructionEconomicReplay([f.doc()],f.context({
      ledgerVerified:false,
    })).status).toBe('hash_chain_not_verified');
  });
  it('rejeita parâmetros adulterados e fingerprint incompatível',()=>{
    const f=fixture();
    for(const value of [
      {name:'Torre adulterada'},
      {name:'Torre de Vigilância',parentId:'other-domain'},
      {name:'Torre de Vigilância',unused:'do-not-trust'},
      {name:' '},
    ]){
      const replayInput=value;
      const status=verifyConstructionEconomicReplay([
        f.doc({...f.event,replayInput}),
      ],f.context()).status;
      expect(status==='invalid_replay_inputs'||
        status==='request_fingerprint_mismatch').toBe(true);
    }
  });
  it('detecta alteração dos custos registrados, catálogo e estado final',()=>{
    const f=fixture();
    expect(verifyConstructionEconomicReplay([
      f.doc({...f.event,costs:[{
        resource:'defense',amount:99,mode:'allocation',
      }]}),
    ],f.context()).status).toBe('recorded_cost_mismatch');
    expect(verifyConstructionEconomicReplay([
      f.doc({...f.event,catalogVersion:'historical-unsupported'}),
    ],f.context()).status).toBe('catalog_version_changed');
    expect(verifyConstructionEconomicReplay([
      f.doc({...f.event,afterStateHash:'f'.repeat(64)}),
    ],f.context()).status).toBe('replayed_state_mismatch');
    const different=structuredClone(f.final);
    different.identity.notes='modified without audit event';
    expect(verifyConstructionEconomicReplay([f.doc()],f.context({
      operationalState:different,
    })).status).toBe('final_state_mismatch');
  });
  it('falha fechada para eventos além do limite operacional',()=>{
    const f=fixture();
    const excess=Array.from({length:CONSTRUCTION_ECONOMIC_REPLAY_LIMIT+1},
      ()=>f.doc());
    const result=verifyConstructionEconomicReplay(excess,f.context());
    expect(result.status).toBe('replay_limit_exceeded');
    expect(result.economicReplayVerified).toBe(false);
  });
});
