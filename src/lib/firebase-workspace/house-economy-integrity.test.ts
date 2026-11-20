import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {projectVerifiedHouseSheets,HouseEconomyReadError} from './house-economy-integrity';
import {constructionStateHash} from '@/lib/house/firebase-construction-transaction';

const snap='a'.repeat(64);
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const state=(houseId:string)=>({houseId,phase:'active',schemaVersion:1,
 month:18265,base:{wealth:5},holdings:[],projects:[]});
const row=(houseId:string)=>({house_id:houseId,version:3,state:state(houseId)});
const doc=(houseId:string,changes:Record<string,unknown>={})=>{
 const input=state(houseId),hash=constructionStateHash(input);
 return{id:digest('house:'+houseId),data:()=>({
  houseId,status:'active',private:true,sourceSnapshotId:snap,
  sourceReconciled:true,seedVerified:true,sourceSheetVersion:3,
  sourceStateHash:hash,stateHash:hash,version:0,state:input,...changes,
 })};
};

describe('Item 4c: Ficha original e economia operacional íntegra',()=>{
 it('mantém rascunho importado legível sem inventar economia',()=>{
  const archived={...row('house-draft'),
   state:{...state('house-draft'),phase:'draft'}};
  const result=projectVerifiedHouseSheets([archived],[],snap);
  expect(result[0]).toEqual(archived);
  expect(result[0]).not.toHaveProperty('operational');
  expect(result[0]).not.toBe(archived);
 });
 it('aplica economia ativa, sem mudar o snapshot da origem',()=>{
  const imported=row('house-a'),before=structuredClone(imported);
  const result=projectVerifiedHouseSheets([imported],[doc('house-a')],snap);
  expect(result[0]).toMatchObject({house_id:'house-a',version:0,operational:true});
  expect(imported).toEqual(before);
 });
 it.each([
  ['outra Casa',{houseId:'house-b'}],
  ['origem divergente',{sourceStateHash:'f'.repeat(64)}],
  ['versão de origem divergente',{sourceSheetVersion:2}],
  ['snapshot distinto',{sourceSnapshotId:'b'.repeat(64)}],
  ['semeadura não confirmada',{seedVerified:false}],
  ['saldo modificado sem hash',{state:{...state('house-a'),month:18266}}],
  ['status inválido',{status:'pending'}],
  ['arquivo privado inválido',{private:false}],
  ['reconciliação pendente',{sourceReconciled:false}],
 ])('não faz fallback para a origem se existe economia operacional com %s',(_label,changes)=>{
  expect(()=>projectVerifiedHouseSheets([row('house-a')],[doc('house-a',changes)],snap))
   .toThrow(HouseEconomyReadError);
 });
 it('nega duplicação de documentos, sem revelar estado de outra Casa',()=>{
  const a=doc('house-a');
  expect(()=>projectVerifiedHouseSheets([row('house-a')],[a,a],snap))
   .toThrow(HouseEconomyReadError);
 });
 it('ignora a economia de outra Casa ao consultar apenas a ficha autorizada',()=>{
  const original=row('house-a');
  const result=projectVerifiedHouseSheets([original],[doc('house-b')],snap);
  expect(result).toEqual([original]);
 });
});
