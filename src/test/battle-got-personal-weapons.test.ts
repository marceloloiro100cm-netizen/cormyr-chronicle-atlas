import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {equipModelWarHero,effectivePersonalArmor,WAR_PERSONAL_WEAPONS} from '@/lib/battle/got/personal-weapons';

function battle(range=3,axe=true){
 const attacker=makeModelWarHero({id:'h1',name:'Atacante',side:'attacker',position:{x:2,y:2}});
 const target=makeModelWarHero({id:'h2',name:'Defensor',side:'defender',position:{x:2,y:2}});
 return createWarBattle({id:'weapon',name:'Equipamento pessoal',seed:'weapon-ch9',
  width:10,height:6,commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:3}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:8,y:3}}),
  ],
  heroes:[
   {...equipModelWarHero(attacker,{melee:axe?'long-axe':'longsword',
    ranged:'longbow'}),fighting:12,marksmanship:12,personalPosition:{x:25,y:25}},
   {...target,armor:5,defense:0,health:40,maxHealth:40,
    personalPosition:{x:25+range,y:25}},
  ]});
}
describe('Capítulo 9 — amostra auditável de armas pessoais',()=>{
 it('espada longa usa Atletismo +1; arco longo usa Agilidade +2 e Perfurante 1',()=>{
  const hero=equipModelWarHero(makeModelWarHero({id:'x',name:'X',side:'attacker',
   position:{x:1,y:1}}),{melee:'longsword',ranged:'longbow'});
  expect(hero.meleeDamage).toBe(4);
  expect(hero.rangedDamage).toBe(5);
  expect(effectivePersonalArmor(5,hero.rangedWeapon)).toBe(4);
  expect(WAR_PERSONAL_WEAPONS['long-axe'].reachMetres).toBe(3);
 });
 it('arma Comprida alcança três metros; espada comum não',()=>{
  const longRange=executeWarHeroAction(battle(),{heroId:'h1',
   action:{kind:'personal-attack',targetHeroId:'h2'}});
  expect(longRange.events.some(e=>e.kind==='personal-attack')).toBe(true);
  expect(()=>executeWarHeroAction(battle(3,false),{heroId:'h1',
   action:{kind:'personal-attack',targetHeroId:'h2'}})).toThrow(/alcance/);
 });
 it('Perfurante reduz apenas VA, sem duplicar graus de dano',()=>{
  const withPiercing=battle(4);
  const withoutPiercing={...withPiercing,
   heroes:withPiercing.heroes.map(h=>h.id==='h1'?{
    ...h,rangedWeapon:{...h.rangedWeapon!,piercing:0},
   }:h)};
  const p=executeWarHeroAction(withPiercing,{heroId:'h1',
   action:{kind:'personal-attack',targetHeroId:'h2',ranged:true}});
  const n=executeWarHeroAction(withoutPiercing,{heroId:'h1',
   action:{kind:'personal-attack',targetHeroId:'h2',ranged:true}});
  expect(p.heroes.find(h=>h.id==='h2')!.health)
   .toBe(n.heroes.find(h=>h.id==='h2')!.health-1);
 });
});
