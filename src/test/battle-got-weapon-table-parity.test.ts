import {describe,expect,it} from 'vitest';
import {WAR_PERSONAL_WEAPONS,equipModelWarOffhand,
 activePersonalOffhandDefense} from '@/lib/battle/got/personal-weapons';
import {makeModelWarHero} from '@/lib/battle/got/heroes';

/** Regression anchors transcribed from the Portuguese core rulebook, table 9-3
 * (printed pages 196-197, PDF pages 197-198).
 */
describe('Tabela 9-3 — fidelidade de qualidades, treinamento e Volume',()=>{
 it('Punho e Adaga são Mão Inábil, mas não Rápidas; Espada Pequena é Rápida',()=>{
  const fist=WAR_PERSONAL_WEAPONS.fist;
  const dagger=WAR_PERSONAL_WEAPONS.dagger;
  expect(fist.grapple).toBe(true);
  expect(fist.offhandDamageBonus).toBe(1);
  expect(fist.fast).not.toBe(true);
  expect(dagger.shortBlade).toBe(true);
  expect(dagger.offhandDamageBonus).toBe(1);
  expect(dagger.defensiveOffhandBonus).toBe(1);
  expect(dagger.fast).not.toBe(true);
  expect(WAR_PERSONAL_WEAPONS.shortsword.fast).toBe(true);
  expect(WAR_PERSONAL_WEAPONS.spear.fast).toBe(true);
 });
 it('Pique é Contra Carga, Empalar e Desajeitada; Lança de javali exige Duas Mãos',()=>{
  expect(WAR_PERSONAL_WEAPONS.pike).toMatchObject({
   counterChargeOnly:true,impale:true,clumsy:true,twoHanded:true,slow:true,
   damageAbility:'athletics',damageBonus:2,
  });
  expect(WAR_PERSONAL_WEAPONS['boar-spear']).toMatchObject({
   trainingBonusDice:1,twoHanded:true,impale:true,slow:true,powerful:true,
   damageBonus:1,
  });
 });
 it('Volumes dos equipamentos pesados são os da tabela impressa',()=>{
  const bulky={
   sledgehammer:1,warhammer:1,'long-axe':1,
   'war-lance':2,'tourney-lance':1,halberd:1,
   'large-shield':1,'body-shield':2,
  } as const;
  for(const [id,bulk] of Object.entries(bulky)){
   const weapon=WAR_PERSONAL_WEAPONS[id as keyof typeof WAR_PERSONAL_WEAPONS];
   expect(weapon.bulk, id).toBe(bulk);
  }
  expect(WAR_PERSONAL_WEAPONS.sledgehammer.stunning).toBe(true);
  expect(WAR_PERSONAL_WEAPONS.warhammer.shattering).toBe(2);
 });
 it('Arcos, escudos, bestas e mangual preservam as qualidades impressas',()=>{
  expect(WAR_PERSONAL_WEAPONS['hunting-bow']).toMatchObject({
   family:'ranged',range:'long',twoHanded:true,
  });
  expect(WAR_PERSONAL_WEAPONS.longbow).toMatchObject({
   clumsy:true,twoHanded:true,piercing:1,trainingBonusDice:1,
  });
  expect(WAR_PERSONAL_WEAPONS['body-shield']).toMatchObject({
   defensiveOffhandBonus:6,trainingBonusDice:2,bulk:2,
  });
  expect(WAR_PERSONAL_WEAPONS['myrish-crossbow']).toMatchObject({
   fast:true,reload:'minor',trainingBonusDice:1,piercing:1,twoHanded:true,
  });
  expect(WAR_PERSONAL_WEAPONS['heavy-crossbow']).toMatchObject({
   cruel:true,reload:'major',piercing:2,twoHanded:true,slow:true,
  });
  expect(WAR_PERSONAL_WEAPONS.flail).toMatchObject({
   twoHanded:true,trainingBonusDice:2,shattering:1,powerful:true,
  });
 });
 it('equipar Punho como Mão Inábil não concede Defesa fictícia',()=>{
  const model=makeModelWarHero({id:'hero',name:'Herói',
   side:'attacker',position:{x:2,y:2}});
  const equipped=equipModelWarOffhand(model,'fist');
  expect(equipped.offhandWeapon?.offhandDamageBonus).toBe(1);
  expect(activePersonalOffhandDefense(equipped)).toBe(0);
  expect(activePersonalOffhandDefense(equipModelWarOffhand(model,'dagger'))).toBe(1);
 });
 it('a identidade de cada item do catálogo coincide com sua chave',()=>{
  for(const [key,weapon] of Object.entries(WAR_PERSONAL_WEAPONS)){
   expect(weapon.id,key).toBe(key);
   expect(weapon.label.length,key).toBeGreaterThan(0);
   expect(weapon.piercing,key).toBeGreaterThanOrEqual(0);
   expect(weapon.family==='ranged'?weapon.range!=='none':weapon.range==='none',key)
    .toBe(true);
  }
 });
});
