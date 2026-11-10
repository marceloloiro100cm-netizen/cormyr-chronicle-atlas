import {describe,it,expect} from 'vitest';
import type {WarBattle} from '../got/types';
import {dndMilitaryTemplateId} from '@/lib/crusade/dnd-military';
import {MONSTER_MINIATURE_KINDS,DRAGON_TINT_COLORS,dragonTintFromName} from './monster-kinds';
import {creatureMiniatureKind,gotVisualMap,gotVisualFeature,gotVisualTokens} from './adapters';
import {monsterGalleryPage,navalVisualPreview,specialTerrainPreview} from './advanced-demos';

const creature=(name:string,creatureType:string,tags:readonly string[]=[])=>({
 id:'private-monster-do-not-publish',name,creatureType,tags,
});
describe('Miniaturas Lote 5 — catálogo modular e cenários visuais',()=>{
 it('possui 30 arquétipos visuais autorais, sem duplicatas e sem dados privados',()=>{
  expect(MONSTER_MINIATURE_KINDS).toHaveLength(30);
  expect(new Set(MONSTER_MINIATURE_KINDS).size).toBe(30);
  expect(Object.keys(DRAGON_TINT_COLORS)).toHaveLength(10);
  const first=monsterGalleryPage(1),second=monsterGalleryPage(2);
  expect(first.tokens).toHaveLength(15);
  expect(second.tokens).toHaveLength(15);
  expect(new Set([...first.tokens,...second.tokens].map(t=>t.kind)).size).toBe(30);
  expect(first.tokens.every(t=>t.id.startsWith('demo-creature-'))).toBe(true);
  expect([...first.tokens,...second.tokens].every(t=>t.count===1)).toBe(true);
  expect(JSON.stringify([...first.tokens,...second.tokens])).not.toContain('private-monster');
 });
 it.each([
  ['Hobgoblin captain','humanoid','hobgoblin'],
  ['Bugbear warrior','humanoid','bugbear'],
  ['Goblin scout','humanoid','goblin'],
  ['Orc guerreiro','humanoid','orc'],
  ['Kobold scout','humanoid','kobold'],
  ['Ogro guerreiro','giant','ogre'],
  ['Troll','giant','troll'],
  ['Dragão azul ancião','dragon','dragon-elder'],
  ['Young Red Dragon','dragon','dragon-young'],
  ['Dracolich','undead','dracolich'],
  ['Esqueleto arqueiro','undead','skeleton'],
  ['Zumbi','undead','zombie'],
  ['Lich','undead','lich'],
  ['Vampiro','undead','vampire'],
  ['Espectro','undead','wraith'],
  ['Golem de ferro','construct','iron-golem'],
  ['Stone Golem','construct','stone-golem'],
  ['Armadura animada','construct','animated-armor'],
  ['Lobo','beast','wolf'],
  ['Urso','beast','bear'],
  ['Aranha gigante','monstrosity','spider'],
  ['Elemental de fogo','elemental','elemental'],
  ['Demônio','fiend','fiend'],
  ['Anjo','celestial','celestial'],
  ['Guerreiro humano','humanoid','humanoid'],
  ['Constructo não catalogado','construct','construct'],
  ['Dragão','dragon','dragon'],
  ['Morto-vivo sem detalhes','undead','undead'],
  ['Fera sem detalhes','beast','beast'],
  ['Gigante das colinas','giant','giant'],
 ] as const)('classifica %s como %s (%s)',(name,type,expected)=>{
  expect(creatureMiniatureKind(creature(name,type)).kind).toBe(expected);
 });
 it('preserva mapeamento militar como prioridade e não adivinha monstros desconhecidos',()=>{
  const military=creatureMiniatureKind({
   ...creature('Dragão montado','dragon'),id:dndMilitaryTemplateId('cavalry'),
  });
  expect(military).toEqual({kind:'cavalry',fallback:false});
  expect(creatureMiniatureKind(creature('Criatura sem classificação','aberration')))
   .toEqual({kind:'generic',fallback:true});
 });
 it('cores cromáticas são cosméticas, sem mudar o tipo de criatura',()=>{
  expect(dragonTintFromName('Dragão VERMELHO')).toBe('red');
  expect(dragonTintFromName('Ancient Silver Dragon')).toBe('silver');
  expect(dragonTintFromName('dragão sem cor')).toBeUndefined();
  const profile=creatureMiniatureKind(creature('Dragão azul ancião','dragon'));
  expect(profile).toEqual({kind:'dragon-elder',fallback:false,cosmeticTint:'blue'});
 });
 it('mapa naval não cria regras navais, só costa, ilhas e navios',()=>{
  const preview=navalVisualPreview();
  expect(preview.map.grid).toBe('square');
  expect(preview.map.tiles).toHaveLength(165);
  expect(preview.tokens.filter(t=>t.naval)).toHaveLength(4);
  expect(preview.tokens.filter(t=>t.navalStyle==='galley')).toHaveLength(2);
  expect(preview.tokens.filter(t=>t.navalStyle==='galleon')).toHaveLength(2);
  expect(preview.tokens.every(t=>preview.map.tiles.some(c=>
   c.q===t.position.q&&c.r===t.position.r))).toBe(true);
  expect(preview.map.tiles.find(t=>t.q===7&&t.r===5)?.feature).toBe('island');
  expect(preview.map.tiles.find(t=>t.q===4&&t.r===2)?.terrain).toBe('water');
  expect(preview.map.tiles.find(t=>t.q===1&&t.r===5)?.feature).toBe('coast');
 });
 it('terreno complexo cria features visuais, sem bloquear ou modificar movement',()=>{
  const fixture=specialTerrainPreview();
  expect(fixture.map.tiles.find(t=>t.q===7&&t.r===5)?.feature).toBe('bridge');
  expect(fixture.map.tiles.find(t=>t.q===12&&t.r===4)?.feature).toBe('wall');
  expect(fixture.tokens.find(t=>t.kind==='dragon-elder')?.footprintCells).toHaveLength(16);
  const war={width:12,height:7,tiles:[
   {x:4,y:2,terrain:'river',bridge:true},
   {x:1,y:1,terrain:'plain',road:true},
   {x:7,y:2,terrain:'wall'},
  ]} as Pick<WarBattle,'width'|'height'|'tiles'>;
  const frozen=JSON.stringify(war);
  const derived=gotVisualMap(war);
  expect(derived.tiles.find(t=>t.q===4&&t.r===2)?.feature).toBe('bridge');
  expect(derived.tiles.find(t=>t.q===1&&t.r===1)?.feature).toBe('road');
  expect(derived.tiles.find(t=>t.q===7&&t.r===2)?.feature).toBe('wall');
  expect(JSON.stringify(war)).toBe(frozen);
  expect(gotVisualFeature({x:4,y:2,terrain:'marsh'})).toBe('marsh');
 });
 it('separa navio naval de soldado terrestre sem tocar nos dados GOT',()=>{
  const units=[
   {id:'ship',name:'Navio fictício',side:'attacker',naval:true,
    typeId:'warships',health:8,condition:'organized',position:{x:3,y:2}},
   {id:'soldier',name:'Soldado fictício',side:'defender',naval:false,
    typeId:'infantry',health:10,condition:'organized',position:{x:1,y:2}},
  ] as unknown as WarBattle['units'];
  const before=JSON.stringify(units);
  const tokens=gotVisualTokens({units});
  expect(tokens[0]?.kind).toBe('warships');
  expect(tokens[0]?.naval).toBe(true);
  expect(tokens[0]?.navalStyle).toBe('galleon');
  expect(tokens[1]?.naval).toBe(false);
  expect(JSON.stringify(units)).toBe(before);
 });
});
