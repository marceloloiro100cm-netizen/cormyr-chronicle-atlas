import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {makeWarFortification} from '@/lib/battle/got/fortifications';
import {warFieldForbidsAttack} from '@/lib/battle/got/field-equipment';
import type {WarFieldEquipmentId} from '@/lib/battle/got/field-equipment';

function arena(equipment:WarFieldEquipmentId,athletics=12){
 const a=modelWarUnit({id:'a',name:'Atacantes',side:'attacker',
  typeId:'infantry',position:{x:2,y:2}});
 const d=modelWarUnit({id:'d',name:'Defensores',side:'defender',
  typeId:'garrison',position:{x:9,y:2}});
 const initial=createWarBattle({id:'special-geometry',name:'Cercos e escadas',
  seed:'sprint-special',width:12,height:7,
  advancedFormations:true,
  commanders:modelWarCommanders({attacker:12,defender:8}),
  units:[{...a,formation:'column',fieldEquipment:equipment,
   ability:{...a.ability,athletics}},d],
  fortifications:[makeWarFortification({
   id:'fort',name:'Torre de vigia',side:'defender',kind:'tower',
   cells:[{x:3,y:2}],engineerBuilt:false,hoursBuilt:10,
  })]});
 return {...initial,turn:'attacker' as const,phase:'orders' as const};
}
const order=(b:ReturnType<typeof arena>,action:'move'|'climb-walls',
 to?:{x:number;y:number})=>issueWarOrder(b,{commanderId:'leader-attacker',
 unitId:'a',order:action==='move'?{
  kind:'move',to:to!,sprint:true,
 }:{
  kind:'climb-walls',fortId:'fort',wallDifficulty:6,
 }});
describe('Equipamento especializado — geometria e escadas no livro',()=>{
 it('Tartaruga não acelera 4× quando recebe ordem de correr',()=>{
  const b=arena('tortoise');
  expect(()=>order(b,'move',{x:5,y:2})).toThrow(/Destino inacessível/);
  expect(b.units[0]?.position).toEqual({x:2,y:2});
  const one=order(b,'move',{x:2,y:3});
  expect(one.passed).toBe(true);
  expect(one.battle.units.find(u=>u.id==='a')?.position).toEqual({x:2,y:3});
 });
 it('Torre de cerco transpõe a muralha sem testar Atletismo e remove +3 de comando',()=>{
  const b=arena('siege-tower',1);
  const result=order(b,'climb-walls');
  expect(result.passed).toBe(true);
  expect(result.battle.units.find(u=>u.id==='a')?.position).toEqual({x:3,y:2});
  expect(result.battle.events.find(e=>e.kind==='climb-walls')?.degrees).toBe(1);
  expect(result.difficulty).toBe(b.units[0]!.discipline);
 });
 it('Escadas eliminam +3 no comando, concedem +1B e deixam atacar depois de instaladas',()=>{
  const b=arena('ladders',12);
  expect(warFieldForbidsAttack(b.units[0]!)).toBe(true);
  const result=order(b,'climb-walls');
  const actor=result.battle.units.find(u=>u.id==='a')!;
  expect(result.passed).toBe(true);
  expect(actor.laddersDeployed).toBe(true);
  expect(warFieldForbidsAttack(actor)).toBe(false);
  expect(result.battle.events.find(e=>e.kind==='climb-walls')?.roll)
   .toHaveLength(13);
  expect(result.difficulty).toBe(b.units[0]!.discipline);
 });
});
