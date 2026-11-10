import {describe,expect,it} from 'vitest';
import {warShieldWallAllyCover} from '@/lib/battle/got/shield-cover';
import {modelWarUnit} from '@/lib/battle/got/models';
import {nextWarLabDeploymentSide,positionWarLabUnit} from '@/lib/battle/got/lab-positioning';

const unit=(id:string,side:'attacker'|'defender',x:number,y:number)=>
 modelWarUnit({id,name:id,side,typeId:'infantry',training:'trained',position:{x,y}});

describe('P2 — proteção espacial opcional GoT',()=>{
 const attacker=unit('enemy','attacker',1,3);
 const wall={...unit('wall','defender',3,3),formation:'shield-wall' as const,
  facing:'west' as const};
 const behind=unit('behind','defender',4,3);
 const battle={advancedFormations:true,units:[attacker,wall,behind]};
 it('protege aliado adjacente atrás contra Pontaria, sem acumular',()=>{
  expect(warShieldWallAllyCover(battle,attacker,behind,true)).toBe(5);
  expect(warShieldWallAllyCover({...battle,units:[...battle.units,{...wall,id:'wall2',position:{x:3,y:4}}]},attacker,behind,true)).toBe(5);
 });
 it('não altera Luta, flanco, retaguarda, derrotados ou modo básico',()=>{
  expect(warShieldWallAllyCover(battle,attacker,behind,false)).toBe(0);
  expect(warShieldWallAllyCover({...battle,advancedFormations:false},attacker,behind,true)).toBe(0);
  expect(warShieldWallAllyCover({...battle,units:[attacker,{...wall,condition:'destroyed'},behind]},attacker,behind,true)).toBe(0);
  expect(warShieldWallAllyCover(battle,{...attacker,position:{x:3,y:1}},behind,true)).toBe(0);
  expect(warShieldWallAllyCover(battle,attacker,{...behind,position:{x:2,y:3}},true)).toBe(0);
 });
});

describe('P2 — implantação alternada é apenas preparação',()=>{
 it('alternância atacante, defensor e mantém posições não alteradas',()=>{
  expect(nextWarLabDeploymentSide(0,{})).toBe('attacker');
  const a=positionWarLabUnit(0,{},'attacker-1',{x:2,y:2});
  expect(nextWarLabDeploymentSide(0,a)).toBe('defender');
  const d=positionWarLabUnit(0,a,'defender-1',{x:9,y:2});
  expect(nextWarLabDeploymentSide(0,d)).toBe('attacker');
  const a2=positionWarLabUnit(0,d,'attacker-2',{x:2,y:4});
  expect(nextWarLabDeploymentSide(0,a2)).toBe('defender');
  const done=positionWarLabUnit(0,a2,'defender-2',{x:9,y:4});
  expect(nextWarLabDeploymentSide(0,done)).toBeNull();
  expect(done['attacker-1']).toEqual({x:2,y:2});
  expect(a['attacker-1']).toEqual({x:2,y:2});
 });
});
