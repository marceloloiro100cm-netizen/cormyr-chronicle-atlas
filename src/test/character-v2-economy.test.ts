import {describe,it,expect} from 'vitest';
import {
 openEconomyLedger,replayEconomyLedger,applyEconomyCommand,
 type EconomyLedger,type EconomyCommand,
} from '@/lib/character-v2/economy';
import {simulateSpecialtyPurchase,simulateSpecialtyRefund} from '@/lib/character-v2/transactions';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';
import type {CharacterV2} from '@/lib/character-v2/schema';

const characterId='00000000-0000-4000-8000-000000000004';
const open=()=>openEconomyLedger(characterId,100,4);
function command(ledger:EconomyLedger,operation:EconomyCommand['operation'],suffix:string,
  overrides:Partial<EconomyCommand>={}):EconomyCommand{
 return{
  id:'event-'+suffix,key:'unique-'+suffix,expectedVersion:ledger.version,
  actorId:'narrator',isNarrator:true,narratorApproved:true,
  campaignDate:'1522-01-01',reason:'Registro de aventura e progressão, validado pelo narrador.',
  operation,amount:1,target:null,reversalOf:null,...overrides,
 };
}
function character():CharacterV2{
 const raw=blankChronicleSheet();raw.name='Aldaeric Erdenor';
 const c=readCharacterV2({id:characterId,houseId:'erdenor',version:1,
  title:'Ficha',content:serializeChronicleSheet(raw)}).character!;
 return {...c,review:{status:'approved',warnings:[]}};
}
describe('Ficha V2 — lote 06: economia de XP e Destino',()=>{
 it('soma XP sem incluir orçamento de criação; compra especialidade por 10 e Destino por 50',()=>{
  let ledger=open();
  expect(replayEconomyLedger(ledger).xp).toBe(100);
  let r=applyEconomyCommand(ledger,command(ledger,'purchase_specialty','special',{target:'fighting:briga'}));
  ledger=r.ledger;expect(r.balances.xp).toBe(90);
  r=applyEconomyCommand(ledger,command(ledger,'purchase_destiny','destiny'));
  ledger=r.ledger;expect(r.balances.xp).toBe(40);
  expect(r.balances.destinyTotal).toBe(5);
  expect(r.balances.destinyAvailable).toBe(5);
  expect(replayEconomyLedger(ledger)).toEqual(r.balances);
 });
 it('impede saldo negativo e compra em lote sem alterar documento original',()=>{
  const original=open(),before=structuredClone(original);
  expect(()=>applyEconomyCommand(original,command(original,'purchase_specialty','big',
   {amount:1,target:'fighting:briga',reason:'curto'}))).toThrow();
  let ledger=original;
  for(let i=0;i<2;i++)
   ledger=applyEconomyCommand(ledger,command(ledger,'purchase_destiny','d'+i)).ledger;
  expect(()=>applyEconomyCommand(ledger,command(ledger,'purchase_destiny','d3'))).toThrow('Saldo');
  expect(()=>applyEconomyCommand(original,command(original,'purchase_destiny','multiple',
   {amount:2}))).toThrow('não podem agrupar');
  expect(original).toEqual(before);
 });
 it('gastar, investir, queimar e renovar Destino não duplica créditos',()=>{
  let ledger=open();
  ledger=applyEconomyCommand(ledger,command(ledger,'invest_destiny','invest',{target:'rapido'})).ledger;
  let s=replayEconomyLedger(ledger);expect(s.destinyAvailable).toBe(3);
  expect(s.investments['rapido']).toBe(1);
  ledger=applyEconomyCommand(ledger,command(ledger,'spend_destiny','spend')).ledger;
  s=replayEconomyLedger(ledger);expect(s.destinyAvailable).toBe(2);expect(s.destinySpent).toBe(1);
  ledger=applyEconomyCommand(ledger,command(ledger,'burn_destiny','burn')).ledger;
  s=replayEconomyLedger(ledger);expect(s.destinyTotal).toBe(3);expect(s.destinyBurned).toBe(1);
  expect(s.destinyAvailable).toBe(1);
  ledger=applyEconomyCommand(ledger,command(ledger,'refresh_destiny','refresh',
   {target:'milestone:hillmarch'})).ledger;
  s=replayEconomyLedger(ledger);expect(s.destinySpent).toBe(0);expect(s.destinyAvailable).toBe(2);
  ledger=applyEconomyCommand(ledger,command(ledger,'release_destiny','release',
   {target:'rapido'})).ledger;
  s=replayEconomyLedger(ledger);expect(s.destinyAvailable).toBe(3);
  expect(s.investments).toEqual({});
 });
 it('duplicar chave retorna transação existente; versão antiga com chave nova falha',()=>{
  const ledger=open(),cmd=command(ledger,'purchase_specialty','once',{target:'fighting:briga'});
  const once=applyEconomyCommand(ledger,cmd);
  const repeat=applyEconomyCommand(once.ledger,cmd);
  expect(repeat.ledger.events).toHaveLength(1);
  expect(repeat.ledger.version).toBe(1);
  expect(()=>applyEconomyCommand(once.ledger,command(ledger,'award_xp','other'))).toThrow('defasada');
  expect(()=>applyEconomyCommand(once.ledger,{...cmd,target:'wrong'})).toThrow('Chave de idempotência');
 });
 it('estorno exige narrador e o evento exato; segundo estorno nunca duplica XP',()=>{
  let ledger=open();
  ledger=applyEconomyCommand(ledger,command(ledger,'purchase_specialty','buy',{target:'fighting:briga'})).ledger;
  expect(()=>applyEconomyCommand(ledger,command(ledger,'reverse_purchase','fail',
   {amount:1,target:'fighting:briga',reversalOf:'event-buy',isNarrator:false}))).toThrow();
  ledger=applyEconomyCommand(ledger,command(ledger,'reverse_purchase','undo',
   {amount:1,target:'fighting:briga',reversalOf:'event-buy'})).ledger;
  expect(replayEconomyLedger(ledger).xp).toBe(100);
  expect(()=>applyEconomyCommand(ledger,command(ledger,'reverse_purchase','again',
   {amount:1,target:'fighting:briga',reversalOf:'event-buy'}))).toThrow('estornada');
 });
 it('somente o Narrador concede XP/Destino, renova e estorna; replay detecta adulteração',()=>{
  const initial=open();
  const invalid=command(initial,'award_xp','player',{isNarrator:false,narratorApproved:false});
  expect(()=>applyEconomyCommand(initial,invalid)).toThrow('Narrador');
  const valid=applyEconomyCommand(initial,command(initial,'award_xp','grant',{amount:20}));
  expect(valid.balances.xp).toBe(120);
  const forged=structuredClone(valid.ledger);
  forged.events[0]!.after.xp=999;
  expect(()=>replayEconomyLedger(forged)).toThrow('adulterado');
 });
 it('compra e estorno simulados atualizam ficha e ledger juntos, não editam legado',()=>{
  const initial=character();let ledger=open();
  const purchase={...command(ledger,'purchase_specialty','b1',{target:'fighting:briga'}),
    skillId:'fighting' as const,specialtyId:'briga'};
  const first=simulateSpecialtyPurchase(initial,ledger,purchase);
  expect(first.character.specialties).toHaveLength(1);
  expect(first.character.specialties[0]?.bonusDice).toBe(1);
  expect(first.availableXp).toBe(90);
  expect(initial.specialties).toHaveLength(0);
  ledger=first.ledger;
  const refund={...command(ledger,'reverse_purchase','reversal',
    {target:'fighting:briga',reversalOf:'event-b1'}),skillId:'fighting' as const,specialtyId:'briga'};
  const restored=simulateSpecialtyRefund(first.character,ledger,refund);
  expect(restored.character.specialties).toHaveLength(0);
  expect(restored.availableXp).toBe(100);
  expect(first.character.specialties).toHaveLength(1);
  const notApproved={...initial,review:{...initial.review,status:'needs_review' as const}};
  expect(()=>simulateSpecialtyPurchase(notApproved,open(),purchase)).toThrow('não homologada');
 });
});
