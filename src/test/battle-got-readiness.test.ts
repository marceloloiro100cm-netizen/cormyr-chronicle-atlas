import {describe,it,expect} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function example(){
 const attacker=modelWarUnit({id:'a',name:'Linha atacante',side:'attacker',
  typeId:'infantry',training:'elite',position:{x:2,y:3}});
 const basicDefender=modelWarUnit({id:'d',name:'Linha defensora',side:'defender',
  typeId:'infantry',training:'elite',position:{x:5,y:3}});
 const defender={...basicDefender,
  ability:{...basicDefender.ability,fighting:12}};
 const battle=createWarBattle({id:'ready',name:'Prontidão condicional',
  seed:'prontidao-2026',width:12,height:7,units:[attacker,defender],
  commanders:modelWarCommanders({attacker:12,defender:12})});
 return {...battle,turn:'defender' as const};
}
describe('Capítulo 10 — prontidão com condições e reação verificável',()=>{
 it('exige condição e ação antes de consumir dados e orçamento de comando',()=>{
  const battle=example();
  const before=JSON.stringify(battle);
  expect(()=>issueWarOrder(battle,{commanderId:'leader-defender',
   unitId:'d',order:{kind:'ready'}})).toThrow(/condição e reação/);
  expect(JSON.stringify(battle)).toBe(before);
 });
 it('reage ao movimento que cria adjacência, antes do encerramento do turno',()=>{
  const prepared=issueWarOrder(example(),{commanderId:'leader-defender',
   unitId:'d',order:{kind:'ready',
    ready:{trigger:'enemy-adjacent',reaction:'attack'}}});
  expect(prepared.passed).toBe(true);
  expect(prepared.battle.events.filter(e=>e.kind==='ready-trigger')).toHaveLength(0);
  expect(prepared.battle.units.find(u=>u.id==='d')?.standing?.kind).toBe('ready');
  const moved=issueWarOrder(prepared.battle,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'move',to:{x:4,y:3}}});
  expect(moved.passed).toBe(true);
  expect(moved.battle.events.some(e=>e.kind==='ready-trigger')).toBe(true);
  expect(moved.battle.units.find(u=>u.id==='d')?.standing?.kind).toBe('attack');
 });
 it('permite preparar deslocamento, consumindo a prontidão quando ativada',()=>{
  const prepared=issueWarOrder(example(),{commanderId:'leader-defender',
   unitId:'d',order:{kind:'ready',
    ready:{trigger:'enemy-adjacent',reaction:'move',to:{x:6,y:3}}}});
  const moved=issueWarOrder(prepared.battle,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'move',to:{x:4,y:3}}});
  expect(moved.battle.units.find(u=>u.id==='d')?.position).toEqual({x:6,y:3});
  expect(moved.battle.units.find(u=>u.id==='d')?.standing).toBeNull();
  expect(moved.battle.events.some(e=>e.kind==='ready-trigger')).toBe(true);
 });
});
