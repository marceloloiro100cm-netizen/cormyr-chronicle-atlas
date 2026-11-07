import {describe,it,expect} from 'vitest';
import {createWarBattle,executeWarHeroAttackUnit} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {equipModelWarHero,equipModelWarOffhand,activePersonalOffhandDefense,
 WAR_PERSONAL_WEAPONS} from '@/lib/battle/got/personal-weapons';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function arena(weapon:'war-lance'|'tourney-lance'|'greatsword'='war-lance'){
 const attacker=equipModelWarHero(makeModelWarHero({id:'a',name:'Cavaleiro',
  side:'attacker',position:{x:2,y:2}}),{melee:weapon,ranged:'medium-crossbow'});
 const defender=makeModelWarHero({id:'d',name:'Soldado',side:'defender',
  position:{x:2,y:2}});
 return createWarBattle({id:'equipment-audit',name:'Armas do capítulo 9',
  seed:'equipment-9',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',
    position:{x:2,y:2}}),
  ],heroes:[
   {...attacker,fighting:12,meleeBonusDice:1,
    defense:8,armor:0,health:100,maxHealth:100,
    personalPosition:{x:25,y:25}},
   {...defender,defense:0,armor:0,health:100,maxHealth:100,
    personalPosition:{x:26,y:25}},
  ]});
}
const personal=(b:WarBattle)=>executeWarHeroAction(b,{heroId:'a',
 action:{kind:'personal-attack',targetHeroId:'d'}});
const result=(b:WarBattle)=>b.events.find(e=>e.kind==='personal-attack')!;
const unitRoll=(b:WarBattle)=>executeWarHeroAttackUnit(b,{heroId:'a',unitId:'ud'})
 .events.find(e=>e.kind==='hero-vs-unit')!;
describe('Capítulo 9 — auditoria de armas Montadas, Duas Mãos e Mão Inábil',()=>{
 it('lança de guerra usa Lidar com Animais para dano base e recebe -2D a pé',()=>{
  const b=arena('war-lance'),actor=b.heroes[0]!;
  expect(actor.meleeDamage).toBe((actor.animalHandling??3)+4);
  expect(actor.meleeWeapon?.mountedOnly).toBe(true);
  const foot=personal(b);
  const noPenalty={...b,heroes:b.heroes.map(h=>h.id==='a'?{
   ...h,meleeWeapon:{...h.meleeWeapon!,mountedOnly:false},
  }:h)};
  const normal=personal(noPenalty);
  expect(result(foot).total).toBeLessThan(result(normal).total??0);
  const equipped={...b,heroes:b.heroes.map(h=>h.id==='a'?{
   ...h,mount:makeModelWarMount({id:'horse',name:'Cavalo'}),
   mounted:true,
  }:h)};
  expect(result(personal(equipped)).total).toBeGreaterThan(result(foot).total??0);
 });
 it('duas mãos exige ambas as mãos ou perde dois dados de teste',()=>{
  const b=arena('greatsword');
  const normal=result(personal(b));
  const restricted={...b,heroes:b.heroes.map(h=>h.id==='a'?{
   ...h,oneHandUnavailable:true,
  }:h)};
  const limited=result(personal(restricted));
  expect(limited.total).toBeLessThan(normal.total??0);
  expect(limited.roll).toEqual(normal.roll);
  expect(unitRoll(restricted).total).toBeLessThan(unitRoll(b).total??0);
 });
 it('penalidade Montada também vale contra unidade de 100 homens',()=>{
  const b=arena('war-lance');
  const noPenalty={...b,heroes:b.heroes.map(h=>h.id==='a'?{
   ...h,meleeWeapon:{...h.meleeWeapon!,mountedOnly:false},
  }:h)};
  expect(unitRoll(b).total).toBeLessThan(unitRoll(noPenalty).total??0);
 });
 it('catálogo inclui armas comuns com qualificadores declarados no livro',()=>{
  expect(WAR_PERSONAL_WEAPONS.warhammer.shattering).toBe(2);
  expect(WAR_PERSONAL_WEAPONS['tourney-lance'].fragile).toBe(true);
  expect(WAR_PERSONAL_WEAPONS.staff.fast).toBe(true);
  expect(WAR_PERSONAL_WEAPONS['medium-crossbow'].reload).toBe('minor');
  expect(WAR_PERSONAL_WEAPONS['medium-crossbow'].piercing).toBe(1);
  expect(WAR_PERSONAL_WEAPONS['myrish-crossbow'].fast).toBe(true);
  expect(WAR_PERSONAL_WEAPONS['myrish-crossbow'].trainingBonusDice).toBe(1);
 });
 it('Mão Inábil diferencia Defensiva +1 e +2 e rejeita montantes',()=>{
  const b=arena(),original=b.heroes[0]!;
  const buckler=equipModelWarOffhand(original,'buckler');
  const leftDagger=equipModelWarOffhand(original,'left-hand-dagger');
  expect(activePersonalOffhandDefense(buckler)).toBe(1);
  expect(activePersonalOffhandDefense(leftDagger)).toBe(2);
  expect(leftDagger.offhandWeapon?.offhandDamageBonus).toBe(1);
  const equipped=equipModelWarHero(makeModelWarHero({id:'x',name:'X',
   side:'attacker',position:{x:2,y:2}}),{melee:'greatsword',ranged:'longbow'});
  expect(()=>equipModelWarOffhand(equipped,'buckler'))
   .toThrow(/Duas Mãos/);
  expect(()=>equipModelWarOffhand(original,'warhammer'))
   .toThrow(/Mão Inábil/);
 });
});
