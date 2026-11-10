import {describe,expect,it} from 'vitest';
import {miniatureDemo} from './demo';
import {inspectVisualCell} from './terrain-inspection';

describe('P1: inspeção 3D puramente visual',()=>{
 const {map,tokens}=miniatureDemo();
 it('mostra terreno e coordenada sem calcular ações legais',()=>{
  expect(inspectVisualCell(map,tokens,{q:2,r:1})).toEqual({
   coordinates:'2,1',terrain:'Floresta',features:[],occupant:null,side:null,
  });
 });
 it('inclui unidade existente sem inventar estatísticas',()=>{
  const result=inspectVisualCell(map,tokens,{q:3,r:3});
  expect(result?.occupant).toBe('Infantaria');
  expect(result?.side).toBe('Atacante');
 });
 it('considera ocupação de múltiplos quadrados',()=>{
  const many=tokens.map((t,i)=>i===0?{...t,footprintCells:[
   {q:3,r:3},{q:4,r:3}]}:t);
  expect(inspectVisualCell(map,many,{q:4,r:3})?.occupant).toBe('Infantaria');
 });
 it('não expõe coordenadas inexistentes',()=>{
  expect(inspectVisualCell(map,tokens,{q:-1,r:0})).toBeNull();
 });
 it('reconhece ponte e estrada recebidas no mapa sem definir passabilidade',()=>{
  const decorated={...map,tiles:map.tiles.map(t=>t.q===2&&t.r===2?
   {...t,terrain:'water' as const,road:true,bridge:true}:t)};
  expect(inspectVisualCell(decorated,tokens,{q:2,r:2})).toMatchObject({
   terrain:'Água',features:['Estrada','Ponte'],
  });
 });
});
