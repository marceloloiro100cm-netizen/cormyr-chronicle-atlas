import {describe,it,expect} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeWarFortification,fortDefense} from '@/lib/battle/got/fortifications';
import {WAR_ADVANCED_ORDER_DIFFICULTY} from '@/lib/battle/got/advanced-orders';

function make(){
 const a=modelWarUnit({id:'engineer',name:'Engenheiros',side:'attacker',
  typeId:'engineers',training:'elite',position:{x:2,y:3}});
 const defender=modelWarUnit({id:'defender',name:'Guarnição',side:'defender',
  typeId:'garrison',training:'elite',position:{x:4,y:3}});
 const allied=modelWarUnit({id:'ally',name:'Arqueiros A',side:'attacker',
  typeId:'archers',training:'elite',position:{x:2,y:4}});
 const fort=makeWarFortification({id:'fort-d',name:'Torre D',kind:'tower',
  side:'defender',cells:[{x:4,y:3}],engineerBuilt:false,hoursBuilt:10});
 return createWarBattle({id:'adv',name:'Avançadas',seed:'teste-ordem-avancada',
  width:12,height:7,units:[a,defender,allied],
  commanders:modelWarCommanders({attacker:12,defender:12}),
  advancedFormations:true,fortifications:[fort]});
}
describe('Ordens avançadas do livro — versão isolada',()=>{
 it('dificuldades +3/+6 e sabotagem impedida em exército sem engenheiros',()=>{
  expect(WAR_ADVANCED_ORDER_DIFFICULTY).toMatchObject({
   suppress:3,probe:6,'counter-charge':3,sabotage:3,ambush:3,join:3,
  });
  const original=make();
  const bad={...original,turn:'defender' as const};
  expect(()=>issueWarOrder(bad,{commanderId:'leader-defender',
   unitId:'defender',order:{kind:'sabotage',fortId:'fort-d'}})).toThrow(/engenheiros/);
 });
 it('sabotar exige teste de Guerra 12, reduz Defesa temporária sem alterar posse',()=>{
  const b={...make(),turn:'attacker' as const};
  const before=JSON.stringify(b);
  const near={...b,units:b.units.map(u=>u.id==='engineer'?{
   ...u,position:{x:3,y:3},ability:{...u.ability,warfare:12},
  }:u)};
  const outcome=issueWarOrder(near,{commanderId:'leader-attacker',
   unitId:'engineer',order:{kind:'sabotage',fortId:'fort-d'}});
  expect(outcome.passed).toBe(true);
  const result=outcome.battle.events.find(e=>e.kind==='sabotage');
  expect(result?.difficulty).toBe(12);
  expect(result?.degrees).toBeGreaterThan(0);
  expect(fortDefense(outcome.battle.fortifications[0]!)).toBeLessThan(3);
  expect(JSON.stringify(b)).toBe(before);
 });
 it('fogo de supressão exige alvo inimigo e aplica penalidade após grau de sucesso',()=>{
  const b=make();
  const zeroDefense={...b,turn:'attacker' as const,
   units:b.units.map(u=>u.id==='defender'?{...u,defense:0}:u.id==='ally'?{
    ...u,ability:{...u.ability,marksmanship:12},
   }:u)};
  const result=issueWarOrder(zeroDefense,{commanderId:'leader-attacker',unitId:'ally',
   order:{kind:'suppress',targetId:'defender'}});
  expect(result.passed).toBe(true);
  const target=result.battle.units.find(u=>u.id==='defender')!;
  expect(target.suppressionPenalty).toBeGreaterThanOrEqual(3);
  expect(target.suppressionRound).toBe(1);
  expect(result.battle.events.some(e=>e.kind==='suppress')).toBe(true);
 });
 it('prontidão contra carga grava reação para a rodada',()=>{
  const b={...make(),turn:'defender' as const};
  const result=issueWarOrder(b,{commanderId:'leader-defender',
   unitId:'defender',order:{kind:'counter-charge'}});
  expect(result.passed).toBe(true);
  expect(result.battle.units.find(u=>u.id==='defender')?.counterChargeReady).toBe(true);
 });
 it('ordens avançadas não vazam para o motor de regras básicas',()=>{
  const b={...make(),advancedFormations:false,turn:'attacker' as const};
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',unitId:'ally',
   order:{kind:'suppress',targetId:'defender'}})).toThrow(/avançadas/i);
 });
});
