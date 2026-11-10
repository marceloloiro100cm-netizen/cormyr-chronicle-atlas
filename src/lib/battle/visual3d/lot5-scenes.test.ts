import {describe,expect,it} from 'vitest';
import type {WarBattle} from '../got/types';
import {CREATURE_VISUAL_FAMILIES,classifyCreatureArtwork} from './creature-visuals';
import {creatureGalleryScene,coastalNavalScene,ruinedBridgeScene,scenicDemo} from './scenic-demos';
import {creatureMiniatureKind,gotVisualMap,gotVisualTerrain} from './adapters';
import {CORMYR_MINIATURE_TYPES} from './tokens';

describe('Lote 5 — catálogo visual de criaturas D&D',()=>{
 it('disponibiliza 25 arquétipos sem duplicar os 17 tipos militares',()=>{
  expect(CREATURE_VISUAL_FAMILIES).toHaveLength(25);
  expect(new Set(CREATURE_VISUAL_FAMILIES).size).toBe(25);
  expect(CORMYR_MINIATURE_TYPES).toHaveLength(17);
  expect(CREATURE_VISUAL_FAMILIES.includes('warships' as never)).toBe(false);
 });
 it.each([
  ['Goblin arqueiro','humanoid','goblin'],
  ['Kobold sentinela','humanoid','kobold'],
  ['Orc guerreiro','humanoid','orc'],
  ['Skeleton archer','undead','skeleton'],
  ['Zumbi de Faerûn','undead','zombie'],
  ['Fantasma','undead','spirit'],
  ['Aranha gigante','monstrosity','spider'],
  ['Serpente venenosa','beast','serpent'],
  ['Enxame de insetos','beast','insect'],
  ['Troll das cavernas','giant','troll'],
  ['Dragão ancião','dragon','dragon'],
  ['Golem','construct','construct'],
  ['Elemental de fogo','elemental','elemental'],
  ['Demônio','fiend','fiend'],
  ['Anjo','celestial','celestial'],
  ['Aberração','aberration','aberration'],
  ['Gosma','ooze','ooze'],
  ['Arbusto vivo','plant','plant'],
  ['Criatura feérica','fey','fey'],
  ['Lobo','beast','beast'],
  ['Gigante de pedra','giant','giant'],
  ['Ladino humano','humanoid','humanoid'],
  ['Golfinho','beast','beast'],
 ] as const)('classifica %s (%s) como %s sem gerar atributos',
  (name,creatureType,expected)=>{
   const template={id:'creature|demo',name,creatureType,tags:[]};
   const before=JSON.stringify(template);
   expect(creatureMiniatureKind(template)).toEqual({kind:expected,fallback:false});
   expect(JSON.stringify(template)).toBe(before);
  });
 it('usa tags de identidade sem confundir um monstro desconhecido com uma criatura definida',()=>{
  expect(classifyCreatureArtwork({id:'x',name:'Viajante',creatureType:'unknown',tags:['Kobold']}))
   .toEqual({kind:'kobold',fallback:false});
  expect(classifyCreatureArtwork({id:'x',name:'Ser indefinido',creatureType:'unknown',tags:[]}))
   .toEqual({kind:'generic',fallback:true});
 });
});
describe('Lote 5 — cenários avançados e naval somente visual',()=>{
 const scenes=[creatureGalleryScene(),coastalNavalScene(),ruinedBridgeScene()];
 it('oferece três cenas 15×11, sem hexágonos, entidades duplicadas ou posições inválidas',()=>{
  for(const scene of scenes){
   expect(scene.map.grid).toBe('square');
   expect(scene.map.width).toBe(15);
   expect(scene.map.height).toBe(11);
   expect(scene.map.tiles).toHaveLength(165);
   const keys=scene.map.tiles.map(t=>t.q+','+t.r);
   expect(new Set(keys).size).toBe(165);
   expect(new Set(scene.tokens.map(t=>t.id)).size).toBe(scene.tokens.length);
   for(const token of scene.tokens){
    expect(keys).toContain(token.position.q+','+token.position.r);
    for(const cell of token.footprintCells??[])expect(keys).toContain(cell.q+','+cell.r);
   }
  }
  expect(scenicDemo('creatures').tokens).toHaveLength(25);
  expect(scenicDemo('coast').tokens).toHaveLength(5);
  expect(scenicDemo('fortress').tokens).toHaveLength(4);
 });
 it('navios da galeria aparecem apenas sobre água e não criam movimentos navais',()=>{
  const scene=coastalNavalScene();
  const byPosition=new Map(scene.map.tiles.map(t=>[t.q+','+t.r,t.terrain]));
  const ships=scene.tokens.filter(t=>t.naval);
  expect(ships).toHaveLength(3);
  for(const ship of ships){
   expect(ship.kind).toBe('warships');
   expect(byPosition.get(ship.position.q+','+ship.position.r)).toBe('water');
  }
  expect(scene.notice.toLowerCase()).toContain('sem movimento');
 });
 it('ponte, ruínas, costa, pântano e monstro de pegada 4×4 permanecem dados visuais',()=>{
  const scene=ruinedBridgeScene();
  expect(Array.from(new Set(scene.map.tiles.map(t=>t.terrain)))).toEqual(
   expect.arrayContaining(['bridge','water','road','ruins','forest','marsh','mountain','settlement']));
  const dragon=scene.tokens.find(t=>t.kind==='dragon')!;
  expect(dragon.footprintCells).toHaveLength(16);
  expect(dragon.flying).toBe(true);
  const before=JSON.stringify(scene);
  expect(scenicDemo('fortress').tokens.find(t=>t.id===dragon.id)?.footprintCells).toHaveLength(16);
  expect(JSON.stringify(scene)).toBe(before);
 });
 it('preserva pontes/estradas de GOT sem trocar os efeitos do motor',()=>{
  expect(gotVisualTerrain('marsh')).toBe('marsh');
  expect(gotVisualTerrain('desert')).toBe('desert');
  expect(gotVisualTerrain('coast')).toBe('coast');
  const original={width:3,height:2,tiles:[
   {x:1,y:0,terrain:'river',bridge:true},
   {x:0,y:1,terrain:'mountain',road:true},
   {x:2,y:1,terrain:'ruins'},
  ]} as Pick<WarBattle,'width'|'height'|'tiles'>;
  const snapshot=JSON.stringify(original);
  const projected=gotVisualMap(original);
  expect(projected.tiles.find(t=>t.q===1&&t.r===0)).toMatchObject({terrain:'bridge',bridge:true});
  expect(projected.tiles.find(t=>t.q===0&&t.r===1)).toMatchObject({terrain:'road',road:true});
  expect(projected.tiles.find(t=>t.q===2&&t.r===1)?.terrain).toBe('ruins');
  expect(JSON.stringify(original)).toBe(snapshot);
 });
});
