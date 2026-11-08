import {describe,expect,it} from 'vitest';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {makeModelSiege} from '@/lib/battle/got/siege';
import {makeWarFortification} from '@/lib/battle/got/fortifications';
import {previewWarSiegeReadiness} from '@/lib/battle/got/siege-readiness';
import {createWarBattle,issueWarOrder,previewWarMovement,fireWarSiegeVolley} from '@/lib/battle/got/engine';
import {terrainCoverBonus,movementSlow,visibilityPenalty,weatherAttackModifier}
 from '@/lib/battle/got/terrain';
import type {WarTerrainTile,WarWeather} from '@/lib/battle/got/terrain';

const unit=(id:string,side:'attacker'|'defender',x:number,y:number,
 typeId:'infantry'|'archers'|'warships'|'engineers'='infantry')=>
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
 it('retirada de navio respeita rios e lagos sem abandonar vias navegáveis',()=>{
  const tiles:WarTerrainTile[]=[
   {x:1,y:2,terrain:'coast'},
   {x:2,y:2,terrain:'large-lake'},
   {x:3,y:2,terrain:'river'},
   {x:4,y:2,terrain:'coast'},
  ];
  const ship=unit('a','attacker',4,2,'warships');
  const enemy=unit('d','defender',5,2);
  const b={...createWarBattle({id:'navy-retreat',name:'Retirada naval',
   seed:'naval-retreat-2026',width:12,height:7,
   commanders:modelWarCommanders({attacker:12,defender:12}),
   units:[ship,enemy],tiles}),turn:'attacker' as const};
  const moved=issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'retreat'}});
  expect(moved.passed).toBe(true);
  expect(moved.battle.units.find(u=>u.id==='a')?.position.x).toBeLessThan(4);
  expect(moved.battle.events.some(e=>e.kind==='retreat')).toBe(true);
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

describe('GOT livro base — limites de heróis e artilharia',()=>{
 it('Cap. 10: quantidade de heróis não ultrapassa o Status do comandante',()=>{
  const army=[unit('a','attacker',1,2),unit('d','defender',9,2)];
  const heroes=Array.from({length:4},(_,i)=>makeModelWarHero({
   id:'hero-'+i,name:'Herói '+i,side:'attacker',position:{x:1,y:i+1},
  }));
  expect(()=>createWarBattle({id:'many-heroes',name:'Status',
   seed:'many-heroes',width:12,height:7,
   units:army,heroes,commanders:modelWarCommanders({attacker:6,defender:6})}))
   .toThrow(/heróis excede o Status/);
  expect(()=>createWarBattle({id:'three-heroes',name:'Status',
   seed:'three-heroes',width:12,height:7,
   units:army,heroes:heroes.slice(0,3),
   commanders:modelWarCommanders({attacker:6,defender:6})})).not.toThrow();
 });
 it('Tabela 10-3: montanha impede artilharia atacante, inclusive na prévia',()=>{
  const oper=unit('engineer','attacker',1,2,'engineers');
  const defender=unit('d','defender',9,2);
  const siege=makeModelSiege({id:'cat',kind:'catapult-small',
   side:'attacker',position:{x:1,y:3},engineerId:oper.id});
  const start=(mountain:boolean)=>{
   const b=createWarBattle({id:'mount-siege',name:'Montanha',seed:'siege-mountain',
    width:12,height:7,units:[oper,defender],siege:[siege],
    commanders:modelWarCommanders({attacker:12,defender:12}),
    tiles:mountain?[{x:1,y:3,terrain:'mountain'}]:[]});
   return {...b,turn:'attacker' as const};
  };
  const illegal=start(true),original=JSON.stringify(illegal);
  const report=previewWarSiegeReadiness(illegal,'attacker',{x:9,y:2})[0]!;
  expect(report.available).toBe(false);
  expect(report.blockers.join(' ')).toMatch(/Terreno proíbe armas de cerco/);
  expect(()=>fireWarSiegeVolley(illegal,{commanderId:'leader-attacker',
   weaponIds:['cat'],targetId:'d'})).toThrow(/Terreno proíbe armas de cerco/);
  expect(JSON.stringify(illegal)).toBe(original);
  expect(previewWarSiegeReadiness(start(false),'attacker',{x:9,y:2})[0]!.available)
   .toBe(true);
 });
 it('defensor com fortificação ativa pode utilizar cerco no terreno montanhoso',()=>{
  const engineer=unit('engineer','defender',8,2,'engineers');
  const attacker=unit('a','attacker',1,2);
  const fort=makeWarFortification({id:'tower',name:'Torre',kind:'tower',
   side:'defender',cells:[{x:8,y:2}],engineerBuilt:false,hoursBuilt:72});
  const siege=makeModelSiege({id:'def-scorpion',kind:'scorpion',
   side:'defender',position:{x:8,y:3},engineerId:'engineer'});
  const start=(withFort:boolean)=>createWarBattle({
   id:'def-siege',name:'Cerco Defensor',seed:'def-siege',
   width:12,height:7,units:[attacker,engineer],siege:[siege],
   fortifications:withFort?[fort]:[],
   commanders:modelWarCommanders({attacker:12,defender:12}),
   tiles:[{x:8,y:3,terrain:'mountain'}]});
  expect(previewWarSiegeReadiness(start(false),'defender',{x:1,y:2})[0]?.available)
   .toBe(false);
  expect(previewWarSiegeReadiness(start(true),'defender',{x:1,y:2})[0]?.available)
   .toBe(true);
 });
});
