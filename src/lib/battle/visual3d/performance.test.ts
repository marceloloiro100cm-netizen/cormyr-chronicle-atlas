import {describe,expect,it} from 'vitest';
import {buildMiniaturePerfSample} from './performance';
describe('P2: resultados de medição, sem inventar FPS',()=>{
 it('calcula FPS real só com frames observados',()=>{
  expect(buildMiniaturePerfSample({elapsedMs:5000,frames:150,tokenCount:40,
   totalDrawCalls:3000,totalTriangles:90000})).toEqual({
   fps:30,elapsedMs:5000,frames:150,tokenCount:40,
   averageDrawCalls:20,averageTriangles:600,
  });
 });
 it('recusa medição sem duração ou amostras suficientes',()=>{
  expect(buildMiniaturePerfSample({elapsedMs:0,frames:150,tokenCount:80,
   totalDrawCalls:0,totalTriangles:0})).toBeNull();
  expect(buildMiniaturePerfSample({elapsedMs:1000,frames:1,tokenCount:80,
   totalDrawCalls:0,totalTriangles:0})).toBeNull();
 });
});
