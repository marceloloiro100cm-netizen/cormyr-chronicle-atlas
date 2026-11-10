import {describe,expect,it} from 'vitest';
import {footprintPerimeter} from './footprint';

describe('P1: contorno da área ocupada por miniaturas grandes',()=>{
 it('um quadrado tem quatro bordas',()=>{
  expect(footprintPerimeter([{q:0,r:0}])).toHaveLength(4);
 });
 it('um bloco 2×2 tem 8 segmentos, sem bordas internas',()=>{
  const edges=footprintPerimeter([{q:2,r:2},{q:3,r:2},{q:2,r:3},{q:3,r:3}]);
  expect(edges).toHaveLength(8);
  expect(edges).not.toContainEqual({q:2,r:2,side:'east'});
  expect(edges).not.toContainEqual({q:3,r:2,side:'west'});
 });
 it('uma criatura Enorme 3×3 tem somente 12 segmentos externos',()=>{
  const cells=Array.from({length:9},(_,i)=>({q:i%3,r:Math.floor(i/3)}));
  expect(footprintPerimeter(cells)).toHaveLength(12);
 });
});
