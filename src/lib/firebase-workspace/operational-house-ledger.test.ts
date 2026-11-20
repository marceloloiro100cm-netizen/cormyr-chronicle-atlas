import {describe,it,expect} from 'vitest';
import {mergeHouseLedger} from './operational-house-ledger';
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
});
