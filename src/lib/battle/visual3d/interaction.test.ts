import {describe,it,expect} from 'vitest';
import {miniatureDemo} from './demo';
import {
 cameraBaseFit,pendingStillLegal,proposeVisualAction,tokenAtCell,
 tokenFocusPoint,visualCellTarget,visualKey,
} from './interaction';
import type {VisualToken} from './tokens';

const {map,tokens}=miniatureDemo();
const fixture:VisualToken[]=[...tokens,{
 id:'huge',side:'defender',name:'Dragão grande',kind:'dragon',
 position:{q:5,r:4},footprintCells:[{q:5,r:4},{q:6,r:4},{q:5,r:5},{q:6,r:5}],
 count:1,fallback:false,
}];
describe('P0 · Segurança contextual de ações no mapa 3D',()=>{
 it('não executa comandos quando o jogador não possui uma ação legal',()=>{
  expect(proposeVisualAction({hex:{q:4,r:2},tokens:fixture,moveKeys:['4,2'],
   attackKeys:[],actorId:'a',actionEnabled:false})).toBeNull();
  expect(proposeVisualAction({hex:{q:3,r:3},tokens:fixture,moveKeys:[],
   attackKeys:[],actorId:'a',actionEnabled:true})).toBeNull();
 });
 it('monta uma proposta de movimento apenas em casa verde sem ocupante',()=>{
  const action=proposeVisualAction({hex:{q:4,r:2},tokens:fixture,moveKeys:['4,2'],
   attackKeys:[],actorId:'a',actionEnabled:true});
  expect(action).toEqual({type:'move',target:{q:4,r:2},key:'4,2',
   label:'Quadrado 4,2',actorId:'a'});
  expect(visualKey({q:4,r:2})).toBe('4,2');
 });
 it('destinos ocupados não são tratados como movimento mesmo sob destaque',()=>{
  const occupied=fixture[0]!.position;
  expect(proposeVisualAction({hex:occupied,tokens:fixture,
   moveKeys:[visualKey(occupied)],attackKeys:[],actorId:'a',actionEnabled:true})).toBeNull();
 });
 it('detecta alvos em qualquer quadrado de um monstro Grande',()=>{
  const hit={q:6,r:5};
  expect(tokenAtCell(fixture,hit)?.id).toBe('huge');
  expect(proposeVisualAction({hex:hit,tokens:fixture,moveKeys:[],
   attackKeys:['huge'],actorId:'a',actionEnabled:true})).toEqual({
    type:'attack',target:hit,key:'6,5',label:'Dragão grande',actorId:'a',
   });
 });
 it('invalida confirmação ao mudar turno, alvos ou a legalidade',()=>{
  const pending=proposeVisualAction({hex:{q:6,r:5},tokens:fixture,
   moveKeys:[],attackKeys:['huge'],actorId:'a',actionEnabled:true})!;
  expect(pendingStillLegal(pending,{
   tokens:fixture,moveKeys:[],attackKeys:['huge'],actorId:'a',actionEnabled:true,
  })).toBe(true);
  expect(pendingStillLegal(pending,{
   tokens:fixture,moveKeys:[],attackKeys:[],actorId:'a',actionEnabled:true,
  })).toBe(false);
  expect(pendingStillLegal(pending,{
   tokens:fixture,moveKeys:[],attackKeys:['huge'],actorId:'b',actionEnabled:true,
  })).toBe(false);
  expect(pendingStillLegal(pending,{
   tokens:fixture,moveKeys:[],attackKeys:['huge'],actorId:'a',actionEnabled:false,
  })).toBe(false);
 });
 it('não muta fichas, tokens nem o mapa ao construir propostas',()=>{
  const before=JSON.stringify({fixture,map});
  proposeVisualAction({hex:{q:6,r:5},tokens:fixture,moveKeys:[],
   attackKeys:['huge'],actorId:'a',actionEnabled:true});
  tokenFocusPoint(map,fixture[0]!);
  expect(JSON.stringify({fixture,map})).toBe(before);
 });
});
describe('P0 · coordenadas da câmera sem modificar regras métricas',()=>{
 it('foca o centro de uma criatura de múltiplos quadrados',()=>{
  expect(tokenFocusPoint(map,fixture.find(t=>t.id==='huge')!)).toEqual({x:.5,z:.5});
  expect(visualCellTarget(map,{q:5,r:4})).toEqual({x:0,z:0});
 });
 it('ajusta o enquadramento considerando ambos os eixos do visor',()=>{
  const a=cameraBaseFit(11,9,1100,720,false);
  const b=cameraBaseFit(11,9,1100,720,true);
  expect(Number.isFinite(a)).toBe(true);
  expect(a).toBeGreaterThanOrEqual(5);expect(b).toBeGreaterThanOrEqual(5);
  expect(cameraBaseFit(15,11,390,400,false)).toBeLessThan(a);
 });
});
