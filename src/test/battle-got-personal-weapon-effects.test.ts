import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function example(weapon:'sledgehammer'|'peasant-tool'|'spiked-flail'|'longsword',
 shield=0,armor=2):WarBattle{
 const actor=equipModelWarHero(makeModelWarHero({
  id:'actor',name:'Atacante',side:'attacker',position:{x:2,y:3},
 }),{melee:weapon,ranged:'longbow'});
 const target=makeModelWarHero({id:'target',name:'Defensor',
  side:'defender',position:{x:2,y:3}});
 return createWarBattle({id:'weapon-effects',name:'Qualidades pós-golpe',
  seed:'weapon-effects-test',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...actor,fighting:12,meleeBonusDice:2,armor:0,defense:9,
    health:200,maxHealth:200,personalPosition:{x:25,y:35}},
   {...target,defense:10,defensiveBonus:shield,armor,
    health:200,maxHealth:200,personalPosition:{x:26,y:35}},
  ],
 });
}
const attack=(b:WarBattle,stunHit=false)=>executeWarHeroAction(b,{
 heroId:'actor',action:{kind:'personal-attack',targetHeroId:'target',stunHit},
});
const target=(b:WarBattle)=>b.heroes.find(h=>h.id==='target')!;
const actor=(b:WarBattle)=>b.heroes.find(h=>h.id==='actor')!;

describe('Capítulo 9 — Atordoante, Estilhaçadora, Frágil',()=>{
 it('Atordoante troca exatamente um grau de dano por restrição de ação maior',()=>{
  const initial=example('sledgehammer');
  const normal=attack(initial),stun=attack(initial,true);
  const event=stun.events.find(e=>e.kind==='personal-attack')!;
  const degrees=event.degrees!;
  expect(degrees).toBeGreaterThanOrEqual(2);
  expect(target(stun).stunnedNextTurn).toBe(true);
  expect(target(stun).health-target(normal).health).toBe(actor(stun).meleeDamage);
  expect(stun.events.some(e=>e.kind==='personal-stunned')).toBe(true);
  expect(()=>executeWarHeroAction(stun,{heroId:'target',action:{
   kind:'personal-pass',
  }})).toThrow(/Atordoante/);
  const moving=executeWarHeroAction(stun,{heroId:'target',action:{
   kind:'personal-move',toMetres:{x:26,y:35},
  }});
  const ended=executeWarHeroAction(moving,{heroId:'target',action:{
   kind:'personal-end-turn',
  }});
  expect(target(ended).stunnedNextTurn).toBe(false);
  expect(()=>executeWarHeroAction(ended,{heroId:'target',action:{
   kind:'personal-pass',
  }})).not.toThrow();
  expect(JSON.stringify(initial)).not.toContain('stunnedNextTurn');
 });
 it('Estilhaçadora reduz primeiro o bônus de escudo e depois o VA',()=>{
  const shielded=attack(example('sledgehammer',2,7));
  expect(target(shielded).defensiveBonus).toBe(1);
  expect(target(shielded).defense).toBe(9);
  expect(target(shielded).armor).toBe(7);
  const unshielded=attack(example('sledgehammer',0,7));
  expect(target(unshielded).armor).toBe(6);
  expect(unshielded.events.some(e=>e.kind==='personal-shatter')).toBe(true);
 });
 it('Frágil quebra após dois graus mesmo quando armadura bloqueia o dano',()=>{
  const highArmor=example('peasant-tool',0,100);
  const broken=attack(highArmor);
  expect(actor(broken).meleeWeaponBroken).toBe(true);
  expect(target(broken).health).toBe(200);
  expect(broken.events.some(e=>e.kind==='personal-weapon-broken')).toBe(true);
  const ended=executeWarHeroAction(broken,{heroId:'actor',action:{
   kind:'personal-end-turn',
  }});
  expect(()=>attack(ended)).toThrow(/quebrada/);
 });
 it('não permite escolher Atordoante numa arma sem essa qualidade',()=>{
  expect(()=>attack(example('longsword'),true)).toThrow(/Atordoante exige/);
 });
 it('não aplica qualidades em rolagem inferior a dois graus',()=>{
  const initial=example('peasant-tool');
  const hard={...initial,heroes:initial.heroes.map(h=>h.id==='target'?{
   ...h,defense:200,
  }:h)};
  const attempt=attack(hard);
  expect(actor(attempt).meleeWeaponBroken).not.toBe(true);
  expect(attempt.events.some(e=>e.kind==='personal-weapon-broken')).toBe(false);
 });
});
