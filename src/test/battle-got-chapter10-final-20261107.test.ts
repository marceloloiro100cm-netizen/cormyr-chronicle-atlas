import {describe,expect,it} from 'vitest';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {createWarBattle,issueWarOrder,previewWarMovement} from '@/lib/battle/got/engine';
import {terrainCoverBonus,movementSlow,visibilityPenalty,weatherAttackModifier}
 from '@/lib/battle/got/terrain';
import type {WarTerrainTile,WarWeather} from '@/lib/battle/got/terrain';

const unit=(id:string,side:'attacker'|'defender',x:number,y:number,
 typeId:'infantry'|'archers'|'warships'='infantry')=>
 ({...modelWarUnit({id,name:id,side,position:{x,y},typeId}),discipline:0});
const battle=(id:string,tiles:WarTerrainTile[],attacker=unit('a','attacker',1,2))=>
 ({...createWarBattle({id,name:'Auditoria cap. 10',seed:'cap10-book-2026',
  width:12,height:7,commanders:modelWarCommanders({attacker:12,defender:12}),
  units:[attacker,unit('d','defender',9,2)],tiles}),
  turn:'attacker' as const});
const attackDifficulty=(tile:'plain'|'dense-forest',defendRoll:number|null)=>{
 const b=battle('cover-'+tile,
  tile==='plain'?[]:[{x:9,y:2,terrain:tile}],
  unit('a','attacker',7,2,'archers'));
 const withDefense={...b,units:b.units.map(u=>u.id==='d'?{...u,defendRoll}:u)};
 const result=issueWarOrder(withDefense,{
  commanderId:'leader-attacker',unitId:'a',order:{kind:'attack',targetId:'d',ranged:true}});
 const event=result.battle.events.find(e=>e.kind==='attack');
 expect(event).toBeDefined();
 return event!.difficulty!;
};

describe('GOT livro base — paridade de campo, clima e marinha',()=>{
 it('Tabela 10-3: sem ordem Defender, floresta não dá proteção passiva ao arqueiro inimigo',()=>{
  const tile={x:0,y:0,terrain:'dense-forest' as const};
  expect(terrainCoverBonus(tile,true,false)).toBe(0);
  expect(terrainCoverBonus(tile,false,false)).toBe(0);
  expect(terrainCoverBonus(tile,true,true)).toBe(5);
  expect(terrainCoverBonus(tile,false,true)).toBe(5);
  expect(attackDifficulty('dense-forest',null)).toBe(attackDifficulty('plain',null));
  expect(attackDifficulty('dense-forest',4)).toBe(attackDifficulty('plain',4)+5);
 });
 it('Ch. 10: chuva forte não cria -2D de visibilidade; neve forte equivale a escuro',()=>{
  const heavyRain:WarWeather='heavy-rain';
  expect(visibilityPenalty('clear',heavyRain,true)).toBe(0);
  expect(visibilityPenalty('dim',heavyRain,true)).toBe(2);
  expect(weatherAttackModifier(heavyRain)).toBe(-2);
  expect(visibilityPenalty('clear','heavy-snow',true)).toBe(4);
  expect(visibilityPenalty('clear','light-snow',true)).toBe(0);
  expect(weatherAttackModifier('light-snow')).toBe(-2);
  expect(movementSlow({x:0,y:0,terrain:'hill'},'clear','light-snow')).toBe(1);
  expect(movementSlow({x:0,y:0,terrain:'hill'},'clear','heavy-rain')).toBe(1);
 });
 it('Ch. 10 p. 223: barcos atravessam rio e lago grande, nunca correm',()=>{
  const tiles:WarTerrainTile[]=[
   {x:1,y:2,terrain:'coast'},
   {x:2,y:2,terrain:'river'},
   {x:3,y:2,terrain:'large-lake'},
   {x:4,y:2,terrain:'coast'},
  ];
  const navy=battle('naval',tiles,unit('a','attacker',1,2,'warships'));
  const copy=JSON.stringify(navy);
  const passage=previewWarMovement(navy,'a',{x:3,y:2});
  expect(passage.legal).toBe(true);
  expect(passage.path).toEqual([{x:2,y:2},{x:3,y:2}]);
  expect(passage.budgetMetres).toBe(60);
  const sprint=previewWarMovement(navy,'a',{x:3,y:2},true);
  expect(sprint.legal).toBe(false);
  expect(sprint.reason).toMatch(/não podem correr/);
  expect(()=>issueWarOrder(navy,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'move',to:{x:3,y:2},sprint:true}})).toThrow(/não podem correr/);
  expect(navy.ordersRemaining['leader-attacker']).toBe(12);
  const moved=issueWarOrder(navy,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'move',to:{x:3,y:2}}});
  expect(moved.passed).toBe(true);
  expect(moved.battle.units.find(u=>u.id==='a')?.position).toEqual({x:3,y:2});
  expect(JSON.stringify(navy)).toBe(copy);
 });
 it('rio e lago bloqueiam soldados terrestres, ponte permite a passagem',()=>{
  const tiles:WarTerrainTile[]=[
   ...Array.from({length:7},(_,y)=>({x:2,y,terrain:'river' as const})),
  ];
  const noBridge=battle('no-bridge',tiles);
  expect(previewWarMovement(noBridge,'a',{x:3,y:2}).legal).toBe(false);
  const bridge=battle('bridge',tiles.map(t=>t.y===2?{...t,bridge:true}:t));
  expect(previewWarMovement(bridge,'a',{x:2,y:2}).legal).toBe(true);
 });
 it('Tabela 10-3: sequência de quadrados lentos desconta -10 m uma só vez por ordem',()=>{
  const tiles:WarTerrainTile[]=[2,3,4].map(x=>({x,y:2,terrain:'hill'}));
  const b=battle('hills',tiles);
  const preview=previewWarMovement(b,'a',{x:4,y:2});
  expect(preview.legal).toBe(true);
  expect(preview.distanceMetres).toBe(30);
  expect(preview.costMetres).toBe(40);
  expect(preview.budgetMetres).toBe(40);
  expect(preview.path).toHaveLength(3);
  const copy=JSON.stringify(b);
  const actual=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'move',to:{x:4,y:2}}});
  expect(actual.battle.units.find(u=>u.id==='a')?.position).toEqual({x:4,y:2});
  expect(JSON.stringify(b)).toBe(copy);
 });
});
