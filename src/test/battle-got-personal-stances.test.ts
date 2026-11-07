import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function scenario(){
 const a=makeModelWarHero({id:'a',name:'Atacante',side:'attacker',position:{x:2,y:3}});
 const d=makeModelWarHero({id:'d',name:'Defensor',side:'defender',position:{x:2,y:3}});
 return createWarBattle({id:'advanced-stance',name:'Posturas avançadas',
  seed:'stance-chapter-9',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,fighting:8,marksmanship:8,defense:8,armor:0,health:200,maxHealth:200,
    personalPosition:{x:25,y:35}},
   {...d,fighting:8,marksmanship:8,defense:8,armor:0,health:200,maxHealth:200,
    personalPosition:{x:26,y:35}},
  ],
 });
}
const action=(b:WarBattle,heroId:'a'|'d',kind:
 'personal-aim'|'personal-attack'|'personal-cautious-attack'|
 'personal-reckless-attack'|'personal-move'|'personal-pass',
 extra:{targetHeroId?:string;ranged?:boolean;toMetres?:{x:number;y:number}}={})=>
 executeWarHeroAction(b,{heroId,action:{kind,...extra}});
const strike=(b:WarBattle)=>b.events.filter(e=>e.kind==='personal-attack').at(-1)!;

describe('Capítulo 9 — mirar, atacar cautelosamente e ataque imprudente',()=>{
 it('Mirar consome ação menor e concede exatamente +1B ao próximo ataque',()=>{
  const initial=scenario(),snapshot=JSON.stringify(initial);
  const normal=action(initial,'a','personal-attack',{targetHeroId:'d'});
  const aimed=action(initial,'a','personal-aim');
  expect(aimed.heroes.find(h=>h.id==='a')?.minorActionsUsed).toBe(1);
  expect(aimed.heroes.find(h=>h.id==='a')?.aimBonusDice).toBe(1);
  expect(()=>action(aimed,'a','personal-aim')).toThrow(/não acumula/);
  const shot=action(aimed,'a','personal-attack',{targetHeroId:'d'});
  expect(strike(shot).roll?.length).toBe((strike(normal).roll?.length??0)+1);
  expect(strike(shot).total).toBeGreaterThanOrEqual(strike(normal).total??0);
  expect(shot.heroes.find(h=>h.id==='a')?.usedActions).toBe(1);
  expect(shot.heroes.find(h=>h.id==='a')?.aimBonusDice).toBe(0);
  expect(JSON.stringify(initial)).toBe(snapshot);
 });
 it('Ataque Cauteloso impõe -1D e Defesa +3 até iniciar turno posterior',()=>{
  const b=scenario();
  const normal=action(b,'a','personal-attack',{targetHeroId:'d'});
  const cautious=action(b,'a','personal-cautious-attack',{targetHeroId:'d'});
  expect(strike(cautious).total).toBeLessThanOrEqual(strike(normal).total??0);
  expect(cautious.heroes.find(h=>h.id==='a')?.cautiousDefenseBonus).toBe(3);
  const defended=action(cautious,'d','personal-attack',{targetHeroId:'a'});
  const baseline=action(normal,'d','personal-attack',{targetHeroId:'a'});
  expect(strike(defended).difficulty).toBe((strike(baseline).difficulty??0)+3);
  const completed=action(defended,'a','personal-move',{toMetres:{x:25,y:35}});
  expect(completed.heroes.find(h=>h.id==='a')?.cautiousDefenseBonus).toBe(3);
  expect(completed.heroes.find(h=>h.id==='a')?.usedActions).toBe(1);
  const next=action(completed,'a','personal-pass');
  expect(next.heroes.find(h=>h.id==='a')?.cautiousDefenseBonus).toBe(0);
 });
 it('Ataque Imprudente fornece +1D de teste de Luta e reduz Defesa em 5',()=>{
  const b=scenario();
  const normal=action(b,'a','personal-attack',{targetHeroId:'d'});
  const reckless=action(b,'a','personal-reckless-attack',{targetHeroId:'d'});
  expect(strike(reckless).roll?.length).toBe((strike(normal).roll?.length??0)+1);
  expect(reckless.heroes.find(h=>h.id==='a')?.usedActions).toBe(1);
  expect(reckless.heroes.find(h=>h.id==='a')?.recklessDefensePenalty).toBe(5);
  expect(()=>action(b,'a','personal-reckless-attack',{
   targetHeroId:'d',ranged:true,
  })).toThrow(/Luta corpo a corpo/);
  const punished=action(reckless,'d','personal-attack',{targetHeroId:'a'});
  const baseline=action(normal,'d','personal-attack',{targetHeroId:'a'});
  expect(strike(punished).difficulty).toBe((strike(baseline).difficulty??0)-5);
  const after=action(punished,'a','personal-pass');
  expect(after.heroes.find(h=>h.id==='a')?.recklessDefensePenalty).toBe(0);
 });
 it('um ataque anterior na rodada bloqueia segundo ataque cauteloso',()=>{
  const b=action(scenario(),'a','personal-attack',{targetHeroId:'d'});
  expect(()=>action(b,'a','personal-cautious-attack',{targetHeroId:'d'}))
   .toThrow(/Somente um ataque/);
 });
});
