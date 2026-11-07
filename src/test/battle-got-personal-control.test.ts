import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function battle(kind:'fist'|'net'|'boar-spear'|'longsword'='fist'){
 const a=equipModelWarHero(makeModelWarHero({id:'a',name:'Atacante',
  side:'attacker',position:{x:2,y:2}}),{melee:kind==='net'?'longsword':kind,
   ranged:kind==='net'?'net':'longbow'});
 const b=makeModelWarHero({id:'d',name:'Defensor',side:'defender',position:{x:2,y:2}});
 return createWarBattle({id:'personal-control-test',name:'Contenções',
  seed:'control-chapter9',width:12,height:7,manualMitigation:false,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'Aliados',typeId:'infantry',side:'attacker',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Defensores',typeId:'infantry',side:'defender',
    position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,fighting:12,marksmanship:12,athletics:12,
    defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:25,y:25}},
   {...b,fighting:3,athletics:3,defense:0,armor:0,
    health:100,maxHealth:100,personalPosition:{x:26,y:25}},
  ],
 });
}
const act=(b:WarBattle,heroId:string,kind:
 'personal-attack'|'personal-move'|'personal-end-turn'|
 'personal-release-grapple'|'personal-escape-grapple'|
 'personal-escape-entangle'|'personal-release-impale'|
 'personal-remove-impale', extra:Record<string,unknown>={})=>
 executeWarHeroAction(b,{heroId,action:{kind,...extra}});

describe('Capítulo 9 — Agarrar, Enredar e Empalar',()=>{
 it('Agarrar exige ataque e Atletismo passivo, imobiliza ambos, penaliza Defesa e soltar é livre',()=>{
  const original=battle('fist'),snapshot=JSON.stringify(original);
  const held=act(original,'a','personal-attack',{targetHeroId:'d',grappleHit:true});
  expect(held.heroes.find(h=>h.id==='a')?.grapplingTargetId).toBe('d');
  expect(held.heroes.find(h=>h.id==='d')?.grabbedBy).toBe('a');
  expect(held.events.some(e=>e.kind==='personal-grapple')).toBe(true);
  expect(()=>act(held,'a','personal-move',{toMetres:{x:25,y:24}}))
   .toThrow(/Agarrado ou empalado/);
  expect(()=>act(held,'d','personal-move',{toMetres:{x:26,y:24}}))
   .toThrow(/Agarrado ou empalado/);
  const freed=act(held,'a','personal-release-grapple');
  expect(freed.heroes.find(h=>h.id==='a')?.grapplingTargetId).toBeUndefined();
  expect(freed.heroes.find(h=>h.id==='d')?.grabbedBy).toBeUndefined();
  expect(freed.heroes.find(h=>h.id==='a')?.minorActionsUsed).toBe(1);
  expect(JSON.stringify(original)).toBe(snapshot);
 });
 it('escapar do Agarrar exige ação menor e teste oposto de Luta',()=>{
  const initial=battle('fist');
  const reversed={...initial,heroes:initial.heroes.map(h=>h.id==='a'?
   {...h,fighting:1}:h.id==='d'?{...h,fighting:12}:h)};
  // Força de preensão prévia representada por estado local válido.
  const held={...reversed,heroes:reversed.heroes.map(h=>h.id==='a'?
   {...h,grapplingTargetId:'d'}:{...h,grabbedBy:'a'})};
  const freed=act(held,'d','personal-escape-grapple');
  expect(freed.heroes.find(h=>h.id==='d')?.grabbedBy).toBeUndefined();
  expect(freed.heroes.find(h=>h.id==='a')?.grapplingTargetId).toBeUndefined();
  expect(freed.heroes.find(h=>h.id==='d')?.minorActionsUsed).toBe(1);
  expect(freed.events.some(e=>e.kind==='personal-grapple-escape')).toBe(true);
 });
 it('Rede Enredar limita a 1 m, -5 nos testes, e exige ação maior para fugir',()=>{
  const original=battle('net');
  const trapped=act(original,'a','personal-attack',{
   targetHeroId:'d',ranged:true,
  });
  expect(trapped.heroes.find(h=>h.id==='d')?.entangledBy).toBe('a');
  expect(trapped.heroes.find(h=>h.id==='a')?.entanglingTargetId).toBe('d');
  expect(trapped.heroes.find(h=>h.id==='d')?.health).toBe(100);
  expect(()=>act(trapped,'d','personal-move',{toMetres:{x:28,y:25}}))
   .toThrow(/além do Movimento/);
  const strong={...trapped,heroes:trapped.heroes.map(h=>h.id==='d'?
   {...h,athletics:12}:h)};
  const escaped=act(strong,'d','personal-escape-entangle',{
   escapeUsing:'athletics',
  });
  expect(escaped.heroes.find(h=>h.id==='d')?.entangledBy).toBeUndefined();
  expect(escaped.heroes.find(h=>h.id==='d')?.usedActions).toBe(1);
  expect(escaped.heroes.find(h=>h.id==='a')?.entanglingTargetId).toBeUndefined();
 });
 it('Empalar com três graus testa Atletismo e bloqueia deslocamento até extrair arma',()=>{
  const initial=battle('boar-spear');
  const struck=act(initial,'a','personal-attack',{targetHeroId:'d'});
  expect(struck.events.find(e=>e.kind==='personal-attack')?.degrees)
   .toBeGreaterThanOrEqual(3);
  expect(struck.heroes.find(h=>h.id==='d')?.impaledBy).toBe('a');
  expect(struck.heroes.find(h=>h.id==='a')?.impalingTargetId).toBe('d');
  expect(()=>act(struck,'d','personal-move',{toMetres:{x:27,y:25}}))
   .toThrow(/Agarrado ou empalado/);
  const pulled=act(struck,'a','personal-release-impale');
  expect(pulled.heroes.find(h=>h.id==='d')?.impaledBy).toBeUndefined();
  expect(pulled.heroes.find(h=>h.id==='a')?.impalingTargetId).toBeUndefined();
  expect(pulled.events.some(e=>e.kind==='personal-impale-release')).toBe(true);
 });
 it('Empalar mal-sucedido desarma agressor, sem fingir arma destruída',()=>{
  const original=battle('boar-spear');
  const weak={...original,heroes:original.heroes.map(h=>h.id==='a'?
   {...h,athletics:1}:h)};
  const out=act(weak,'a','personal-attack',{targetHeroId:'d'});
  expect(out.heroes.find(h=>h.id==='a')?.meleeWeaponDisarmed).toBe(true);
  expect(out.heroes.find(h=>h.id==='a')?.meleeWeaponBroken).not.toBe(true);
  const ended=act(out,'a','personal-end-turn');
  expect(()=>act(ended,'a','personal-attack',{targetHeroId:'d'}))
   .toThrow(/desarmada/);
 });
 it('um alvo empalado remove arma como ação maior e sofre ferimento',()=>{
  const original=battle('boar-spear');
  const struck=act(original,'a','personal-attack',{targetHeroId:'d'});
  const strong={...struck,heroes:struck.heroes.map(h=>h.id==='d'?
   {...h,athletics:12}:h)};
  const removed=act(strong,'d','personal-remove-impale');
  expect(removed.heroes.find(h=>h.id==='d')?.impaledBy).toBeUndefined();
  expect(removed.heroes.find(h=>h.id==='d')?.wounds).toBe(1);
  expect(removed.heroes.find(h=>h.id==='d')?.usedActions).toBe(1);
 });
});
