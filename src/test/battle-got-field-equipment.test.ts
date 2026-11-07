import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {makeWarFortification,fortDefense} from '@/lib/battle/got/fortifications';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {WAR_FIELD_EQUIPMENT,warFieldDefenseBonus,warFieldMovementMetres,
 warFieldOrderDifficulty,warFieldForbidsAttack} from '@/lib/battle/got/field-equipment';
import type {WarFieldEquipmentId} from '@/lib/battle/got/field-equipment';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

function arena(item:WarFieldEquipmentId,fortSide:'attacker'|'defender'|null=null):WarBattle{
 const a=modelWarUnit({id:'a',name:'Vanguarda',side:'attacker',
  typeId:'infantry',position:{x:2,y:3}});
 const b=modelWarUnit({id:'b',name:'Inimigos',side:'defender',
  typeId:'garrison',position:{x:3,y:3}});
 const fort=fortSide?makeWarFortification({id:'gate',name:'Portão',
  kind:'tower',side:fortSide,
  cells:[fortSide==='attacker'?{x:2,y:3}:{x:3,y:3}],
  engineerBuilt:false,hoursBuilt:12,structuralHealth:5,structuralArmor:0}):null;
 const initial=createWarBattle({id:'field-ch10',name:'Equipamentos do livro',
  seed:'field-gear-stable',width:12,height:7,
  commanders:modelWarCommanders({attacker:12,defender:6}),
  units:[{...a,fieldEquipment:item,
   ability:{...a.ability,athletics:12,marksmanship:12}},
   {...b,ability:{...b.ability,endurance:20},health:60,maxHealth:60,
    armor:15,defense:0}],
  ...(fort?{fortifications:[fort]}:{})});
 return {...initial,turn:'attacker'};
}
const actor=(b:WarBattle)=>b.units.find(u=>u.id==='a')!;
const target=(b:WarBattle)=>b.units.find(u=>u.id==='b')!;
const order=(b:WarBattle,kind:'attack'|'fire-special'|'breach-gate'|
 'discard-equipment',targetId='b')=>issueWarOrder(b,{
 commanderId:'leader-attacker',unitId:'a',
 order:{kind,...(kind==='breach-gate'?{fortId:'gate',wallDifficulty:9}:{targetId})},
});
describe('Capítulo 10 — equipamentos de campo e uso único',()=>{
 it('manteletes, tartaruga e torre concedem proteção e limitam Movimento',()=>{
  const m=actor(arena('mantlet')),t=actor(arena('tortoise')),
   tower=actor(arena('siege-tower'));
  expect(warFieldDefenseBonus(m,true)).toBe(5);
  expect(warFieldDefenseBonus(m,false)).toBe(0);
  expect(warFieldMovementMetres(m,40)).toBe(30);
  expect(warFieldDefenseBonus(t,false)).toBe(10);
  expect(warFieldDefenseBonus(t,true)).toBe(10);
  expect(warFieldMovementMetres(t,40)).toBe(10);
  expect(warFieldMovementMetres(tower,40)).toBe(10);
  expect(warFieldDefenseBonus(tower,true)).toBe(5);
  expect(warFieldForbidsAttack(t)).toBe(true);
  expect(WAR_FIELD_EQUIPMENT.ladders.cost).toBe(0.5);
 });
 it('tartaruga impede ataques até abandono do equipamento',()=>{
  const b=arena('tortoise'),snapshot=JSON.stringify(b);
  expect(()=>order(b,'attack')).toThrow(/equipamento especial impede ataques/);
  expect(JSON.stringify(b)).toBe(snapshot);
  const discarded=order(b,'discard-equipment').battle;
  expect(actor(discarded).fieldEquipmentConsumed).toBe(true);
  expect(warFieldForbidsAttack(actor(discarded))).toBe(false);
  expect(warFieldMovementMetres(actor(discarded),40)).toBe(40);
 });
 it('fogo selvagem tem +3 Disciplina, ignora VA e é consumido após uma tentativa',()=>{
  const b=arena('wildfire-pots');
  expect(warFieldOrderDifficulty(actor(b))).toBe(3);
  const fired=order(b,'fire-special');
  expect(fired.passed).toBe(true);
  expect(actor(fired.battle).fieldEquipmentConsumed).toBe(true);
  expect(target(fired.battle).health).toBeLessThan(60);
  expect(target(fired.battle).burning?.damagePerRound).toBe(7);
  expect(warFieldOrderDifficulty(actor(fired.battle))).toBe(0);
  expect(()=>order(fired.battle,'fire-special'))
   .toThrow(/não possui munição especial/);
 });
 it('óleo e água fervente exigem muralhas e causam dano sem VA',()=>{
  const failed=arena('boiling-water');
  expect(()=>order(failed,'fire-special')).toThrow(/fortificação/);
  const applied=order(arena('boiling-water','attacker'),'fire-special');
  expect(target(applied.battle).health).toBe(55);
  const appliedOil=order(arena('boiling-oil','attacker'),'fire-special');
  expect(target(appliedOil.battle).health).toBe(50);
  expect(actor(appliedOil.battle).fieldEquipmentConsumed).toBe(true);
 });
 it('aríete recebe +2B de Atletismo para arrombar e abre brecha',()=>{
  const b=arena('ram','defender');
  const out=order(b,'breach-gate');
  expect(out.passed).toBe(true);
  const fort=out.battle.fortifications[0]!;
  expect(fort.breached).toBe(true);
  expect(fortDefense(fort)).toBe(0);
  expect(out.battle.events.some(e=>e.kind==='ram-test')).toBe(true);
  expect(target(out.battle).health).toBe(60);
  expect(JSON.stringify(b.fortifications[0])).not.toContain('breached');
 });
 it('aríete coberto protege unidade e usa Atletismo 8',()=>{
  const b=arena('covered-ram','defender');
  expect(warFieldDefenseBonus(actor(b),false)).toBe(5);
  const out=order(b,'breach-gate');
  const test=out.battle.events.find(e=>e.kind==='ram-test');
  expect(test?.difficulty).toBe(9);
  expect(test?.roll).toHaveLength(8);
 });
 it('cavalaria não pode equipar tortoise e aríete',()=>{
  const b=arena('tortoise');
  const illegal={...b.units[0]!,mounted:true};
  expect(()=>createWarBattle({id:'invalid',name:'Invalid',
   seed:'invalid-field',width:12,height:7,
   commanders:b.commanders,units:[illegal,b.units[1]!]}))
   .toThrow(/Cavalaria\/navios/);
 });
});
