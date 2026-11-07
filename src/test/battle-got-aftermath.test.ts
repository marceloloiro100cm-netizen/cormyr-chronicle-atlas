import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
describe('Conclusão de Guerra dos Tronos — somente proposta',()=>{
 const a=modelWarUnit({id:'a',side:'attacker',name:'A',typeId:'infantry',
  position:{x:1,y:1}});
 const d=modelWarUnit({id:'d',side:'defender',name:'D',typeId:'infantry',
  position:{x:7,y:1}});
 const battle=createWarBattle({
  id:'g',name:'Guerra',seed:'x',width:12,height:7,
  units:[a,d],commanders:modelWarCommanders({attacker:3,defender:3}),
 });
 it('recusa consequência em partida não encerrada',()=>{
  expect(()=>previewWarAftermath(battle)).toThrow(/encerrada/);
 });
 it('não muta fichas nem estado da partida e repete os mesmos dados',()=>{
  const finalized={...battle,phase:'finished' as const,winner:'attacker' as const,
   units:battle.units.map(u=>u.id==='d'?{...u,condition:'destroyed' as const,health:0}:u)};
  const before=JSON.stringify(finalized);
  const proposal=previewWarAftermath(finalized);
  expect(proposal).toEqual(previewWarAftermath(finalized));
  expect(JSON.stringify(finalized)).toBe(before);
  expect(proposal.appliedToHouse).toBe(false);
  expect(proposal.rulesVersion).toBe('GOT-CH10-1');
  expect(proposal.glory).toEqual({attacker:1,defender:1});
  expect(proposal.survivors).toHaveLength(2);
  expect(proposal.survivors.find(u=>u.unitId==='d')?.condition).toBe('destroyed');
 });
});
