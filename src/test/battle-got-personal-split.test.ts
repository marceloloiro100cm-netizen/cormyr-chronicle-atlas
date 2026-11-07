import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {beginPersonalInitiative,personalTurnHeroId} from '@/lib/battle/got/personal-initiative';
import {deployWarSquad} from '@/lib/battle/got/squads';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function arena(melee:'dagger'|'shortsword'|'greatsword'='shortsword',manual=false):WarBattle{
 const a=equipModelWarHero(makeModelWarHero({id:'actor',name:'Combatente',
  side:'attacker',position:{x:2,y:2}}),{melee,ranged:'longbow'});
 const d1=makeModelWarHero({id:'d1',name:'Primeiro',
  side:'defender',position:{x:2,y:2}});
 const d2=makeModelWarHero({id:'d2',name:'Segundo',
  side:'defender',position:{x:2,y:2}});
 return createWarBattle({id:'split',name:'Combate Dividido',seed:'split-ch9',
  width:12,height:7,manualMitigation:manual,
  commanders:modelWarCommanders({attacker:7,defender:7}),
  units:[
   modelWarUnit({id:'ua',name:'Aliados',side:'attacker',typeId:'infantry',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Guarnição',side:'defender',typeId:'garrison',
    position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,fighting:6,meleeBonusDice:2,agility:12,health:100,maxHealth:100,
    personalPosition:{x:25,y:25}},
   {...d1,agility:1,defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:26,y:25}},
   {...d2,agility:1,defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:25,y:26}},
  ],
 });
}
function split(b:WarBattle,first='d1',second='d2',ranks=[3,3],
 bonuses=[1,1]){
 return executeWarHeroAction(b,{heroId:'actor',action:{
  kind:'personal-split-attack',splitTargets:[first,second],
  splitRanks:ranks,splitBonuses:bonuses,
 }});
}
describe('Capítulo 9 — Ataque Dividido em escala individual e esquadrões',()=>{
 it('distribui dados e bônus entre dois alvos, arma Rápida soma +1B por teste',()=>{
  const original=arena(),snapshot=JSON.stringify(original);
  const done=split(original);
  const strikes=done.events.filter(e=>e.kind==='personal-attack');
  expect(strikes).toHaveLength(2);
  expect(strikes[0]?.roll).toHaveLength(5);
  expect(strikes[1]?.roll).toHaveLength(5);
  expect(done.heroes[0]?.usedActions).toBe(1);
  expect(done.pendingPersonalSplit).toBeUndefined();
  expect(done.heroes.find(h=>h.id==='d1')!.health).toBeLessThan(100);
  expect(done.heroes.find(h=>h.id==='d2')!.health).toBeLessThan(100);
  expect(JSON.stringify(original)).toBe(snapshot);
 });
 it('mitigação manual pausa e retoma sem reexecutar o primeiro golpe',()=>{
  const initial=arena('dagger',true);
  const first=split(initial);
  expect(first.pendingPersonalDamage?.targetHeroId).toBe('d1');
  expect(first.pendingPersonalSplit?.nextIndex).toBe(1);
  expect(first.events.filter(e=>e.kind==='personal-attack')).toHaveLength(1);
  const second=resolvePendingPersonalDamage(first,{kind:'injury'});
  expect(second.pendingPersonalDamage?.targetHeroId).toBe('d2');
  expect(second.events.filter(e=>e.kind==='personal-attack')).toHaveLength(2);
  const done=resolvePendingPersonalDamage(second,{kind:'none'});
  expect(done.pendingPersonalDamage).toBeUndefined();
  expect(done.pendingPersonalSplit).toBeUndefined();
  expect(done.events.filter(e=>e.kind==='personal-attack')).toHaveLength(2);
  expect(done.events.filter(e=>e.kind==='personal-split-complete')).toHaveLength(1);
  expect(done.heroes[0]?.usedActions).toBe(1);
 });
 it('rejeita armas Lentas, alocações inválidas e alvos repetidos antes do gasto',()=>{
  const slow=arena('greatsword');
  expect(()=>split(slow)).toThrow(/Lenta/);
  const b=arena();
  expect(()=>split(b,'d1','d2',[2,2])).toThrow(/Divida exatamente/);
  expect(()=>split(b,'d1','d1',[3,3])).toThrow(/distintos/);
  expect(()=>split(b,'d1','d2',[3,3],[3,3]))
   .toThrow(/limite os dados de bônus/);
  expect(b.heroes[0]?.usedActions).toBe(0);
 });
 it('iniciativa impede ação fora da vez e encaminha após ação maior',()=>{
  const initiated=beginPersonalInitiative(arena());
  expect(personalTurnHeroId(initiated)).toBe('actor');
  const done=split(initiated);
  expect(personalTurnHeroId(done)).not.toBe('actor');
  expect(()=>split(done)).toThrow(/Aguarde a vez/);
 });
 it('alvos destacados de um esquadrão de dez podem receber golpes sem alterar ficha da Casa',()=>{
  const before=arena();
  const withoutDefenders={...before,heroes:before.heroes.filter(h=>h.side==='attacker')};
  const deployed=deployWarSquad(withoutDefenders,{unitId:'ud',squadId:'guardas'});
  const selected=['guardas-1','guardas-2'];
  const setup={...deployed,heroes:deployed.heroes.map((h,i)=>
   selected.includes(h.id)?{...h,health:2,defense:0,armor:0,
    personalPosition:{x:25+(i%2),y:26},position:{x:2,y:2}}:h)};
  const acted=split(setup,selected[0],selected[1],[3,3],[1,1]);
  expect(acted.events.filter(e=>e.kind==='personal-attack')).toHaveLength(2);
  expect(acted.heroes.find(h=>h.id===selected[0])?.health).toBeLessThan(2);
  expect(acted.units.find(u=>u.id==='ud')?.health)
   .toBe(setup.units.find(u=>u.id==='ud')?.health);
  expect(acted.units.find(u=>u.id==='ud')?.source.kind).toBe('model');
 });
});
