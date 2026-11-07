import {describe,it,expect} from 'vitest';
import {createWarBattle,completeWarHeroPhase,executeWarHeroAttackUnit,
 issueWarOrder} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function example(){
 const baseA=modelWarUnit({id:'a',name:'Tropa atacante',side:'attacker',
  training:'elite',typeId:'infantry',position:{x:1,y:1}});
 const baseD=modelWarUnit({id:'d',name:'Tropa defensora',side:'defender',
  training:'elite',typeId:'infantry',position:{x:3,y:3}});
 const hA=makeModelWarHero({id:'ha',name:'Herói atacante',side:'attacker',
  position:{x:2,y:3}});
 const hD=makeModelWarHero({id:'hd',name:'Herói defensor',side:'defender',
  position:{x:2,y:1}});
 return createWarBattle({id:'mixed',name:'Combate misto',seed:'mixed-heroes',
  width:12,height:7,commanders:modelWarCommanders({attacker:12,defender:12}),
  units:[{...baseA,ability:{...baseA.ability,fighting:12}},
   {...baseD,defense:0,armor:0}],
  heroes:[{...hA,personalPosition:{x:29,y:35},fighting:12,meleeDamage:10},
   {...hD,personalPosition:{x:20,y:15},defense:0,armor:0}],
 });
}
describe('Capítulo 10 — ataques entre personagens e unidades completas',()=>{
 it('herói individual ataca contra Defesa da unidade +20 e aplica Saúde coletiva',()=>{
  const b=example();
  const unchanged=JSON.stringify(b);
  const result=executeWarHeroAttackUnit(b,{heroId:'ha',unitId:'d'});
  const attack=result.events.find(e=>e.kind==='hero-vs-unit')!;
  expect(attack).toBeDefined();
  expect(attack.difficulty).toBe(20);
  expect(attack.degrees).toBeGreaterThan(0);
  expect(result.units.find(u=>u.id==='d')?.health).toBeLessThan(9);
  expect(result.heroes.find(h=>h.id==='ha')?.usedActions).toBe(1);
  expect(JSON.stringify(b)).toBe(unchanged);
 });
 it('unidade ataca herói individual com +2D e respeita armadura pessoal',()=>{
  const b={...completeWarHeroPhase(example()),turn:'attacker' as const};
  const r=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'attack',targetHeroId:'hd'}});
  expect(r.passed).toBe(true);
  const event=r.battle.events.find(e=>e.kind==='unit-vs-hero')!;
  expect(event).toBeDefined();
  expect(event.roll).toHaveLength(14);
  expect(r.battle.heroes.find(h=>h.id==='hd')?.health).toBeLessThan(9);
 });
 it('não ataca um herói escondido dentro de sua própria unidade',()=>{
  const b=example();
  const inside={...b,heroes:b.heroes.map(h=>h.id==='hd'?{...h,unitId:'d'}:h)};
  const orders={...completeWarHeroPhase(inside),turn:'attacker' as const};
  expect(()=>issueWarOrder(orders,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'attack',targetHeroId:'hd'}})).toThrow(/indisponível/);
 });
 it('recusa agressão individual contra tropa fora do alcance em metros',()=>{
  const b=example();
  const far={...b,heroes:b.heroes.map(h=>h.id==='ha'?{
   ...h,position:{x:8,y:5},personalPosition:{x:85,y:55},
  }:h)};
  expect(()=>executeWarHeroAttackUnit(far,{heroId:'ha',unitId:'d'}))
   .toThrow(/contato/);
 });
});
