import {describe,it,expect} from 'vitest';
import {createWarBattle,executeWarHeroAttackUnit} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {queuePersonalDamage} from '@/lib/battle/got/personal-injuries';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function scene():WarBattle{
 const a=equipModelWarHero(makeModelWarHero({id:'a',name:'Agarrador',side:'attacker',
  position:{x:2,y:2}}),{melee:'longsword',ranged:'longbow'});
 const d=makeModelWarHero({id:'d',name:'Prisioneiro',side:'defender',
  position:{x:2,y:2}});
 return createWarBattle({id:'integrity',name:'Auditoria de contenção',seed:'links',
  width:12,height:7,commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:2,y:2}}),
  ],heroes:[
   {...a,fighting:12,defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:25,y:25}},
   {...d,defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:26,y:25}},
  ]});
}
const linked=(b:WarBattle):WarBattle=>({...b,heroes:b.heroes.map(h=>
 h.id==='a'?{...h,grapplingTargetId:'d',pinningTargetId:'d'}:
 {...h,grabbedBy:'a',pinnedByHero:'a'})});
const h=(b:WarBattle,id:string)=>b.heroes.find(x=>x.id===id)!;
describe('Capítulo 9 — integridade de contenções e reações',()=>{
 it('derrota do agarrador liberta imediatamente o alvo e impede vínculos zumbis',()=>{
  const before=linked(scene()),snapshot=JSON.stringify(before);
  const weak={...before,heroes:before.heroes.map(x=>x.id==='a'?
   {...x,health:1}:x)};
  const after=queuePersonalDamage(weak,{actorName:'D',targetHeroId:'a',
   source:'personal',damage:5});
  expect(h(after,'a').active).toBe(false);
  expect(h(after,'a').grapplingTargetId).toBeUndefined();
  expect(h(after,'a').pinningTargetId).toBeUndefined();
  expect(h(after,'d').grabbedBy).toBeUndefined();
  expect(h(after,'d').pinnedByHero).toBeUndefined();
  expect(JSON.stringify(before)).toBe(snapshot);
 });
 it('derrota do agarrado libera as mãos de quem segurava a vítima',()=>{
  const before=linked(scene());
  const weak={...before,heroes:before.heroes.map(x=>x.id==='d'?
   {...x,health:1}:x)};
  const after=queuePersonalDamage(weak,{actorName:'A',targetHeroId:'d',
   source:'personal',damage:7});
  expect(h(after,'d').active).toBe(false);
  expect(h(after,'a').grapplingTargetId).toBeUndefined();
  expect(h(after,'a').pinningTargetId).toBeUndefined();
 });
 it('rendição do agarrador encerra a imobilização em ambos os personagens',()=>{
  const before=linked(scene());
  const after=executeWarHeroAction(before,{heroId:'a',
   action:{kind:'personal-surrender'}});
  expect(h(after,'a').surrendered).toBe(true);
  expect(h(after,'d').grabbedBy).toBeUndefined();
  expect(h(after,'d').pinnedByHero).toBeUndefined();
  expect(h(after,'a').pinningTargetId).toBeUndefined();
 });
 it('rede e arma empalada persistem fisicamente quando o agressor é derrotado',()=>{
  const before=scene();
  const tied={...before,heroes:before.heroes.map(x=>x.id==='a'?
   {...x,health:1,entanglingTargetId:'d',impalingTargetId:'d'}:
   {...x,entangledBy:'a',impaledBy:'a'})};
  const after=queuePersonalDamage(tied,{actorName:'D',targetHeroId:'a',
   source:'personal',damage:4});
  expect(h(after,'d').entangledBy).toBe('a');
  expect(h(after,'d').impaledBy).toBe('a');
 });
 it('imobilizado não consegue preparar nem desferir contra-ataque físico',()=>{
  const b=scene();
  const ready={...b,heroes:b.heroes.map(x=>x.id==='d'?
   {...x,pinnedByHero:'a',counterattackReady:{ranged:false,vsCharge:false}}:x)};
  const after=executeWarHeroAction(ready,{heroId:'a',action:{
   kind:'personal-attack',targetHeroId:'d',
  }});
  expect(after.events.filter(e=>e.kind==='personal-attack')).toHaveLength(1);
 });
 it('hero preso não ignora contenção atacando a ficha coletiva da unidade',()=>{
  const b=scene();
  const stuck={...b,heroes:b.heroes.map(x=>x.id==='a'?
   {...x,grabbedBy:'d'}:x)};
  expect(()=>executeWarHeroAttackUnit(stuck,{heroId:'a',unitId:'ud'}))
   .toThrow(/contenção/);
  const entangled={...b,heroes:b.heroes.map(x=>x.id==='a'?
   {...x,entangledBy:'d'}:x)};
  const normal=executeWarHeroAttackUnit(b,{heroId:'a',unitId:'ud'});
  const reduced=executeWarHeroAttackUnit(entangled,{heroId:'a',unitId:'ud'});
  const roll=(x:WarBattle)=>x.events.find(e=>e.kind==='hero-vs-unit')!.total!;
  expect(reduced.events.some(e=>e.kind==='hero-vs-unit')).toBe(true);
  expect(roll(reduced)).toBe(Math.max(0,roll(normal)-5));
 });
});
