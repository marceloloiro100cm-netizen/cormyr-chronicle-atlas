import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {equipModelWarHero,WAR_PERSONAL_WEAPONS} from '@/lib/battle/got/personal-weapons';

function duel(weapon:'bastard-sword'|'greatsword'|'pike'|'longsword',distance=1){
 const a=equipModelWarHero(makeModelWarHero({id:'a',name:'Guerreiro A',
  side:'attacker',position:{x:2,y:3}}),{melee:weapon,ranged:'longbow'});
 const d=makeModelWarHero({id:'d',name:'Guerreiro D',
  side:'defender',position:{x:2,y:3}});
 return createWarBattle({id:'qualidade',name:'Qualidades de armas',
  seed:'armas-cap9',width:12,height:7,
  commanders:modelWarCommanders({attacker:7,defender:7}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,personalPosition:{x:25,y:35},fighting:12,meleeBonusDice:1,
    strengthBonusDice:2,defense:8,armor:0,health:200,maxHealth:200},
   {...d,personalPosition:{x:25+distance,y:35},defense:0,armor:0,
    health:200,maxHealth:200,fighting:12},
  ],
 });
}
const attack=(b:ReturnType<typeof duel>,bonus:
 {twoHandedGrip?:boolean;powerBonusDice?:number}={})=>
 executeWarHeroAction(b,{heroId:'a',action:{
  kind:'personal-attack',targetHeroId:'d',...bonus,
 }});
const event=(b:ReturnType<typeof duel>)=>b.events.find(e=>
 e.kind==='personal-attack'&&e.text.startsWith('Guerreiro A'))!;

describe('Capítulo 9 — qualidades Adaptável, Poderosa e Contra Carga',()=>{
 it('Adaptável adiciona +1 de dano básico quando a espada bastarda é usada com ambas as mãos',()=>{
  const b=duel('bastard-sword');
  expect(WAR_PERSONAL_WEAPONS['bastard-sword'].adaptable).toBe(true);
  const one=attack(b),two=attack(b,{twoHandedGrip:true});
  const degrees=event(two).degrees!;
  expect(degrees).toBeGreaterThan(0);
  expect(event(two).total).toBe(event(one).total);
  expect(one.heroes.find(h=>h.id==='d')!.health-
   two.heroes.find(h=>h.id==='d')!.health).toBe(degrees);
  expect(()=>attack(duel('longsword'),{twoHandedGrip:true}))
   .toThrow(/Adaptável/);
 });
 it('Poderosa investe cada dado de bônus de Força em +1 dano básico',()=>{
  const b=duel('greatsword');
  const standard=attack(b),boosted=attack(b,{powerBonusDice:2});
  const degrees=event(boosted).degrees!;
  expect(degrees).toBeGreaterThan(0);
  expect(standard.heroes.find(h=>h.id==='d')!.health-
   boosted.heroes.find(h=>h.id==='d')!.health).toBe(2*degrees);
  expect(()=>attack(b,{powerBonusDice:3})).toThrow(/Força/);
  expect(()=>attack(duel('longsword'),{powerBonusDice:1})).toThrow(/Poderosa/);
 });
 it('Pique não ataca normalmente e só dispara reação diante de uma carga',()=>{
  const attacker=duel('longsword',3);
  const b={...attacker,heroes:attacker.heroes.map(h=>h.id==='d'?{
   ...equipModelWarHero(h,{melee:'pike',ranged:'longbow'}),
   fighting:12,
  }:h)};
  expect(()=>executeWarHeroAction(b,{heroId:'d',action:{
   kind:'personal-attack',targetHeroId:'a',
  }})).toThrow(/Contra Carga/);
  expect(()=>executeWarHeroAction(b,{heroId:'d',action:{
   kind:'personal-counterattack',
  }})).toThrow(/só pode ser preparado contra/);
  const ready=executeWarHeroAction(b,{heroId:'d',action:{
   kind:'personal-counterattack',vsCharge:true,
  }});
  const hit=executeWarHeroAction(ready,{heroId:'a',action:{
   kind:'personal-charge',targetHeroId:'d',
  }});
  expect(hit.events.some(e=>e.kind==='personal-attack'&&
   e.text.startsWith('Guerreiro D atacou Guerreiro A'))).toBe(true);
  expect(hit.heroes.find(h=>h.id==='d')?.counterattackReady).toBeUndefined();
 });
 it('preparação contra carga não é gasta em ataque comum',()=>{
  const b=duel('longsword');
  const ready=executeWarHeroAction(b,{heroId:'d',action:{
   kind:'personal-counterattack',vsCharge:true,
  }});
  const strike=attack(ready);
  expect(strike.events.filter(e=>e.kind==='personal-attack')).toHaveLength(1);
  expect(strike.heroes.find(h=>h.id==='d')?.counterattackReady)
   .toEqual({ranged:false,vsCharge:true});
 });
});
