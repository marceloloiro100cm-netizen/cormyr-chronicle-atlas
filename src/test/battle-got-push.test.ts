import {describe,it,expect} from 'vitest';
import {createWarBattle,issueWarOrder,advanceWarRound} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function make(blocked=false){
 const basicAttacker=modelWarUnit({id:'a',name:'Piqueiros A',side:'attacker',
  typeId:'infantry',training:'elite',position:{x:2,y:3}});
 const basicDefender=modelWarUnit({id:'d',name:'Piqueiros D',side:'defender',
  typeId:'infantry',training:'elite',position:{x:3,y:3}});
 const attacker={...basicAttacker,ability:{...basicAttacker.ability,fighting:12}};
 const defender={...basicDefender,ability:{...basicDefender.ability,athletics:1}};
 const battle=createWarBattle({id:'push',name:'Empurrar',seed:'push-livro-v1',
  width:12,height:7,units:[attacker,defender],
  commanders:modelWarCommanders({attacker:12,defender:12}),
  advancedFormations:true,
  tiles:blocked?[{x:4,y:3,terrain:'wall'}]:[],
 });
 return {...battle,turn:'attacker' as const};
}
describe('Capítulo 10 — Empurrar (+3)',()=>{
 it('testa Luta contra Atletismo passivo; move 10m por grau, sem causar dano',()=>{
  const battle=make();
  const before=JSON.stringify(battle);
  const result=issueWarOrder(battle,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'push',targetId:'d'}});
  expect(result.passed).toBe(true);
  const event=result.battle.events.find(e=>e.kind==='push');
  expect(event?.difficulty).toBe(4);
  expect(event?.degrees).toBeGreaterThan(0);
  const target=result.battle.units.find(u=>u.id==='d')!;
  expect(target.position.x).toBe(3+event!.degrees!);
  expect(target.health).toBe(target.maxHealth);
  expect(result.battle.units.find(u=>u.id==='a')!.standing?.kind).toBe('push');
  expect(JSON.stringify(battle)).toBe(before);
 });
 it('não atravessa muralha; terreno bloqueado vence até uma rolagem alta',()=>{
  const result=issueWarOrder(make(true),{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'push',targetId:'d'}});
  expect(result.passed).toBe(true);
  expect(result.battle.units.find(u=>u.id==='d')?.position).toEqual({x:3,y:3});
  expect(result.battle.events.find(e=>e.kind==='push')?.degrees).toBeGreaterThan(0);
 });
 it('mantém ordem contínua, sem empurrar alvos fora da adjacência',()=>{
  const result=issueWarOrder(make(),{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'push',targetId:'d'}});
  const target=result.battle.units.find(u=>u.id==='d')!;
  const next=advanceWarRound(result.battle);
  expect(next.units.find(u=>u.id==='d')?.position).toEqual(target.position);
  expect(next.units.find(u=>u.id==='a')?.standing?.kind).toBe('push');
 });
});
