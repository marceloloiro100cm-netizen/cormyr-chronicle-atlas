import {describe,it,expect} from 'vitest';
import {createWarBattle,fireWarSiegeVolley,skipWarSiege,advanceWarRound,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeModelSiege,WAR_SIEGE_CATALOG,warSiegeDamage} from '@/lib/battle/got/siege';
import type {WarBattle} from '@/lib/battle/got/types';

function fixture(withSiege=true):WarBattle{
 const a=modelWarUnit({id:'a',side:'attacker',name:'Engenheiros',typeId:'engineers',
  training:'elite',position:{x:1,y:2}});
 const d=modelWarUnit({id:'d',side:'defender',name:'Infantaria',typeId:'infantry',
  training:'elite',position:{x:8,y:2}});
 const siege=withSiege?[makeModelSiege({
  id:'cat-a',side:'attacker',kind:'catapult-medium',engineerId:'a',position:{x:1,y:3},
 })]:[];
 return createWarBattle({id:'got-siege',name:'Cerco de ensaio',seed:'cerco-verificado',
  width:12,height:7,units:[a,withSiege?{...d,defense:35}:d],
  commanders:modelWarCommanders({attacker:6,defender:4}),siege,
 });
}
describe('Guerra do livro — armas de cerco e rendição',()=>{
 it('define equipamento sem inventar custos ou dano do sistema Adaptado',()=>{
  expect(WAR_SIEGE_CATALOG['catapult-small'].rangeMetres).toBe(300);
  expect(WAR_SIEGE_CATALOG['catapult-medium'].maxHealth).toBe(30);
  expect(WAR_SIEGE_CATALOG['catapult-large'].damage).toBe(7);
  expect(WAR_SIEGE_CATALOG.scorpion.ignoreArmor).toBe(true);
  expect(WAR_SIEGE_CATALOG.mangonel.engineerPenaltyDice).toBe(1);
  expect(WAR_SIEGE_CATALOG.trebuchet.rangeMetres).toBe(500);
  const oiled=makeModelSiege({id:'oil',kind:'catapult-small',side:'attacker',
   position:{x:0,y:0},engineerId:'a',ammo:'oil'});
  expect(warSiegeDamage(oiled)).toEqual({base:3,ignoresArmor:true});
 });
 it('Passo Cinco precede ordens; ignorar disparos preserva orçamento',()=>{
  const b=fixture();
  expect(b.phase).toBe('siege');
  const budget={...b.ordersRemaining};
  const first=skipWarSiege(b);
  expect(first.ordersRemaining).toEqual(budget);
  const second=skipWarSiege(first);
  expect(second.phase).toBe('orders');
  expect(second.ordersRemaining).toEqual(budget);
 });
 it('uma ordem dispara, tem dados registrados e a máquina exige recarga',()=>{
  const b=fixture();
  const a=b.turn==='defender'?skipWarSiege(b):b;
  expect(a.turn).toBe('attacker');
  const fired=fireWarSiegeVolley(a,{commanderId:'leader-attacker',
   weaponIds:['cat-a'],targetId:'d'});
  const first=fired.phase==='siege'?skipWarSiege(fired):fired;
  expect(first.phase).toBe('orders');
  expect(first.ordersRemaining['leader-attacker']).toBe(5);
  expect(first.siege[0]!.lastFiredRound).toBe(1);
  expect(first.events.some(e=>e.kind==='siege'&&e.roll?.length)).toBe(true);
  const r2=advanceWarRound(first);
  expect(r2.phase).toBe('siege');
  const next=r2.turn==='defender'?skipWarSiege(r2):r2;
  expect(()=>fireWarSiegeVolley(next,{commanderId:'leader-attacker',
   weaponIds:['cat-a'],targetId:'d'})).toThrow(/recarregar/);
  // Rodada de cerco pode ser ignorada em ambos os exércitos.
  const done=skipWarSiege(next);
  expect(done.phase).toBe('orders');
 });
 it('recusa máquina sem unidade de engenheiros',()=>{
  const b=fixture(false);
  expect(()=>createWarBattle({id:'invalid',name:'X',seed:'x',width:12,height:7,
   units:b.units.map(u=>u.id==='a'?{...u,typeId:'infantry'}:u),
   commanders:b.commanders,
   siege:[makeModelSiege({id:'w',kind:'trebuchet',side:'attacker',position:{x:1,y:3},engineerId:'a'})],
  })).toThrow(/engenheiros/);
 });
 it('rendição geral testa cada unidade ativa e propõe vitória sem mudar a Casa',()=>{
  const battle={...fixture(false),turn:'attacker' as const};
  const result=issueWarOrder(battle,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'surrender'}});
  expect(result.battle.events.filter(e=>e.kind==='surrender')).toHaveLength(1);
  expect(['surrendered','routed']).toContain(result.battle.units.find(u=>u.id==='a')?.condition);
  expect(result.battle.phase).toBe('finished');
  expect(result.battle.winner).toBe('defender');
  expect(battle.units.find(u=>u.id==='a')?.health).toBe(9);
 });
 it('falha crítica de retirada produz debandada e encerramento de lado derrotado',()=>{
  const initial=fixture(false);
  const b={...initial,turn:'attacker' as const,
   units:initial.units.map(u=>u.id==='a'?{...u,discipline:50}:u)};
  const result=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'retreat'}});
  expect(result.critical).toBe(true);
  expect(result.battle.units.find(u=>u.id==='a')?.condition).toBe('routed');
  expect(result.battle.events.some(e=>e.kind==='critical-retreat')).toBe(true);
 });
});
