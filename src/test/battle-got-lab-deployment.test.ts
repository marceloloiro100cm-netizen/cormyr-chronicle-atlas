import {describe,expect,it} from 'vitest';
import {modelWarLabDeployments} from '@/lib/battle/got/lab-deployment';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

describe('Capítulo 10 — exércitos-modelo com reforços configuráveis',()=>{
 it('preserva quatro posições originais quando não há reforços',()=>{
  expect(modelWarLabDeployments(0).map(u=>[u.id,u.position])).toEqual([
   ['attacker-1',{x:1,y:2}],['attacker-2',{x:1,y:4}],
   ['defender-1',{x:10,y:2}],['defender-2',{x:10,y:4}],
  ]);
 });
 it('adiciona até cinco reforços por lado sem repetir casas do mapa',()=>{
  const squad=modelWarLabDeployments(5);
  expect(squad).toHaveLength(14);
  expect(squad.filter(u=>u.side==='attacker')).toHaveLength(7);
  expect(squad.filter(u=>u.side==='defender')).toHaveLength(7);
  expect(new Set(squad.map(u=>u.position.x+':'+u.position.y)).size).toBe(14);
  expect(new Set(squad.map(u=>u.id)).size).toBe(14);
  expect(squad.every(u=>u.position.y>=0&&u.position.y<7&&
   u.position.x>=0&&u.position.x<12)).toBe(true);
 });
 it('rejeita quantidades acima da capacidade do mapa de laboratório',()=>{
  const expanded=modelWarLabDeployments(12);
  expect(expanded).toHaveLength(28);
  expect(expanded.filter(u=>u.side==='attacker')).toHaveLength(14);
  expect(expanded.filter(u=>u.side==='defender')).toHaveLength(14);
  expect(new Set(expanded.map(u=>u.position.x+':'+u.position.y)).size).toBe(28);
  expect(()=>modelWarLabDeployments(13)).toThrow(/0 a 12/);
  expect(()=>modelWarLabDeployments(-1)).toThrow(/0 a 12/);
  expect(()=>modelWarLabDeployments(1.5)).toThrow(/0 a 12/);
 });
 it('constrói 14 unidades ativas sem alterar modelos ou recursos reais',()=>{
  const set=modelWarLabDeployments(5);
  const initial=createWarBattle({id:'large-lab',name:'Batalha expandida',
   seed:'large-lab-seed',width:12,height:7,
   commanders:modelWarCommanders({attacker:12,defender:12}),
   units:set.map(u=>modelWarUnit({...u,typeId:'infantry'})),
  });
  expect(initial.units).toHaveLength(14);
  expect(initial.units.every(u=>u.source.kind==='model')).toBe(true);
  const b={...initial,turn:'attacker' as const};
  const issued=issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'attacker-3',order:{kind:'defend'}});
  expect(issued.passed).toBe(true);
  expect(issued.battle.events.some(e=>e.kind==='command'&&
   e.text.includes('Reforço atacante 1'))).toBe(true);
 });
});
