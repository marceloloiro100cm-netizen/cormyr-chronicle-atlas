import {describe,expect,it} from 'vitest';
import {createWarBattle,completeWarHeroPhase} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {deployWarSquad} from '@/lib/battle/got/squads';
import {beginPersonalInitiative} from '@/lib/battle/got/personal-initiative';

function sample(){
 return createWarBattle({id:'squad',name:'Dez combatentes',
  seed:'squad-ch10',width:12,height:7,
  commanders:modelWarCommanders({attacker:5,defender:5}),
  units:[
   modelWarUnit({id:'a',name:'Infantaria A',side:'attacker',
    typeId:'infantry',position:{x:2,y:3}}),
   modelWarUnit({id:'d',name:'Guarnição D',side:'defender',
    typeId:'garrison',position:{x:8,y:3}}),
  ],
  heroes:[makeModelWarHero({id:'h',name:'Aventureiro',
   side:'attacker',position:{x:3,y:3}})],
 });
}
describe('Capítulo 10 — esquadrões de dez homens',()=>{
 it('cria dez soldados dentro do quadrado militar de 10×10 sem mexer na ficha oficial',()=>{
  const b=sample(),snapshot=JSON.stringify(b);
  const out=deployWarSquad(b,{unitId:'d',squadId:'grupo-d'});
  expect(out.heroes).toHaveLength(11);
  expect(out.squads?.[0]?.memberIds).toHaveLength(10);
  expect(out.heroes.filter(h=>h.squadId==='grupo-d')).toHaveLength(10);
  for(const member of out.heroes.filter(h=>h.squadId==='grupo-d')){
   expect(member.position).toEqual({x:8,y:3});
   expect(member.personalPosition?.x).toBeGreaterThanOrEqual(80);
   expect(member.personalPosition?.x).toBeLessThan(90);
  }
  expect(JSON.stringify(b)).toBe(snapshot);
  expect(out.units.find(u=>u.id==='d')?.health).toBe(9);
 });
 it('só os dez derrotados causam uma perda de um ponto coletivo',()=>{
  const deployed=deployWarSquad(sample(),{unitId:'d',squadId:'grupo-d'});
  const partial={...deployed,heroes:deployed.heroes.map(h=>
   h.squadId==='grupo-d'&&h.id!=='grupo-d-10'?{...h,active:false,health:0}:h)};
  const notYet=completeWarHeroPhase(partial);
  expect(notYet.units.find(u=>u.id==='d')?.health).toBe(9);
  expect(notYet.squads?.[0]?.casualtyRecorded).toBe(false);

  const defeated={...deployed,heroes:deployed.heroes.map(h=>
   h.squadId==='grupo-d'?{...h,active:false,health:0}:h)};
  const after=completeWarHeroPhase(defeated);
  expect(after.units.find(u=>u.id==='d')?.health).toBe(8);
  expect(after.squads?.[0]?.casualtyRecorded).toBe(true);
  expect(after.events.filter(e=>e.kind==='squad-loss')).toHaveLength(1);
 });
 it('permite dez grupos por centena sem duplicar soldados ou ultrapassar a capacidade',()=>{
  const first=deployWarSquad(sample(),{unitId:'a',squadId:'grupo-a-1'});
  const second=deployWarSquad(first,{unitId:'a',squadId:'grupo-a-2'});
  expect(second.squads).toHaveLength(2);
  expect(second.heroes.filter(h=>h.squadId?.startsWith('grupo-a'))).toHaveLength(20);
  let expanded=second;
  for(let i=3;i<=10;i++)
   expanded=deployWarSquad(expanded,{unitId:'a',squadId:'grupo-a-'+i});
  expect(expanded.squads?.filter(s=>s.unitId==='a')).toHaveLength(10);
  expect(()=>deployWarSquad(expanded,{unitId:'a',squadId:'grupo-a-11'}))
   .toThrow(/no máximo dez/);
  expect(()=>deployWarSquad(first,{unitId:'a',squadId:'grupo-a-1'}))
   .toThrow(/repetido/);
  expect(()=>deployWarSquad(first,{unitId:'nada',squadId:'nenhum'}))
   .toThrow(/origem/);
  const started=beginPersonalInitiative(first);
  expect(()=>deployWarSquad(started,{unitId:'d',squadId:'grupo-d'}))
   .toThrow(/antes de rolar/);
 });
});
