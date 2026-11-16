import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {newHouseState,type HouseState} from './types';
import {findItem} from './catalog';
import {purchase} from './engine';
import {previewHouseConstruction} from './firebase-construction-quote';
import {constructionStateHash} from './firebase-construction-transaction';
import {replayConstructionEconomy,MAX_ECONOMIC_REPLAY_EVENTS}
  from './firebase-construction-economic-replay';

const id=(v:string)=>createHash('sha256').update(v).digest('hex');
const snapshot='c'.repeat(64),actorUid='narrator-1';
const req={
  requestKey:'request-1234567',houseId:'house-a',
  expectedVersion:0,itemId:'tower',domainId:'d1',
  name:'Torre de Vigilância',
};
const eventId=id('construction-purchase:'+actorUid+':'+req.requestKey);
const holdingId=id('construction-holding:'+eventId);
function fixture(){
  const source=newHouseState('house-a','Ferlin',1522*12+1);
  source.phase='active';source.method='import';
  for(const k of Object.keys(source.base) as (keyof HouseState['base'])[])
    source.base[k]=200;
  source.domains=[{id:'d1',name:'Vale',terrain:'plains',features:[],notes:''}];
  const item=findItem('tower');
  if(!item)throw Error('catalog item missing');
  const dice=Array(item.duration.dice??0).fill(2) as number[];
  const quote=previewHouseConstruction(source,{
    houseId:req.houseId,itemId:req.itemId,domainId:req.domainId,
  },'Evenhand',3);
  const result=purchase(source,item,{
    id:holdingId,domainId:req.domainId,
    name:req.name,dice,
  });
  const operational=JSON.parse(JSON.stringify(result)) as HouseState;
  const oldHash=constructionStateHash(source);
  const currentHash=constructionStateHash(operational);
  const audit={
    id:eventId,action:'purchase',actorUid,requestKey:req.requestKey,
    requestFingerprint:constructionStateHash({uid:actorUid,...req}),
    holdingId,itemId:'tower',domainId:'d1',
    houseId:'house-a',sourceSnapshotId:snapshot,
    sourceSheetVersion:3,sourceStateHash:oldHash,
    beforeStateHash:oldHash,afterStateHash:currentHash,
    version:1,expectedVersion:0,costs:quote.costs,dice,
    campaignDate:'1522-02-10',createdAt:'2026-11-16T12:00:00.000Z',
    replaySchemaVersion:1,catalogRuleVersion:item.version,
    purchaseInput:{...req},
  };
  const context={
    houseId:'house-a',snapshotId:snapshot,houseName:'Evenhand',
    sourceSheetVersion:3,sourceState:source,
    operationalState:operational,operationalVersion:1,
    lastConstructionEventId:eventId,
  };
  const doc=(event:Record<string,unknown>=audit)=>({
    id:eventId,data:()=>structuredClone(event),
  });
  return {source,audit,context,doc,item,quote,operational};
}
describe('Firebase: replay econômico somente leitura',()=>{
  it('reexecuta a compra real com dados da auditoria sem alterar o estado',()=>{
    const f=fixture(),original=structuredClone(f.context);
    const result=replayConstructionEconomy([f.doc()],f.context);
    expect(result).toEqual({
      status:'verified',economicReplayVerified:true,
      eventsTotal:1,replayedEvents:1,readOnly:true,readyForCutover:false,
    });
    expect(f.context).toEqual(original);
    expect(JSON.stringify(result)).not.toContain('narrator-1');
    expect(JSON.stringify(result)).not.toContain('request');
    expect(JSON.stringify(result)).not.toContain('Torre');
  });
  it('seed sem compras reproduz identidade do estado e não libera cutover',()=>{
    const f=fixture();
    const context={...f.context,operationalState:f.source,
      operationalVersion:0,lastConstructionEventId:null};
    expect(replayConstructionEconomy([],context)).toEqual({
      status:'verified',economicReplayVerified:true,
      eventsTotal:0,replayedEvents:0,readOnly:true,readyForCutover:false,
    });
  });
  it('eventos legados sem parâmetros não recebem selo de replay',()=>{
    const f=fixture();
    const legacy={...f.audit};
    delete (legacy as Partial<typeof legacy>).purchaseInput;
    const result=replayConstructionEconomy([f.doc(legacy)],f.context);
    expect(result.status).toBe('missing_replay_metadata');
    expect(result.economicReplayVerified).toBe(false);
    expect(result.replayedEvents).toBe(0);
  });
  it('exige fingerprint fiel ao pedido original, não apenas à cadeia de hash',()=>{
    const f=fixture();
    const altered={...f.audit,purchaseInput:{...req,name:'Torre adulterada'}};
    const result=replayConstructionEconomy([f.doc(altered)],f.context);
    expect(result.status).toBe('request_fingerprint_mismatch');
  });
  it('rejeita campos divergentes da compra e versões de regras alteradas',()=>{
    const f=fixture();
    for(const event of [
      {...f.audit,purchaseInput:{...req,itemId:'other'}},
      {...f.audit,purchaseInput:{...req,expectedVersion:9}},
      {...f.audit,purchaseInput:{...req,parentId:'../foreign'}},
      {...f.audit,replaySchemaVersion:2},
    ]){
      expect(replayConstructionEconomy([f.doc(event)],f.context).status)
        .toBe('event_payload_invalid');
    }
    expect(replayConstructionEconomy([f.doc({
      ...f.audit,catalogRuleVersion:'outdated',
    })],f.context).status).toBe('catalog_version_changed');
  });
  it('rejeita divergência no custo mesmo com hashes de estados coerentes',()=>{
    const f=fixture();
    const costs=[{resource:'defense',amount:1,mode:'allocation'}];
    const result=replayConstructionEconomy([f.doc({...f.audit,costs})],f.context);
    expect(result.status).toBe('quote_mismatch');
  });
  it('detecta estado inventado que mantém o encadeamento criptográfico',()=>{
    const f=fixture();
    const altered=structuredClone(f.operational);
    altered.identity.notes='Alteração não reproduzida pela compra';
    const alteredHash=constructionStateHash(altered);
    const event={...f.audit,afterStateHash:alteredHash};
    const context={...f.context,operationalState:altered};
    expect(replayConstructionEconomy([f.doc(event)],context).status)
      .toBe('replay_state_mismatch');
  });
  it('rejeita evento ausente, extra ou hash de estado divergente antes do replay',()=>{
    const f=fixture();
    expect(replayConstructionEconomy([],f.context).status)
      .toBe('hash_chain_unverified');
    expect(replayConstructionEconomy([f.doc()],{
      ...f.context,lastConstructionEventId:'f'.repeat(64),
    }).status).toBe('hash_chain_unverified');
    expect(replayConstructionEconomy([f.doc()],{
      ...f.context,operationalVersion:2,
    }).status).toBe('hash_chain_unverified');
  });
  it('limita replay administrativo sem processar eventos nem afirmar sucesso',()=>{
    const f=fixture();
    const rows=Array.from({length:MAX_ECONOMIC_REPLAY_EVENTS+1},
      ()=>f.doc());
    const before=structuredClone(f.context);
    const report=replayConstructionEconomy(rows,{
      ...f.context,operationalVersion:rows.length,
    });
    expect(report).toEqual({
      status:'replay_limit_exceeded',
      economicReplayVerified:false,eventsTotal:rows.length,
      replayedEvents:0,readyForCutover:false,readOnly:true,
    });
    expect(f.context).toEqual(before);
    const single=replayConstructionEconomy([f.doc()],{
      ...f.context,operationalVersion:MAX_ECONOMIC_REPLAY_EVENTS+1,
    });
    expect(single.status).toBe('replay_limit_exceeded');
  });
  it('rejeita estado histórico não validado, nunca altera ou normaliza dados',()=>{
    const f=fixture();
    expect(replayConstructionEconomy([f.doc()],{
      ...f.context,sourceState:{houseId:'house-a'},
    }).status).toBe('source_invalid');
    expect(replayConstructionEconomy([f.doc()],{
      ...f.context,operationalState:{houseId:'house-a'},
    }).status).toBe('source_invalid');
  });
});
