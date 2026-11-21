import {describe,it,expect} from 'vitest';
import {mergeHouseLedger,readOperationalHouseLedger} from './operational-house-ledger';
const row=(id:string,house:string,version:number,at:string)=>({
 id,house_id:house,action:'domain_edit',explanation:'Edição validada',
 rule:'Correção do domínio',created_at:at,actor:'player-a',
 version,campaign_month:1522*12+1,
});
describe('Livro-razão Firebase por Casa',()=>{
 it('combina e ordena versões sem alterar histórico',()=>{
  const old=row('old','house-a',1,'2026-11-10T10:00:00Z');
  const newRow=row('new','house-a',2,'2026-11-19T10:00:00Z');
  const original=structuredClone(old);
  const result=mergeHouseLedger([old,newRow],[],'house-a');
  expect(result.map(r=>r['id'])).toEqual(['new','old']);
  expect(old).toEqual(original);
 });
 it('isola Casas e rejeita duplicidade',()=>{
  const first=row('1','house-a',1,'2026-11-10T10:00:00Z');
  const foreign=row('2','house-b',1,'2026-11-19T10:00:00Z');
  expect(mergeHouseLedger([first,foreign],[],'house-a')
   .map(r=>r['id'])).toEqual(['1']);
  expect(()=>mergeHouseLedger([first],[first],'house-a'))
   .toThrow('invalid_house_ledger');
 });
 it('mantém prévia pequena e entrega exportação íntegra, sem truncamento silencioso',()=>{
  const rows=Array.from({length:120},(_,i)=>row(
   'history-'+i,'house-a',i+1,'2026-11-19T10:00:00Z',
  ));
  expect(mergeHouseLedger(rows,[],'house-a')).toHaveLength(100);
  expect(mergeHouseLedger(rows,[],'house-a',1000)).toHaveLength(120);
  expect(()=>mergeHouseLedger(rows,[],'house-a',1001))
   .toThrow('invalid_ledger_limit');
  expect(()=>mergeHouseLedger([...rows,...Array.from({length:881},
   (_,i)=>row('extra-'+i,'house-a',i+121,'2026-11-19T10:00:00Z'))],
   [],'house-a',1000)).toThrow('house_ledger_export_too_large');
 });

});

describe('Leitura privada sem confundir permissão de leitura com escrita',()=>{
 const snapshot='a'.repeat(64);
 const runtime={status:'active',private:true,sourceSnapshotReconciled:true,
  sourceSnapshotId:snapshot,applicationEnabled:true,
  houseOpsWriteApproved:false};
 function dbFor(root:Record<string,unknown>,docs= [{
  id:'op-1',data:()=>({id:'op-1',actorUid:'player-a',
   houseId:'house-a',action:'domain_edit',version:2,
   explanation:'Edição autorizada',rule:'Regra',campaignMonth:18265,
   created_at:'2026-11-20T10:00:00Z'}),
 }]){
  return {collection:()=>({doc:()=>({
   get:async()=>({exists:true,data:()=>root}),
   collection:()=>({limit:()=>({get:async()=>({docs})})}),
  })})};
 }
 it('lê histórico da própria Casa mesmo com novas operações bloqueadas',async()=>{
  const rows=await readOperationalHouseLedger(dbFor(runtime),snapshot,'house-a');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({house_id:'house-a',id:'op-1',version:2});
  expect(await readOperationalHouseLedger(dbFor(runtime),snapshot,'house-b')).toEqual([]);
 });
 it('não abre acesso se a raiz do Firebase não estiver ativa ou reconciliada',async()=>{
  for(const change of [
   {status:'pending'},{private:false},
   {sourceSnapshotReconciled:false},{sourceSnapshotId:'b'.repeat(64)},
   {applicationEnabled:false},
  ]){
   await expect(readOperationalHouseLedger(dbFor({...runtime,...change}),snapshot,'house-a'))
    .rejects.toThrow('house_ops_unavailable');
  }
 });
});
