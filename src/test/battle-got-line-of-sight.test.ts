import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,fireWarSiegeVolley} from '@/lib/battle/got/engine';
import {canSeeWarTarget,traceWarSightline} from '@/lib/battle/got/line-of-sight';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeModelSiege} from '@/lib/battle/got/siege';
import type {WarBattle} from '@/lib/battle/got/types';

function setup(visible:boolean,siege=false):WarBattle{
 const a=modelWarUnit({id:'a',name:'Arqueiros',side:'attacker',
  typeId:siege?'engineers':'archers',position:{x:2,y:3}});
 const b=modelWarUnit({id:'d',name:'Guarnição',side:'defender',
  typeId:'garrison',position:{x:5,y:3}});
 const gun=makeModelSiege({id:'gun',kind:'scorpion',side:'attacker',
  position:{x:2,y:3},engineerId:'a'});
 const initial=createWarBattle({id:'los',name:'Linha de visão',
  seed:'los-seed',width:12,height:7,
  commanders:modelWarCommanders({attacker:12,defender:6}),
  strictLineOfSight:visible,
  tiles:[{x:4,y:3,terrain:'wall'}],
  units:[{...a,ability:{...a.ability,marksmanship:12,warfare:12}},
   {...b,armor:0,defense:0}],
  ...(siege?{siege:[gun]}:{})});
 return {...initial,turn:'attacker'};
}
describe('Combate digital opcional — linha de visão tática em quadrados',()=>{
 it('o traçado inclui células vizinhas de cantos tocados pela diagonal',()=>{
  expect(traceWarSightline({x:1,y:1},{x:2,y:2})).toEqual([
   {x:1,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2},
  ]);
  expect(canSeeWarTarget({x:1,y:1},{x:2,y:2},[
   {x:2,y:1,terrain:'wall'},
  ])).toBe(false);
  expect(canSeeWarTarget({x:1,y:1},{x:2,y:2},[
   {x:2,y:1,terrain:'sparse-forest'},
  ])).toBe(true);
 });
 it('com opção habilitada, muralha intermediária bloqueia a ordem de Pontaria',()=>{
  const b=setup(true),snapshot=JSON.stringify(b);
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'attack',targetId:'d',ranged:true},
  })).toThrow(/Linha de visão bloqueada/);
  expect(JSON.stringify(b)).toBe(snapshot);
 });
 it('sem opção de linha de visão, comportamento original do livro é mantido',()=>{
  const b=setup(false);
  const result=issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'attack',targetId:'d',ranged:true},
  });
  expect(result.passed).toBe(true);
  expect(result.battle.events.some(e=>e.kind==='attack')).toBe(true);
 });
 it('escorpião precisa de linha de visão no modo digital opcional',()=>{
  const b=setup(true,true);
  expect(()=>fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetId:'d',
  })).toThrow(/Escorpião sem linha de visão/);
  const normal=setup(false,true);
  const out=fireWarSiegeVolley(normal,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetId:'d',
  });
  expect(out.events.some(e=>e.kind==='siege')).toBe(true);
 });
 it('cobertura na casa do próprio alvo não é bloqueio absoluto',()=>{
  expect(canSeeWarTarget({x:2,y:3},{x:5,y:3},[
   {x:5,y:3,terrain:'wall'},
  ])).toBe(true);
 });
});
