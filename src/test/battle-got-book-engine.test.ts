import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,advanceWarRound} from '@/lib/battle/got/engine';
import {rollDice,degreesOfSuccess,criticalFailure} from '@/lib/battle/got/dice';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {resolveEquipmentDamage} from '@/lib/battle/got/official-adapter';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

function fixture(options:{training?:WarUnit['training'];warfare?:number;distance?:number}={}):WarBattle{
 const training=options.training??'elite';
 return createWarBattle({
  id:'test-got',name:'Teste capítulo 10',seed:'book-core-v1',
  width:12,height:7,
  units:[
   modelWarUnit({id:'a',name:'Infantaria A',side:'attacker',typeId:'infantry',training,
    position:{x:2,y:3}}),
   modelWarUnit({id:'d',name:'Infantaria D',side:'defender',typeId:'infantry',training,
    position:{x:2+(options.distance??1),y:3}}),
  ],
  commanders:modelWarCommanders({attacker:options.warfare??8,defender:options.warfare??8}),
 });
}
describe('Guerra do livro — motor independente e rolagens',()=>{
 it('faz o teste de dados de seis lados com retenção dos melhores e penalidade posterior',()=>{
  const roll=rollDice(123456,4,2,1);
  expect(roll.dice).toHaveLength(6);
  expect(roll.kept).toHaveLength(3);
  expect(roll.kept.every(v=>v>=1&&v<=6)).toBe(true);
  const kept=roll.dice.slice().sort((a,b)=>b-a).slice(0,4).slice(0,3);
  expect(roll.kept).toEqual(kept);
  expect(rollDice(123456,4,2,1)).toEqual(roll);
 });
 it('calcula graus por intervalos de cinco e falha crítica por margem de cinco',()=>{
  expect([9,13,14,19,24,29].map(x=>degreesOfSuccess(x,9))).toEqual([1,1,2,3,4,4]);
  expect(criticalFailure(4,9)).toBe(true);
  expect(criticalFailure(5,9)).toBe(false);
 });
 it('utiliza a fórmula do equipamento, sem PV e dano por soldado do Adaptado',()=>{
  const attrs={agility:3,athletics:2,awareness:2,endurance:3,fighting:3,
   marksmanship:2,animalHandling:4};
  expect(resolveEquipmentDamage('Atletismo−1',attrs)).toBe(1);
  expect(resolveEquipmentDamage('Agilidade +2 · longo',attrs)).toBe(5);
  expect(resolveEquipmentDamage('Lidar com animais+3',attrs)).toBe(7);
 });
 it('cria tabuleiro quadrado a 10 metros, ordens por Guerra e iniciativa do comandante',()=>{
  const battle=fixture();
  expect(battle.rulesVersion).toBe('GOT-CH10-1');
  expect(battle.metresPerCell).toBe(10);
  expect(battle.ordersRemaining['leader-attacker']).toBe(8);
  expect(battle.ordersRemaining['leader-defender']).toBe(8);
  expect(battle.events.filter(e=>e.kind==='initiative')).toHaveLength(2);
 });
 it('ativa a unidade no primeiro sucesso e cobra ordem adicional com dificuldade cumulativa',()=>{
  const original={...fixture(),turn:'attacker' as const};
  const first=issueWarOrder(original,{commanderId:'leader-attacker',unitId:'a',order:{kind:'ready',ready:{trigger:'enemy-adjacent',reaction:'attack'}}});
  expect(first.passed).toBe(true);
  expect(first.difficulty).toBe(0);
  expect(first.battle.units.find(u=>u.id==='a')?.activated).toBe(true);
  expect(first.battle.ordersRemaining['leader-attacker']).toBe(7);
  const second=issueWarOrder({...first.battle,turn:'attacker'},
   {commanderId:'leader-attacker',unitId:'a',order:{kind:'defend'}});
  expect(second.difficulty).toBe(3);
 });
 it('um fracasso crítico consome uma ordem sem ativar unidade nem substituir ordem por outra engine',()=>{
  const original=fixture({training:'green',warfare:1});
  const battle={...original,turn:'attacker' as const,
   units:original.units.map(u=>u.id==='a'?{...u,discipline:30}:u)};
  const fail=issueWarOrder(battle,{commanderId:'leader-attacker',unitId:'a',order:{kind:'ready',ready:{trigger:'enemy-adjacent',reaction:'attack'}}});
  expect(fail.critical).toBe(true);
  expect(fail.passed).toBe(false);
  expect(fail.battle.ordersRemaining['leader-attacker']).toBe(0);
  expect(fail.battle.units.find(u=>u.id==='a')?.activated).toBe(false);
 });
 it('aplica ataque com graus, absorção fixa de armadura e Saúde coletiva',()=>{
  const b=fixture();
  const a=b.units.find(u=>u.id==='a')!,d=b.units.find(u=>u.id==='d')!;
  const battle={...b,turn:'attacker' as const,
   units:b.units.map(u=>u.id==='d'?{...d,defense:0,armor:0}:u.id==='a'?
    {...a,meleeDamage:2}:u)};
  const result=issueWarOrder(battle,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'attack',targetId:'d'}});
  expect(result.passed).toBe(true);
  expect(result.battle.events.some(e=>e.kind==='attack'&&e.degrees!>0)).toBe(true);
  expect(result.battle.units.find(u=>u.id==='d')!.health).toBeLessThan(9);
  expect(result.battle.units.find(u=>u.id==='d')!.health).toBeGreaterThanOrEqual(0);
 });
 it('mantém ordem contínua no ciclo e reinicia contagem de comando por rodada',()=>{
  const b={...fixture(),turn:'attacker' as const};
  const result=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',order:{kind:'ready',ready:{trigger:'enemy-adjacent',reaction:'attack'}}});
  const next=advanceWarRound(result.battle);
  expect(next.round).toBe(2);
  expect(next.ordersRemaining['leader-attacker']).toBe(8);
  expect(next.units.find(u=>u.id==='a')!.standing?.kind).toBe('ready');
  expect(next.units.find(u=>u.id==='a')!.issuedThisRound).toBe(0);
 });
 it('falha comum conserva ordem permanente e ela atua ao final da rodada',()=>{
  const baseline={...fixture(),turn:'attacker' as const};
  const begin=issueWarOrder(baseline,{commanderId:'leader-attacker',unitId:'a',order:{kind:'defend'}});
  const nextRound=advanceWarRound(begin.battle);
  const before={...nextRound,turn:'attacker' as const};
  const test=rollDice(before.seed,8).total;
  const prepared={...before,
   units:before.units.map(u=>u.id==='a'?{...u,discipline:test+1}:u)};
  const failing=issueWarOrder(prepared,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'ready',ready:{trigger:'enemy-adjacent',reaction:'attack'}}});
  expect(failing.passed).toBe(false);
  expect(failing.critical).toBe(false);
  const defendsBefore=failing.battle.events.filter(e=>e.kind==='defend').length;
  const after=advanceWarRound(failing.battle);
  expect(after.events.filter(e=>e.kind==='defend').length).toBe(defendsBefore+1);
 });
 it('não permite ultrapassar ordens nem criar comando sem comandante válido',()=>{
  const b={...fixture(),turn:'attacker' as const};
  expect(()=>issueWarOrder({...b,ordersRemaining:{...b.ordersRemaining,'leader-attacker':0}},
   {commanderId:'leader-attacker',unitId:'a',order:{kind:'ready',ready:{trigger:'enemy-adjacent',reaction:'attack'}}})).toThrow(/ordens terminaram/);
  expect(()=>createWarBattle({
   id:'invalid',name:'invalid',seed:'x',width:12,height:7,units:b.units,commanders:[],
  })).toThrow(/comandante válido/);
 });
});
