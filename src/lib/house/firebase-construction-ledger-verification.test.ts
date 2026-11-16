import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {
  verifyConstructionLedger,CONSTRUCTION_LEDGER_LIMIT,
} from './firebase-construction-ledger-verification';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const source=hash('source'),after1=hash('after1'),after2=hash('after2');
const context=(change:Record<string,unknown>={})=>({
  houseId:'house-a',snapshotId:'a'.repeat(64),sourceSheetVersion:3,
  sourceHash:source,currentHash:after1,operationalVersion:1,
  lastConstructionEventId:hash('construction-purchase:narrator-1:key_12345678'),
  ...change,
});
const event=(input:Record<string,unknown>={})=>{
  const actorUid='narrator-1',requestKey='key_12345678';
  const id=hash('construction-purchase:'+actorUid+':'+requestKey);
  return {id,action:'purchase',actorUid,requestKey,
    requestFingerprint:hash('request body'),
    holdingId:hash('construction-holding:'+id),
    houseId:'house-a',sourceSnapshotId:'a'.repeat(64),
    sourceSheetVersion:3,sourceStateHash:source,
    beforeStateHash:source,afterStateHash:after1,
    version:1,expectedVersion:0,itemId:'tower',domainId:'d1',
    costs:[{resource:'defense',amount:10,mode:'allocation'}],
    dice:[2,2],campaignDate:'1522-02-10',
    createdAt:'2026-11-16T12:00:00.000Z',...input};
};
const doc=(v:Record<string,unknown>)=>({
  id:v['id'] as string,data:()=>v,
});
describe('Firebase construction ledger — hash chain read-only verifier',()=>{
  it('confirma ledger zero sem eventos e nunca autoriza cutover',()=>{
    const r=verifyConstructionLedger([],
      context({currentHash:source,operationalVersion:0,lastConstructionEventId:null}));
    expect(r.status).toBe('verified_hash_chain');
    expect(r.verifiedHashChain).toBe(true);
    expect(r.economicReplayVerified).toBe(false);
    expect(r.readyForCutover).toBe(false);
    expect(r.eventsTotal).toBe(0);
  });
  it('verifica evento de compra e retorna apenas campos públicos mínimos',()=>{
    const result=verifyConstructionLedger([doc(event())],context());
    expect(result.status).toBe('verified_hash_chain');
    expect(result.entries).toEqual([{
      version:1,itemId:'tower',campaignDate:'1522-02-10',
    }]);
    expect(JSON.stringify(result)).not.toContain('narrator-1');
    expect(JSON.stringify(result)).not.toContain('requestKey');
    expect(JSON.stringify(result)).not.toContain('defense');
    expect(result.auditHistoryVerified).toBe(true);
    expect(result.economicReplayVerified).toBe(false);
  });
  it('não aceita evento de outra Casa, chave adulterada ou ID falsificado',()=>{
    for(const modified of [
      {houseId:'house-b'},{requestKey:'key_different123'},
      {holdingId:'f'.repeat(64)},{actorUid:'intruder'},
      {sourceSnapshotId:'b'.repeat(64)},
    ]){
      expect(verifyConstructionLedger([doc(event(modified))],context()).status)
        .toBe('invalid_event');
    }
  });
  it('não aceita checksum falso, origem divergente ou estado final diferente',()=>{
    expect(verifyConstructionLedger([doc(event({beforeStateHash:after2}))],
      context()).status).toBe('broken_hash_chain');
    expect(verifyConstructionLedger([doc(event())],
      context({currentHash:after2})).status).toBe('end_state_mismatch');
    expect(verifyConstructionLedger([doc(event())],
      context({lastConstructionEventId:after2})).status)
      .toBe('end_state_mismatch');
    expect(verifyConstructionLedger([doc(event({sourceStateHash:after2}))],
      context()).status).toBe('invalid_event');
  });
  it('recusa ausência, evento extra e limite operacional',()=>{
    expect(verifyConstructionLedger([],context()).status)
      .toBe('missing_or_extra_events');
    expect(verifyConstructionLedger([doc(event())],
      context({operationalVersion:0,currentHash:source,lastConstructionEventId:null}))
      .status).toBe('missing_or_extra_events');
    expect(verifyConstructionLedger([],context({
      operationalVersion:CONSTRUCTION_LEDGER_LIMIT+1,
    })).status).toBe('ledger_too_large');
  });
  it('rejeita rolagens, custos, relógios e versões inválidos',()=>{
    for(const modified of [
      {dice:[0]},{dice:Array(13).fill(2)},
      {costs:[{resource:'defense',amount:-1,mode:'allocation'}]},
      {costs:[{resource:'evil',amount:1,mode:'allocation'}]},
      {expectedVersion:5},{version:0},
      {campaignDate:'nonsense'},{createdAt:'not-a-date'},
    ]){
      expect(verifyConstructionLedger([doc(event(modified))],context()).status)
        .toBe('invalid_event');
    }
  });
  it('aceita dois eventos fora de ordem física e exige sequência completa',()=>{
    const second=event({
      requestKey:'key_second123',version:2,expectedVersion:1,
      beforeStateHash:after1,afterStateHash:after2,
    });
    const secondId=hash('construction-purchase:narrator-1:key_second123');
    second.id=secondId;
    second.holdingId=hash('construction-holding:'+secondId);
    const ctx=context({
      operationalVersion:2,currentHash:after2,lastConstructionEventId:secondId,
    });
    expect(verifyConstructionLedger([doc(second),doc(event())],ctx).status)
      .toBe('verified_hash_chain');
    const broken=event({
      requestKey:'key_second123',version:3,expectedVersion:2,
      beforeStateHash:after1,afterStateHash:after2,
      id:secondId,holdingId:hash('construction-holding:'+secondId),
    });
    expect(verifyConstructionLedger([doc(broken),doc(event())],ctx).status)
      .toBe('broken_version_chain');
    expect(verifyConstructionLedger([doc(event()),doc(event())],ctx).status)
      .toBe('invalid_event');
  });
});
