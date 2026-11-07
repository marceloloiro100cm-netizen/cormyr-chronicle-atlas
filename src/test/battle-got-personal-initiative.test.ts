import {describe,expect,it} from 'vitest';
import {createWarBattle,completeWarHeroPhase,advanceWarRound} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {beginPersonalInitiative,personalTurnHeroId} from '@/lib/battle/got/personal-initiative';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function sample(){
 return createWarBattle({id:'micro',name:'Iniciativa dos heróis',
  seed:'iniciativa-ch9',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:2,y:3}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:8,y:3}}),
  ],
  heroes:[
   makeModelWarHero({id:'h1',name:'Um',side:'attacker',position:{x:2,y:2}}),
   makeModelWarHero({id:'h2',name:'Dois',side:'defender',position:{x:8,y:2}}),
  ]});
}
describe('Capítulo 9 — iniciativa individual de Agilidade e Rapidez',()=>{
 it('rola uma vez, guarda ordem auditável e é determinística por semente',()=>{
  const initial=sample();
  const first=beginPersonalInitiative(initial);
  const again=beginPersonalInitiative(initial);
  expect(first.personalInitiative?.order).toEqual(again.personalInitiative?.order);
  expect(first.events.filter(e=>e.kind==='personal-initiative')).toHaveLength(2);
  expect(first.seed).toBe(again.seed);
  expect(()=>beginPersonalInitiative(first)).toThrow(/já foi definida/);
  expect(initial.personalInitiative).toBeUndefined();
 });
 it('só o ator atual pode realizar ações; alterna após maior ou duas menores',()=>{
  let battle=beginPersonalInitiative(sample());
  const first=personalTurnHeroId(battle)!;
  const second=battle.personalInitiative!.order.find(id=>id!==first)!;
  expect(()=>executeWarHeroAction(battle,{heroId:second,action:{kind:'personal-pass'}}))
   .toThrow(/Aguarde a vez/);
  battle=executeWarHeroAction(battle,{heroId:first,action:{
   kind:'personal-move',toMetres:battle.heroes.find(h=>h.id===first)!.personalPosition!,
  }});
  expect(personalTurnHeroId(battle)).toBe(first);
  battle=executeWarHeroAction(battle,{heroId:first,action:{
   kind:'personal-end-turn',
  }});
  expect(personalTurnHeroId(battle)).toBe(second);
  battle=executeWarHeroAction(battle,{heroId:second,action:{kind:'personal-pass'}});
  expect(battle.personalInitiative?.roundIndex).toBe(1);
  expect(personalTurnHeroId(battle)).toBe(first);
 });
 it('limita a cinco rodadas e encerra a janela sem contaminar a guerra',()=>{
  let battle=beginPersonalInitiative(sample());
  for(let round=0;round<5;round++){
   for(let actor=0;actor<2;actor++){
    const id=personalTurnHeroId(battle);
    expect(id).toBeTruthy();
    battle=executeWarHeroAction(battle,{heroId:id!,action:{kind:'personal-pass'}});
   }
  }
  expect(battle.personalInitiative?.roundIndex).toBe(5);
  expect(personalTurnHeroId(battle)).toBeNull();
  expect(()=>executeWarHeroAction(battle,{heroId:'h1',
   action:{kind:'personal-pass'}})).toThrow(/disponíveis|Aguarde/i);
  const orders=completeWarHeroPhase(battle);
  expect(orders.personalInitiative).toBeUndefined();
  const secondWindow=advanceWarRound(orders);
  expect(secondWindow.phase).toBe('heroes-second');
  expect(secondWindow.personalInitiative).toBeUndefined();
 });
});
