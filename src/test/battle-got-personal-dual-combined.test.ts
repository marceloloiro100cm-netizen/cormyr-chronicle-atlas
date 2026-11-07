import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {equipModelWarHero,equipModelWarOffhand,activePersonalOffhandDefense} from '@/lib/battle/got/personal-weapons';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function sample(manual=false,paired=true){
 const model=(id:string,name:string,side:'attacker'|'defender',
   x:number,y:number)=>{
  const h=equipModelWarHero(makeModelWarHero({id,name,side,
   position:{x:2,y:2}}),{melee:'longsword',ranged:'longbow'});
  return {...(paired?equipModelWarOffhand(h,'dagger'):h),
   fighting:10,meleeBonusDice:2,defense:8,armor:0,
   health:200,maxHealth:200,personalPosition:{x,y}};
 };
 return createWarBattle({id:'paired-weapons',name:'Ataque com duas armas',
  seed:'duas-armas-cap9',width:12,height:7,manualMitigation:manual,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'Atacantes',side:'attacker',typeId:'infantry',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Defensores',side:'defender',typeId:'infantry',
    position:{x:9,y:5}}),
  ],
  heroes:[
   model('a','Principal','attacker',25,25),
   model('d1','Primeiro','defender',26,25),
   model('d2','Segundo','defender',25,26),
  ],
 });
}
function strike(b:WarBattle,kind:'personal-attack'|'personal-dual-attack'){
 return executeWarHeroAction(b,{heroId:'a',action:{
  kind,targetHeroId:'d1',
 }});
}
function split(b:WarBattle,kind:'personal-split-attack'|'personal-combined-attack'){
 return executeWarHeroAction(b,{heroId:'a',action:{
  kind,splitTargets:['d1','d2'],splitRanks:[5,5],splitBonuses:[1,1],
 }});
}
const enemy=(b:WarBattle,id:string)=>b.heroes.find(h=>h.id===id)!;

describe('Capítulo 9 — Duas Armas e Ataque Combinado',()=>{
 it('Duas Armas é uma ação maior e adiciona +1 ao dano básico por grau',()=>{
  const b=sample(),snapshot=JSON.stringify(b);
  const one=strike(b,'personal-attack');
  const pair=strike(b,'personal-dual-attack');
  const first=one.events.find(e=>e.kind==='personal-attack')!;
  const second=pair.events.find(e=>e.kind==='personal-attack')!;
  expect(second.degrees).toBe(first.degrees);
  expect(first.degrees).toBeGreaterThan(0);
  expect(enemy(one,'d1').health-enemy(pair,'d1').health).toBe(second.degrees);
  expect(enemy(pair,'a').usedActions).toBe(1);
  expect(enemy(pair,'a').offhandDefenseSuppressed).toBe(true);
  expect(JSON.stringify(b)).toBe(snapshot);
 });
 it('adaga secundária fornece +1 Defesa sem ataque e o perde ao atacar com ela',()=>{
  const b=sample();
  expect(activePersonalOffhandDefense(enemy(b,'a'))).toBe(1);
  const normal=executeWarHeroAction(b,{heroId:'d1',action:{
   kind:'personal-attack',targetHeroId:'a',
  }});
  const used=strike(b,'personal-dual-attack');
  expect(activePersonalOffhandDefense(enemy(used,'a'))).toBe(0);
  const punished=executeWarHeroAction(used,{heroId:'d1',action:{
   kind:'personal-attack',targetHeroId:'a',
  }});
  expect(punished.events.filter(e=>e.kind==='personal-attack').at(-1)?.difficulty)
   .toBe((normal.events.find(e=>e.kind==='personal-attack')?.difficulty??0)-1);
  const started=executeWarHeroAction(used,{heroId:'a',action:{
   kind:'personal-aim',
  }});
  expect(activePersonalOffhandDefense(enemy(started,'a'))).toBe(1);
 });
 it('Duas Armas rejeita ausência de Mão Inábil ou principal de duas mãos',()=>{
  expect(()=>strike(sample(false,false),'personal-dual-attack'))
   .toThrow(/Duas Armas exige/);
  const b=sample();
  const heavy={...b,heroes:b.heroes.map(h=>h.id==='a'?
   {...h,meleeWeapon:{...h.meleeWeapon!,twoHanded:true}}:h)};
  expect(()=>strike(heavy,'personal-dual-attack')).toThrow(/Duas Armas exige/);
 });
 it('Combinado acrescenta a secundária ao dano de cada alvo sem alterar dados',()=>{
  const b=sample();
  const divided=split(b,'personal-split-attack');
  const combined=split(b,'personal-combined-attack');
  const one=divided.events.filter(e=>e.kind==='personal-attack');
  const two=combined.events.filter(e=>e.kind==='personal-attack');
  expect(one).toHaveLength(2);
  expect(two).toHaveLength(2);
  for(let i=0;i<2;i++){
   expect(two[i]?.total).toBe(one[i]?.total);
   const id=i===0?'d1':'d2';
   expect(enemy(divided,id).health-enemy(combined,id).health)
    .toBe(two[i]?.degrees);
  }
  expect(enemy(combined,'a').offhandDefenseSuppressed).toBe(true);
  expect(enemy(combined,'a').usedActions).toBe(1);
 });
 it('Combinado com mitigação manual retoma cada ataque mantendo Mão Inábil',()=>{
  const b=sample(true);
  const first=split(b,'personal-combined-attack');
  expect(first.pendingPersonalDamage?.targetHeroId).toBe('d1');
  expect(first.pendingPersonalSplit?.offhandDamageBonus).toBe(1);
  expect(first.pendingPersonalSplit?.nextIndex).toBe(1);
  const second=resolvePendingPersonalDamage(first,{kind:'injury'});
  expect(second.pendingPersonalDamage?.targetHeroId).toBe('d2');
  const completed=resolvePendingPersonalDamage(second,{kind:'none'});
  expect(completed.pendingPersonalSplit).toBeUndefined();
  expect(completed.events.filter(e=>e.kind==='personal-attack')).toHaveLength(2);
  expect(enemy(completed,'a').usedActions).toBe(1);
 });
 it('Combinado respeita restrição de arma Lenta antes de gastar ações',()=>{
  const b=sample();
  const slow={...b,heroes:b.heroes.map(h=>h.id==='a'?
   {...h,meleeWeapon:{...h.meleeWeapon!,slow:true}}:h)};
  expect(()=>split(slow,'personal-combined-attack')).toThrow(/Lenta/);
  expect(enemy(slow,'a').usedActions).toBe(0);
 });
});
