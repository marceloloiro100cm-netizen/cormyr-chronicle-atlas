import {describe,it,expect} from 'vitest';
import {miniatureDemo} from './demo';
import {CORMYR_MINIATURE_TYPES,canUseMiniatures,classifyMiniature,squareWorldPosition,visualTokens,type VisualStack} from './tokens';
import {BATTLE_PROFILES} from '../domain/profiles-v2';
import {BATTLE_PLAYERS_ENABLED} from '../feature-flag';

describe('Miniaturas: contrato visual puro e acesso',()=>{
 const {map}=miniatureDemo();
 const stack:VisualStack={id:'fixture',name:'Fixture',primaryTypeId:'infantry',side:'attacker',
  position:{q:0,r:0},initialCount:100,currentHp:231,hpPerSoldier:10,moraleState:'steady'};
 it.each([['infantry','infantry'],['archers','archer'],['cavalry','cavalry']])('classifica %s sem inferência de regras',(id,kind)=>{
  expect(classifyMiniature(id)).toEqual({kind,fallback:false});
 });
 it('preserva todos os 17 tipos incluindo o fallback naval, sem criar goblin oficial',()=>{
  expect(BATTLE_PROFILES).toHaveLength(17);
  expect(BATTLE_PROFILES.some(p=>String(p.id)==='goblin')).toBe(false);
  const rows=BATTLE_PROFILES.map(p=>({...stack,id:p.id,primaryTypeId:p.id}));
  expect(visualTokens(map,rows)).toHaveLength(17);
  expect(CORMYR_MINIATURE_TYPES).toHaveLength(17);
  expect(new Set(CORMYR_MINIATURE_TYPES).size).toBe(17);
  expect(CORMYR_MINIATURE_TYPES.every(type=>!classifyMiniature(type).fallback)).toBe(true);
  expect(classifyMiniature('warships')).toEqual({kind:'warships',fallback:false});
  expect(classifyMiniature('goblin')).toEqual({kind:'generic',fallback:true});
 });
 it('mantém q/r e centro no mapa 11×9',()=>{
  expect(squareWorldPosition(map,{q:0,r:0})).toEqual([-5,0,-4]);
  expect(squareWorldPosition(map,{q:10,r:8})).toEqual([5,0,4]);
  expect(squareWorldPosition(map,{q:5,r:4})).toEqual([0,0,0]);
 });
 it('mantém dimensões 15×11',()=>{
  const large={...map,width:15 as const,height:11 as const,
   tiles:Array.from({length:165},(_,i)=>({q:i%15,r:Math.floor(i/15),terrain:'plain' as const}))};
  expect(squareWorldPosition(large,{q:14,r:10})).toEqual([7,0,5]);
 });
 it('rejeita hexágonos legados e posições inválidas sem reinterpretar saves',()=>{
  const {grid,...legacy}=map;
  expect(()=>squareWorldPosition(legacy,{q:0,r:0})).toThrow();
  expect(()=>squareWorldPosition(map,{q:11,r:9})).toThrow();
  expect(visualTokens(legacy,[stack])).toEqual([]);
 });
 it('omite mortos/retirados e mantém contagem e entrada intacta',()=>{
  const before=JSON.stringify(stack);
  const result=visualTokens(map,[stack,{...stack,id:'dead',currentHp:0},{...stack,id:'routed',moraleState:'routed'}]);
  expect(result).toHaveLength(1);expect(result[0]?.count).toBe(24);
  expect(JSON.stringify(stack)).toBe(before);
 });
 it.each([[false,false,false],[false,true,false],[true,false,false],[true,true,true]])('Narrador %s e habilitação %s => %s',(n,e,result)=>{
  expect(canUseMiniatures(n,e,map)).toBe(result);
 });
 it('não libera jogadores nem mapas hexagonais',()=>{
  const {grid,...legacy}=map;
  expect(canUseMiniatures(true,true,legacy)).toBe(false);
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
 });
 it('demo tem quatro arquétipos isolados e não compartilha referências entre sessões',()=>{
  const a=miniatureDemo(),b=miniatureDemo();
  expect(a.tokens.map(t=>t.kind)).toEqual(['infantry','archer','cavalry','goblin']);
  expect(a.tokens).not.toBe(b.tokens);expect(a.map.tiles).not.toBe(b.map.tiles);
  expect(a.tokens.every(t=>t.id.startsWith('demo-'))).toBe(true);
 });
});