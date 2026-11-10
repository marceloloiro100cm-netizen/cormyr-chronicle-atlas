import {describe,it,expect} from 'vitest';
import type {WarBattle,WarUnit} from '../got/types';
import type {CrzBattleState,CrzBattleStack} from '@/lib/crusade/battle-state';
import {crzFootprintCells} from '@/lib/crusade/geometry';
import {dndMilitaryTemplateId} from '@/lib/crusade/dnd-military';
import {gotVisualMap,gotVisualTerrain,gotVisualTokens,crzVisualMap,crzVisualTokens,creatureMiniatureKind} from './adapters';
import {miniatureCatalog} from './demo';
import {CORMYR_MINIATURE_TYPES} from './tokens';

describe('Miniaturas 3D — lotes 2/3/4: projeções sem mutação dos motores',()=>{
 it('a galeria entrega as 17 categorias oficiais, sem alterar o bestiário',()=>{
  const a=miniatureCatalog(),b=miniatureCatalog();
  expect(a.tokens).toHaveLength(17);
  expect(new Set(a.tokens.map(t=>t.kind)).size).toBe(17);
  expect(a.tokens.some(t=>t.kind==='warships'&&t.naval)).toBe(true);
  expect(a.tokens.every(t=>t.id.startsWith('demo-'))).toBe(true);
  expect(a.tokens).not.toBe(b.tokens);
  expect(CORMYR_MINIATURE_TYPES).toHaveLength(17);
 });
 it('mapeia os terrenos próprios de GOT sem afetar o terreno original',()=>{
  expect(gotVisualTerrain('river')).toBe('water');
  expect(gotVisualTerrain('dense-forest')).toBe('forest');
  expect(gotVisualTerrain('large-city')).toBe('settlement');
  expect(gotVisualTerrain('wall')).toBe('rock');
  const battle={width:12,height:7,tiles:[{x:4,y:2,terrain:'river'}]} as Pick<WarBattle,'width'|'height'|'tiles'>;
  const before=JSON.stringify(battle);
  const map=gotVisualMap(battle);
  expect(map.grid).toBe('square');
  expect(map.tiles).toHaveLength(84);
  expect(map.tiles.find(t=>t.q===4&&t.r===2)?.terrain).toBe('water');
  expect(JSON.stringify(battle)).toBe(before);
 });
 it('ignora unidades GOT destruídas, exibe navio e preserva Saúde',()=>{
  const unit={id:'cav',name:'Cavalaria',side:'attacker',typeId:'cavalry',
   position:{x:2,y:3},health:6,condition:'organized',naval:false} as WarUnit;
  const ship={...unit,id:'boat',name:'Galeão',side:'defender',naval:true} as WarUnit;
  const dead={...unit,id:'dead',condition:'destroyed'} as WarUnit;
  const original=JSON.stringify([unit,ship,dead]);
  const tokens=gotVisualTokens({units:[unit,ship,dead]});
  expect(tokens).toHaveLength(2);
  expect(tokens[1]?.kind).toBe('warships');
  expect(tokens[0]?.metricLabel).toBe('Saúde');
  expect(tokens[0]?.position).toEqual({q:2,r:3});
  expect(JSON.stringify([unit,ship,dead])).toBe(original);
 });
 it('classifica famílias de monstros sem declarar goblins como unidade oficial',()=>{
  const creature=(name:string,creatureType:string)=>({id:'a',name,creatureType,tags:[] as string[]});
  expect(creatureMiniatureKind(creature('Goblin arqueiro','humanoid')).kind).toBe('goblin');
  expect(creatureMiniatureKind(creature('Dragão vermelho','dragon')).kind).toBe('dragon');
  expect(creatureMiniatureKind(creature('Esqueleto','undead')).kind).toBe('undead');
  expect(creatureMiniatureKind(creature('Golem','construct')).kind).toBe('construct');
  expect(creatureMiniatureKind(creature('Desconhecido','aberration')).fallback).toBe(true);
  expect(creatureMiniatureKind({...creature('Infantaria','humanoid'),id:dndMilitaryTemplateId('infantry')}).kind)
   .toBe('infantry');
 });
 it('mantém quadrados ocupados de criatura Enorme e voo em D&D',()=>{
  const map={grid:'square',width:11,height:9,tiles:Array.from({length:99},(_,i)=>({
   q:i%11,r:Math.floor(i/11),terrain:'plain'}))} as unknown as CrzBattleState['map'];
  const stack={id:'draco',name:'Dragão',side:'attacker',position:{q:3,r:3},
   size:'H',alive:1,moraleState:'steady',
   template:{id:'draco|original',name:'Dragão',creatureType:'dragon',tags:[],
    flags:{flying:true}}} as unknown as CrzBattleStack;
  const state={map,simulationProfile:'dnd-v3',stacks:[stack]} as unknown as CrzBattleState;
  const input=JSON.stringify(state);
  const tokens=crzVisualTokens(state);
  expect(tokens).toHaveLength(1);
  expect(tokens[0]?.footprintCells).toHaveLength(9);
  expect(tokens[0]?.flying).toBe(true);
  expect(tokens[0]?.kind).toBe('dragon');
  expect(tokens[0]?.footprintCells).toEqual(crzFootprintCells(map,stack.position,stack.size));
  expect(crzVisualMap(state).tiles).toHaveLength(99);
  expect(JSON.stringify(state)).toBe(input);
 });
});
