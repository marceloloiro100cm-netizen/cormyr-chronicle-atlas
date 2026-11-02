import {describe,it,expect} from 'vitest';
import {COIN_RATES,COIN_BOOK_REFERENCE,COIN_DENOMINATIONS,
 walletRecordId,emptyCharacterWallet,appendWalletEntry,walletBalance,
 walletHalfVintems,coinEquivalent,serializeCharacterWallet,parseCharacterWallet}
 from '@/lib/character-v2/coins';

const sourceId='00000000-0000-4000-8000-000000000123';
const actorId='00000000-0000-4000-8000-000000000456';
const mk=(id:string,operation:'deposit'|'withdraw',quantity:number,denomination:'dragao'|'gamo'='dragao')=>({
 id,actorId,createdAt:'2026-11-01T00:00:00Z',operation,
 denomination,quantity,note:'Movimentação da campanha',
});
describe('Carteira de moedas de personagem — tabela 7-1',()=>{
 it('converte com exatidão as oito denominações e os valores do livro',()=>{
  expect(COIN_BOOK_REFERENCE).toContain('Tabela 7-1');
  expect(COIN_DENOMINATIONS).toHaveLength(8);
  expect(COIN_RATES.dragao).toBe(23520);
  expect(COIN_RATES.gamo).toBe(112);
  expect(COIN_RATES.vintem).toBe(2);
  expect(coinEquivalent(1,'dragao','gamo')).toBe(210);
  expect(coinEquivalent(1,'dragao','vintem')).toBe(11760);
  expect(coinEquivalent(1,'lua','gamo')).toBe(7);
  expect(coinEquivalent(1,'gamo','estrela')).toBe(7);
 });
 it('mantém saldos por tipo, total exato e o documento original separado',()=>{
  let w=emptyCharacterWallet(sourceId,'erdenor');
  w=appendWalletEntry(w,mk('00000000-0000-4000-8000-000000000001','deposit',1));
  w=appendWalletEntry(w,mk('00000000-0000-4000-8000-000000000002','deposit',3,'gamo'));
  w=appendWalletEntry(w,mk('00000000-0000-4000-8000-000000000003','withdraw',1,'gamo'));
  expect(walletBalance(w)).toMatchObject({dragao:1,gamo:2});
  expect(walletHalfVintems(walletBalance(w))).toBe(23520+2*112);
  const restored=parseCharacterWallet(serializeCharacterWallet(w),sourceId,'erdenor');
  expect(restored.entries).toHaveLength(3);
  expect(restored.sourceRecordId).toBe(sourceId);
  expect(()=>parseCharacterWallet(serializeCharacterWallet(w),sourceId,'ashkar')).toThrow('outra Casa');
 });
 it('impede saque sem saldo, crédito duplicado e quantias inválidas',()=>{
  const w=emptyCharacterWallet(sourceId,'erdenor');
  const id='00000000-0000-4000-8000-000000000001';
  expect(()=>appendWalletEntry(w,mk(id,'withdraw',1))).toThrow('insuficientes');
  const deposited=appendWalletEntry(w,mk(id,'deposit',1));
  expect(appendWalletEntry(deposited,mk(id,'deposit',1))).toBe(deposited);
  expect(()=>appendWalletEntry(deposited,mk(id,'deposit',2))).toThrow('já usado');
  expect(()=>appendWalletEntry(w,mk(id,'deposit',-1))).toThrow('inválido');
 });
 it('deriva UUID do mesmo personagem para idempotência na criação da carteira',()=>{
  const a=walletRecordId(sourceId);
  expect(a).not.toBe(sourceId);
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(walletRecordId(sourceId)).toBe(a);
  expect(walletRecordId('00000000-0000-4000-8000-000000000124')).not.toBe(a);
 });
});
