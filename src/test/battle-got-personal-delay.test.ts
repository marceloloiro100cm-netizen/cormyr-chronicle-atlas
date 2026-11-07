import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {beginPersonalInitiative,delayPersonalTurn,
 personalTurnHeroId} from '@/lib/battle/got/personal-initiative';
function sample(){
 return createWarBattle({id:'delay',name:'Atrasar turno',seed:'delay-ch9',
  width:12,height:7,commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:3}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:10,y:3}}),
  ],
  heroes:[
   makeModelWarHero({id:'h1',name:'Um',side:'attacker',position:{x:2,y:2}}),
   makeModelWarHero({id:'h2',name:'Dois',side:'defender',position:{x:3,y:2}}),
   makeModelWarHero({id:'h3',name:'Tres',side:'attacker',position:{x:4,y:2}}),
  ]});
}
describe('Capítulo 9 — ação Atrasar',()=>{
 it('permite adiar uma vez, sem consumir ação e sem interromper o turno alheio',()=>{
  const b=beginPersonalInitiative(sample());
  const first=personalTurnHeroId(b)!;
  const order=b.personalInitiative!.originalOrder!;
  const delayed=delayPersonalTurn(b,first);
  expect(delayed.heroes.find(h=>h.id===first)?.usedActions).toBe(0);
  expect(delayed.personalInitiative?.order.at(-1)).toBe(first);
  expect(personalTurnHeroId(delayed)).toBe(order[1]);
  expect(delayed.events.some(e=>e.kind==='personal-delay')).toBe(true);
  expect(()=>delayPersonalTurn(delayed,first)).toThrow(/Aguarde a vez/);
  expect(b.personalInitiative?.order).toEqual(order);
 });
 it('retorna a ordem original na rodada seguinte e proíbe atraso repetido na mesma',()=>{
  let b=beginPersonalInitiative(sample());
  const original=b.personalInitiative!.order.slice();
  const first=personalTurnHeroId(b)!;
  b=delayPersonalTurn(b,first);
  while(personalTurnHeroId(b)!==first){
   b=executeWarHeroAction(b,{heroId:personalTurnHeroId(b)!,
    action:{kind:'personal-pass'}});
  }
  expect(()=>delayPersonalTurn(b,first)).toThrow(/já atrasou/);
  b=executeWarHeroAction(b,{heroId:first,action:{kind:'personal-pass'}});
  expect(b.personalInitiative?.roundIndex).toBe(1);
  expect(b.personalInitiative?.order).toEqual(original);
  expect(personalTurnHeroId(b)).toBe(original[0]);
  expect(b.personalInitiative?.delayedHeroIds).toEqual([]);
 });
 it('não atrasa fora da fase de iniciativa, nem durante dano pendente',()=>{
  const b=sample();
  expect(()=>delayPersonalTurn(b,'h1')).toThrow(/iniciativa/);
  const ready=beginPersonalInitiative(b);
  expect(()=>delayPersonalTurn({...ready,pendingPersonalDamage:{
   actorName:'D',targetHeroId:'h1',damage:4,source:'personal',
  }},personalTurnHeroId(ready)!)).toThrow(/dano pendente/);
 });
});
