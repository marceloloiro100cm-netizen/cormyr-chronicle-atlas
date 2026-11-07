import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,issueWarSurrender,skipWarSiege,
 fireWarSiegeVolley,completeWarHeroPhase,advanceWarRound} from '@/lib/battle/got/engine';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {makeModelSiege} from '@/lib/battle/got/siege';
import {makeWarFortification} from '@/lib/battle/got/fortifications';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';
import {decodeGotLabSave,encodeGotLabSave} from '@/lib/battle/got/lab-save';
import type {WarBattle,WarSide} from '@/lib/battle/got/types';

const army=(positions:[{x:number;y:number},{x:number;y:number}])=>[
 modelWarUnit({id:'a',name:'Casa A',side:'attacker',
  typeId:'infantry',position:positions[0]}),
 modelWarUnit({id:'d',name:'Casa D',side:'defender',
  typeId:'garrison',position:positions[1]}),
];
const base=(id:string,extra:Partial<Parameters<typeof createWarBattle>[0]>={})=>
 createWarBattle({id,name:id,seed:'acceptance-'+id,width:12,height:7,
  commanders:modelWarCommanders({attacker:12,defender:12}),
  units:army([{x:1,y:3},{x:10,y:3}]),...extra});
const leader=(side:WarSide)=>'leader-'+side;

describe('Aceitação de cinco cenários completos — Guerra dos Tronos, laboratório isolado',()=>{
 it('1. escaramuça: três rodadas, ordens dos dois exércitos e mesmas sementes após retomar',()=>{
  let b=base('campal');
  const initial=JSON.stringify(b);
  for(let round=1;round<=3;round++){
   const previous=b.events.length;
   for(const side of ['attacker','defender'] as const){
    const state={...b,turn:side};
    const out=issueWarOrder(state,{commanderId:leader(side),unitId:side==='attacker'?'a':'d',
     order:{kind:'defend'}});
    expect(out.passed).toBe(true);
    b=out.battle;
   }
   b=advanceWarRound(b);
   expect(b.round).toBe(round+1);
   expect(b.events.length).toBeGreaterThan(previous);
   expect(decodeGotLabSave(encodeGotLabSave(b))).toEqual(b);
  }
  expect(JSON.stringify(base('campal'))).toBe(initial);
  expect(b.units.every(u=>u.source.kind==='model')).toBe(true);
 });
 it('2. cerco: disparo, recarga, passagem a ordens e preparação de nova rodada',()=>{
  const eng=modelWarUnit({id:'eng',name:'Sapadores',side:'attacker',
   typeId:'engineers',position:{x:1,y:3}});
  const guard=modelWarUnit({id:'guard',name:'Defensores',side:'defender',
   typeId:'garrison',position:{x:5,y:3}});
  const siege=makeModelSiege({id:'cat',kind:'catapult-medium',
   side:'attacker',engineerId:'eng',position:{x:1,y:3},ammo:'stone'});
  const b=base('cerco',{units:[{...eng,ability:{...eng.ability,warfare:12}},guard],
   siege:[siege],fortifications:[makeWarFortification({id:'tower',name:'Torre',
    kind:'tower',side:'defender',cells:[{x:5,y:3}],engineerBuilt:false,
    hoursBuilt:8})]});
  const shot=fireWarSiegeVolley({...b,turn:'attacker'},{
   commanderId:'leader-attacker',weaponIds:['cat'],fortId:'tower'});
  expect(shot.events.some(e=>e.kind==='siege')).toBe(true);
  const after=skipWarSiege({...shot,turn:'defender'});
  expect(after.phase).toBe('orders');
  const next=advanceWarRound(after);
  expect(next.round).toBe(2);
  expect(next.phase).toBe('siege');
  const loaded=decodeGotLabSave(encodeGotLabSave(next));
  expect(loaded.siege[0]?.lastFiredRound).toBe(1);
 });
 it('3. heróis: ambas as janelas pessoais são executadas e segunda rodada começa',()=>{
  const hero=makeModelWarHero({id:'h-a',name:'Lorde',
   side:'attacker',position:{x:2,y:2}});
  const b=base('herois',{heroes:[hero]});
  expect(b.phase).toBe('heroes-first');
  const first=completeWarHeroPhase(b);
  expect(first.phase).toBe('orders');
  const after=advanceWarRound(first);
  expect(after.phase).toBe('heroes-second');
  const second=completeWarHeroPhase(after);
  expect(second.phase).toBe('heroes-first');
  expect(second.round).toBe(2);
  expect(decodeGotLabSave(encodeGotLabSave(second))).toEqual(second);
 });
 it('4. formações: dois turnos com manobras, ângulos e registro de dados auditável',()=>{
  const units=army([{x:2,y:3},{x:3,y:3}]);
  const b=base('formacoes',{units,advancedFormations:true});
  const out=issueWarOrder({...b,turn:'attacker'},{
   commanderId:'leader-attacker',unitId:'a',
   order:{kind:'formation',formation:'battle'},
  });
  expect(out.passed).toBe(true);
  const attack=issueWarOrder({...out.battle,turn:'attacker'},{
   commanderId:'leader-attacker',unitId:'a',
   order:{kind:'attack',targetId:'d'},
  });
  expect(attack.battle.events.some(e=>e.kind==='attack')).toBe(true);
  expect(attack.battle.events.filter(e=>e.roll).length).toBeGreaterThan(1);
  expect(attack.battle.units.find(u=>u.id==='a')?.source.kind).toBe('model');
 });
 it('5. rendição: encerra combate, atribui vitória e calcula consequências sem gravar',()=>{
  const b=base('rendicao');
  const over=issueWarSurrender({...b,turn:'attacker'},{
   commanderId:'leader-attacker'});
  expect(over.battle.phase).toBe('finished');
  expect(over.battle.winner).toBe('defender');
  const before=JSON.stringify(over.battle);
  const survivors=previewWarAftermath(over.battle);
  expect(survivors.appliedToHouse).toBe(false);
  const projection=previewWarResourceConsequences(over.battle,{
   occupiedDomain:false,garrisonHeldForThreeMonths:false,
   capturedLandValue:0,survivingFortDefenseValue:0,
   domainHasCommunityOrFort:false,transferredWealthInvestments:0,
  });
  expect(projection.appliedToHouse).toBe(false);
  expect(projection.loser).toBe('attacker');
  expect(decodeGotLabSave(encodeGotLabSave(over.battle))).toEqual(over.battle);
  expect(JSON.stringify(over.battle)).toBe(before);
 });
});
