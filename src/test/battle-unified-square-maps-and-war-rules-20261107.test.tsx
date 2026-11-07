import {describe,expect,it} from 'vitest';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {crzScenario} from '@/lib/crusade/geometry';
import {crzTrainingReady} from '@/lib/crusade/training-demo';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {createWarBattle} from '@/lib/battle/got/engine';
import {auditWarUnitStats} from '@/lib/battle/got/unit-validation';
import {makeModelSiege,warSiegeReloadRemaining,warSiegeTargetInRange} from '@/lib/battle/got/siege';
import {positionedWarLabDeployments} from '@/lib/battle/got/lab-positioning';
import {
 sharedFromBattleMap,sharedFromCrzMap,sharedFromGotTiles,sharedToBattleMap,
 sharedToCrzMap,sharedToGotTiles,serializeSharedSquareMap,parseSharedSquareMap,
} from '@/lib/battle/geometry/shared-square-map';

describe('Três formatos: mapa quadrado independente de regras',()=>{
 it('os cenários novos usam quadrados tanto em Adaptado quanto em CRZ/D&D',()=>{
  expect(createScenario('plain-open').grid).toBe('square');
  expect(crzTrainingReady({
   scenario:'plain-open',width:11,opponent:'human',
   seed:'abcd1234',resolution:'expected',
  }).map.grid).toBe('square');
  expect(createScenario('plain-open',11,'hex').grid).toBeUndefined();
 });
 it('exporta o mapa PTE e o reutiliza no laboratório CRZ/D&D e GOT',()=>{
  const original=createScenario('contested-woods',11,'square');
  const shared=sharedFromBattleMap(original),serialized=serializeSharedSquareMap(shared);
  const restored=parseSharedSquareMap(serialized);
  expect(restored.cells).toHaveLength(99);
  const crz=sharedToCrzMap(restored);
  expect(crz.grid).toBe('square');
  expect(sharedFromCrzMap(crz).cells).toEqual(shared.cells);
  const got=sharedToGotTiles(restored);
  const fromGot=sharedFromGotTiles(11,9,got,restored.name);
  expect(fromGot.cells).toEqual(shared.cells);
  expect(sharedToBattleMap(restored).tiles.map(t=>t.terrain))
   .toEqual(original.tiles.map(t=>t.terrain));
  expect(crzTrainingReady({
   scenario:'plain-open',width:11,opponent:'human',
   seed:'abcd1234',resolution:'expected',sharedMap:restored,
  }).map.tiles.map(t=>t.terrain))
   .toEqual(original.tiles.map(t=>t.terrain));
 });
 it('recusa mapas hexagonais, células repetidas e terrenos especiais GOT sem adaptação',()=>{
  expect(()=>sharedFromBattleMap(createScenario('plain-open',11,'hex')))
   .toThrow(/quadrados/);
  const base=sharedFromCrzMap(crzScenario('plain-open',11,'square'));
  const broken={...base,cells:base.cells.map((c,i)=>i===1?base.cells[0]!:c)};
  expect(()=>serializeSharedSquareMap(broken)).toThrow(/duplicados/);
  expect(()=>sharedFromGotTiles(11,9,[{x:0,y:0,terrain:'river'}],'Campo'))
   .toThrow(/conversão manual/);
  expect(()=>parseSharedSquareMap('garbage')).toThrow(/JSON/);
 });
 it('o posicionamento de 28 tropas respeita o mapa importado de 15×11',()=>{
  const expanded=positionedWarLabDeployments(12,{},15,11);
  expect(expanded).toHaveLength(28);
  expect(expanded.filter(u=>u.side==='defender').every(u=>u.position.x>=12))
   .toBe(true);
  expect(new Set(expanded.map(u=>u.position.x+':'+u.position.y)).size).toBe(28);
 });
});

describe('GOT — atributos, Saúde, Defesa, dados e cercos auditáveis',()=>{
 it('Vigor × 3 define Saúde máxima e rejeita dados militares inválidos',()=>{
  const u=modelWarUnit({id:'u',name:'Infantaria',side:'attacker',typeId:'infantry',
   position:{x:2,y:2}});
  const audit=auditWarUnitStats(u);
  expect(audit.expectedMaxHealth).toBe(u.ability.endurance*3);
  expect(audit.currentHealth).toBe(u.health);
  expect(audit.fightingDice).toBe(u.ability.fighting);
  expect(audit.defense).toBe(u.defense);
  expect(()=>auditWarUnitStats({...u,armor:Number.NaN})).toThrow(/inconsistentes/);
  expect(()=>auditWarUnitStats({...u,maxHealth:10})).toThrow(/inconsistentes/);
  const d=modelWarUnit({id:'d',name:'Defensor',side:'defender',typeId:'infantry',
   position:{x:8,y:2}});
  expect(()=>createWarBattle({id:'bad',name:'Inconsistente',seed:'audit',
   width:11,height:9,commanders:modelWarCommanders({attacker:3,defender:3}),
   units:[{...u,defense:Infinity},d]})).toThrow(/inconsistentes/);
 });
 it('cerco respeita quatro máquinas por engenheiro e recarga entre rodadas',()=>{
  const engineer=modelWarUnit({id:'e',name:'Engenheiros',side:'attacker',
   typeId:'engineers',position:{x:2,y:2}});
  const enemy=modelWarUnit({id:'d',name:'Guarda',side:'defender',
   typeId:'garrison',position:{x:7,y:2}});
  const weapons=Array.from({length:4},(_,i)=>makeModelSiege({
   id:'cat-'+i,side:'attacker',kind:'catapult-small',
   position:{x:1,y:3+i},engineerId:'e',
  }));
  const b=createWarBattle({id:'siege-audit',name:'Cerco',seed:'siege',
   width:11,height:9,units:[engineer,enemy],siege:weapons,
   commanders:modelWarCommanders({attacker:5,defender:5})});
  expect(b.siege).toHaveLength(4);
  expect(warSiegeReloadRemaining({...weapons[0]!,lastFiredRound:1},2)).toBe(1);
  expect(warSiegeReloadRemaining({...weapons[0]!,lastFiredRound:1},3)).toBe(0);
  expect(warSiegeTargetInRange(weapons[0]!,enemy.position)).toBe(true);
  expect(()=>createWarBattle({id:'too-many',name:'Cinco máquinas',seed:'siege',
   width:11,height:9,units:[engineer,enemy],siege:[
    ...weapons,makeModelSiege({id:'cat-5',side:'attacker',kind:'catapult-small',
     position:{x:1,y:7},engineerId:'e'}),
   ],commanders:modelWarCommanders({attacker:5,defender:5})}))
   .toThrow(/até quatro/);
 });
});
