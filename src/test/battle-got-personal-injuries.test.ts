import {describe,expect,it} from 'vitest';
import {createWarBattle,completeWarHeroPhase} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {reducePersonalDamage,queuePersonalDamage,resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';

const hero=makeModelWarHero({id:'h',name:'Herói de teste',side:'attacker',
 position:{x:2,y:2}});
function sample(){
 return createWarBattle({id:'wounds',name:'Ferimentos',seed:'wounds-ch9',
  width:12,height:7,commanders:modelWarCommanders({attacker:5,defender:5}),
  manualMitigation:true,
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:3}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:8,y:3}}),
  ],
  heroes:[hero]});
}
describe('Capítulo 9 — ferimentos e lesões voluntários',()=>{
 it('ferimentos retiram Vigor do dano cada e cumulam penalidade de -1',()=>{
  const result=reducePersonalDamage(hero,7,{kind:'wounds',woundCount:2});
  expect(result.health).toBe(8);
  expect(result.wounds).toBe(2);
  expect(result.active).toBe(true);
  expect(hero.wounds).toBe(0);
 });
 it('lesão cancela um golpe e acumula -1D; alcançar Vigor em lesões é fatal',()=>{
  const saved=reducePersonalDamage(hero,35,{kind:'injury'});
  expect(saved.health).toBe(9);
  expect(saved.injuries).toBe(1);
  const death=reducePersonalDamage({...saved,injuries:2},5,{kind:'injury'});
  expect(death.defeatOutcome).toBe('death');
  expect(death.active).toBe(false);
  expect(death.health).toBe(0);
 });
 it('rejeita ferimentos além de Vigor, decisões inválidas e lesão após o limite',()=>{
  expect(()=>reducePersonalDamage(hero,4,{kind:'wounds',woundCount:4}))
   .toThrow(/Vigor/);
  expect(()=>reducePersonalDamage({...hero,wounds:3},2,{kind:'wounds',woundCount:1}))
   .toThrow(/Vigor/);
  expect(()=>reducePersonalDamage({...hero,injuries:3},2,{kind:'injury'}))
   .toThrow(/não pode/);
  expect(()=>reducePersonalDamage(hero,-5,{kind:'none'})).toThrow(/inválido/);
 });
 it('mantém golpe pendente até a decisão do defensor, sem aplicar morte automática',()=>{
  const b=sample(),snapshot=JSON.stringify(b);
  const queued=queuePersonalDamage(b,{actorName:'Guerreiro D',
   targetHeroId:'h',damage:8,source:'personal'});
  expect(queued.pendingPersonalDamage?.damage).toBe(8);
  expect(queued.heroes[0]?.health).toBe(9);
  expect(()=>completeWarHeroPhase(queued)).toThrow(/pendente/);
  const resolved=resolvePendingPersonalDamage(queued,{kind:'wounds',woundCount:2});
  expect(resolved.heroes[0]?.health).toBe(7);
  expect(resolved.heroes[0]?.wounds).toBe(2);
  expect(resolved.pendingPersonalDamage).toBeUndefined();
  expect(JSON.stringify(b)).toBe(snapshot);
 });
 it('sem redução aplica derrota ao confirmar; consumo não pode acontecer duas vezes',()=>{
  const queued=queuePersonalDamage(sample(),{actorName:'Guerreiro D',
   targetHeroId:'h',damage:20,source:'unit'});
  const defeated=resolvePendingPersonalDamage(queued,{kind:'none'});
  expect(defeated.heroes[0]?.health).toBe(0);
  expect(defeated.heroes[0]?.active).toBe(false);
  expect(()=>resolvePendingPersonalDamage(defeated,{kind:'injury'}))
   .toThrow(/Não há dano/);
 });
});
