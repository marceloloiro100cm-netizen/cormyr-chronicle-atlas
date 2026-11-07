import {describe,expect,it} from 'vitest';
import {createWarBattle,executeWarHeroAttackUnit} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function example(weapon:'sledgehammer'|'peasant-tool'){
 const hero=equipModelWarHero(makeModelWarHero({id:'hero',name:'Campeão',
  side:'attacker',position:{x:2,y:3}}),{melee:weapon,ranged:'longbow'});
 const defender=modelWarUnit({id:'d',name:'Guarnição',side:'defender',
  typeId:'garrison',position:{x:2,y:3}});
 return createWarBattle({id:'qualities-unit',name:'Qualidades contra unidade',
  seed:'armor-formation',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'a',name:'Aliados',side:'attacker',
    typeId:'infantry',position:{x:1,y:5}}),
   {...defender,ability:{...defender.ability,endurance:12},
    defense:0,armor:6,health:36,maxHealth:36},
  ],
  heroes:[{...hero,fighting:12,meleeBonusDice:2,
   personalPosition:{x:25,y:35}}],
 });
}
describe('Capítulo 9 → 10 — qualidades de armas contra uma formação',()=>{
 it('Estilhaçadora reduz VA da unidade depois de calcular o primeiro golpe',()=>{
  const b=example('sledgehammer');
  const hit=executeWarHeroAttackUnit(b,{heroId:'hero',unitId:'d'});
  expect(hit.events.find(e=>e.kind==='hero-vs-unit')?.degrees).toBeGreaterThanOrEqual(2);
  expect(hit.units.find(u=>u.id==='d')?.armor).toBe(5);
  expect(hit.events.some(e=>e.kind==='hero-shatter-unit')).toBe(true);
  expect(b.units.find(u=>u.id==='d')?.armor).toBe(6);
 });
 it('Frágil quebra ao obter dois graus e bloqueia outro golpe coletivo',()=>{
  const b=example('peasant-tool');
  const hit=executeWarHeroAttackUnit(b,{heroId:'hero',unitId:'d'});
  expect(hit.events.find(e=>e.kind==='hero-vs-unit')?.degrees).toBeGreaterThanOrEqual(2);
  expect(hit.heroes.find(h=>h.id==='hero')?.meleeWeaponBroken).toBe(true);
  expect(()=>executeWarHeroAttackUnit(hit,{heroId:'hero',unitId:'d'}))
   .toThrow(/Arma quebrada/);
 });
});
