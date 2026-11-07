import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function setup(manual=false){
 const a=makeModelWarHero({id:'a',name:'Agarrador',side:'attacker',position:{x:2,y:2}});
 const b=makeModelWarHero({id:'b',name:'Prisioneiro',side:'defender',position:{x:2,y:2}});
 const healer=makeModelWarHero({id:'healer',name:'Curandeira',side:'defender',position:{x:2,y:2}});
 return createWarBattle({id:'advanced-control',name:'Imobilização e Cura',
  seed:'pin-healer-ch9',width:12,height:7,manualMitigation:manual,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,personalPosition:{x:25,y:25},athletics:12,fighting:12,
    health:100,maxHealth:100},
   {...b,personalPosition:{x:26,y:25},athletics:1,endurance:1,
    fighting:1,health:100,maxHealth:100,armor:2,defense:8},
   {...healer,personalPosition:{x:27,y:25},healing:12,
    health:100,maxHealth:100},
  ],
 });
}
const act=(b:WarBattle,id:string,kind:
 'personal-pin-grapple'|'personal-escape-pin'|'personal-pin-impale'|
 'personal-heal-remove-impale'|'personal-release-grapple'|
 'personal-aim'|'personal-attack'|'personal-pass',
 targetHeroId?:string)=>executeWarHeroAction(b,{heroId:id,action:{
 kind,...(targetHeroId?{targetHeroId}:{})
}});
const person=(b:WarBattle,id:string)=>b.heroes.find(h=>h.id===id)!;

describe('Capítulo 9 — imobilização avançada e Cura de aliado',()=>{
 it('Agarrador imobiliza por Atletismo oposto, mantém com ação maior e liberta ao abandonar manutenção',()=>{
  const b=setup(),held={...b,heroes:b.heroes.map(h=>h.id==='a'?
   {...h,grapplingTargetId:'b'}:h.id==='b'?{...h,grabbedBy:'a'}:h)};
  const pinned=act(held,'a','personal-pin-grapple');
  expect(person(pinned,'b').pinnedByHero).toBe('a');
  expect(person(pinned,'a').pinningTargetId).toBe('b');
  expect(person(pinned,'a').usedActions).toBe(1);
  expect(pinned.events.some(e=>e.kind==='personal-pin-grapple')).toBe(true);
  expect(()=>act(pinned,'b','personal-attack','a'))
   .toThrow(/Imobilizado/);
  const maintained=act(pinned,'a','personal-pin-grapple');
  expect(person(maintained,'a').usedActions).toBe(2);
  expect(maintained.events.some(e=>e.kind==='personal-pin-maintain')).toBe(true);
  const dropped=act(maintained,'a','personal-pass');
  expect(person(dropped,'b').pinnedByHero).toBeUndefined();
  expect(person(dropped,'b').grabbedBy).toBe('a');
 });
 it('preso indefeso perde Agilidade da Defesa e fornece +1D ao atacante',()=>{
  const b=setup();
  const exposed={...b,heroes:b.heroes.map(h=>h.id==='b'?
   {...h,pinnedByHero:'a',grabbedBy:'a'}:h)};
  const normal=act(b,'a','personal-attack','b');
  const easy=act(exposed,'a','personal-attack','b');
  const strike=(x:WarBattle)=>x.events.find(e=>e.kind==='personal-attack')!;
  expect(strike(easy).roll?.length).toBe((strike(normal).roll?.length??0)+1);
  expect(strike(easy).difficulty).toBeLessThan(strike(normal).difficulty??0);
 });
 it('escapar do aperto exige ação maior e teste oposto de Luta',()=>{
  const b=setup(),pinned={...b,heroes:b.heroes.map(h=>
   h.id==='a'?{...h,grapplingTargetId:'b',pinningTargetId:'b',fighting:1}:
   h.id==='b'?{...h,grabbedBy:'a',pinnedByHero:'a',fighting:12}:h)};
  const freed=act(pinned,'b','personal-escape-pin');
  expect(person(freed,'b').usedActions).toBe(1);
  expect(person(freed,'b').pinnedByHero).toBeUndefined();
  expect(person(freed,'b').grabbedBy).toBeUndefined();
  expect(person(freed,'a').pinningTargetId).toBeUndefined();
  expect(person(freed,'a').grapplingTargetId).toBeUndefined();
 });
 it('Empalar prende alvo ao cenário após vencer Atletismo contra Vigor passivo',()=>{
  const b=setup(),impaled={...b,heroes:b.heroes.map(h=>
   h.id==='a'?{...h,impalingTargetId:'b'}:
   h.id==='b'?{...h,impaledBy:'a'}:h)};
  const pinned=act(impaled,'a','personal-pin-impale');
  expect(person(pinned,'b').impalePinnedBy).toBe('a');
  expect(pinned.events.find(e=>e.kind==='personal-pin-impale')?.total)
   .toBeGreaterThanOrEqual(4);
 });
 it('curandeira remove arma do aliado sem causar ferimentos quando supera Cura 12',()=>{
  const b=setup(),impaled={...b,heroes:b.heroes.map(h=>
   h.id==='a'?{...h,impalingTargetId:'b'}:
   h.id==='b'?{...h,impaledBy:'a',impalePinnedBy:'a'}:h)};
  const healed=act(impaled,'healer','personal-heal-remove-impale','b');
  expect(person(healed,'healer').usedActions).toBe(1);
  expect(person(healed,'b').impaledBy).toBeUndefined();
  expect(person(healed,'b').impalePinnedBy).toBeUndefined();
  expect(person(healed,'b').wounds).toBe(0);
  expect(person(healed,'b').health).toBe(100);
  expect(person(healed,'a').impalingTargetId).toBeUndefined();
  expect(healed.events.some(e=>e.kind==='personal-heal-remove-impale')).toBe(true);
 });
 it('falha em Cura remove a arma e causa dano, com mitigação manual sequenciada',()=>{
  const b=setup(true),impaled={...b,heroes:b.heroes.map(h=>
   h.id==='a'?{...h,impalingTargetId:'b'}:
   h.id==='b'?{...h,impaledBy:'a'}:
   h.id==='healer'?{...h,healing:1}:h)};
  const attempt=act(impaled,'healer','personal-heal-remove-impale','b');
  expect(attempt.pendingPersonalDamage?.targetHeroId).toBe('b');
  expect(person(attempt,'b').impaledBy).toBeUndefined();
  const resolved=resolvePendingPersonalDamage(attempt,{kind:'none'});
  expect(person(resolved,'b').health).toBeLessThan(100);
  expect(resolved.pendingPersonalDamage).toBeUndefined();
  expect(person(resolved,'a').impalingTargetId).toBeUndefined();
 });
 it('Cura rejeita retirada por inimigos ou auxiliares distantes antes de gastar ação',()=>{
  const b=setup(),impaled={...b,heroes:b.heroes.map(h=>
   h.id==='a'?{...h,impalingTargetId:'b'}:
   h.id==='b'?{...h,impaledBy:'a'}:h)};
  expect(()=>act(impaled,'a','personal-heal-remove-impale','b'))
   .toThrow(/aliado/);
  const far={...impaled,heroes:impaled.heroes.map(h=>
   h.id==='healer'?{...h,personalPosition:{x:40,y:40},position:{x:4,y:4}}:h)};
  expect(()=>act(far,'healer','personal-heal-remove-impale','b'))
   .toThrow(/adjacente/);
  expect(person(far,'healer').usedActions).toBe(0);
 });
});
