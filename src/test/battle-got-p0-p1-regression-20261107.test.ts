import {describe,expect,it} from 'vitest';
import {advanceWarRound,createWarBattle,fireWarSiegeVolley,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeModelSiege} from '@/lib/battle/got/siege';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

const troop=(id:string,side:'attacker'|'defender',x:number,y:number,
 typeId:'infantry'|'archers'|'garrison'|'engineers'='infantry')=>
 modelWarUnit({id,name:id,side,position:{x,y},typeId});
const build=(units:WarUnit[],extra:Partial<Parameters<typeof createWarBattle>[0]>={})=>
 createWarBattle({id:'p0-p1',name:'Regressões P0 e P1',seed:'hardening-2026',
  width:20,height:12,units,commanders:modelWarCommanders({attacker:12,defender:12}),
  ...extra});
const resourceScenario={
 occupiedDomain:false,garrisonHeldForThreeMonths:false,
 capturedLandValue:0,survivingFortDefenseValue:0,
 domainHasCommunityOrFort:false,transferredWealthInvestments:0,
} as const;

describe('P0 — resoluções simultâneas e ordem permanente',()=>{
 it('não permite que unidade destruída antes da própria vez execute ordem antiga',()=>{
  const killer={...troop('a','attacker',2,2),meleeDamage:40,defense:0,
   activated:true,standing:{kind:'attack' as const}};
  const victim={...troop('d','defender',3,2),armor:0,defense:0,
   activated:true,standing:{kind:'attack' as const}};
  const start={...build([killer,victim]),phase:'orders' as const,first:'attacker' as const};
  const after=advanceWarRound(start);
  expect(after.units.find(u=>u.id==='d')?.condition).toBe('destroyed');
  expect(after.events.filter(e=>e.kind==='attack')).toHaveLength(1);
 });
 it('consome todas as máquinas comprometidas numa salva mesmo quando a primeira destrói o alvo',()=>{
  const engineer={...troop('eng','attacker',2,3,'engineers'),
   ability:{...troop('eng','attacker',2,3,'engineers').ability,warfare:12}};
  const victim={...troop('d','defender',4,3,'garrison'),health:9,maxHealth:9,
   defense:0,armor:0};
  const siege=[1,2].map(n=>makeModelSiege({id:'cat-'+n,kind:'catapult-large',
   side:'attacker',position:{x:2,y:3},engineerId:'eng',ammo:'stone'}));
  const start={...build([engineer,victim],{siege}),turn:'attacker' as const};
  const after=fireWarSiegeVolley(start,{commanderId:'leader-attacker',
   weaponIds:['cat-1','cat-2'],targetId:'d'});
  expect(after.units.find(u=>u.id==='d')?.condition).toBe('destroyed');
  expect(after.siege.every(s=>s.lastFiredRound===1)).toBe(true);
  expect(after.events.some(e=>e.kind==='siege-spent')).toBe(true);
 });
});

describe('P1 — terreno, unidades escondidas e recursos',()=>{
 it('bloqueia tiro direto sobre unidade oculta e a revela ao mover',()=>{
  const archer=troop('a','attacker',2,2,'archers');
  const hidden={...troop('d','defender',6,2),hidden:true};
  const b={...build([archer,hidden]),phase:'orders' as const,turn:'attacker' as const};
  const before=JSON.stringify(b);
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',
   unitId:'a',order:{kind:'attack',targetId:'d',ranged:true}}))
   .toThrow(/escondida/);
  expect(JSON.stringify(b)).toBe(before);
  const moved=issueWarOrder({...b,turn:'defender'},{
   commanderId:'leader-defender',unitId:'d',
   order:{kind:'move',to:{x:7,y:2}},
  });
  expect(moved.passed).toBe(true);
  expect(moved.battle.units.find(u=>u.id==='d')?.hidden).toBe(false);
 });
 it('não atravessa muralhas em retirada automática',()=>{
  const b={...build([troop('a','attacker',4,3),troop('d','defender',5,3)],{
   tiles:[{x:6,y:3,terrain:'wall'}],
  }),phase:'orders' as const,turn:'defender' as const};
  const out=issueWarOrder(b,{commanderId:'leader-defender',unitId:'d',
   order:{kind:'retreat'}});
  expect(out.passed).toBe(true);
  expect(out.battle.units.find(u=>u.id==='d')?.position).toEqual({x:5,y:3});
 });
 it('mantém Terra Arrasada pendente até o Narrador definir o dono',()=>{
  const base={...build([troop('a','attacker',2,2),troop('d','defender',9,2)]),
   phase:'finished' as const,winner:null,
   scorchedPreview:[{side:'attacker' as const,unitId:'a',domainId:'colheita',
    round:1,populationDelta:-1,wealthDelta:-1}]};
  const pending=previewWarResourceConsequences(base,resourceScenario);
  expect(pending.unresolvedScorchedDomains).toEqual(['colheita']);
  expect(pending.defender.population).toBe(0);
  const confirmed=previewWarResourceConsequences(base,{
   ...resourceScenario,scorchedDomainOwners:{colheita:'defender'},
  });
  expect(confirmed.unresolvedScorchedDomains).toEqual([]);
  expect(confirmed.defender.population).toBe(-1);
  expect(confirmed.defender.wealth).toBe(-1);
  expect(confirmed.appliedToHouse).toBe(false);
 });
 it('monta 48 tropas em mapa amplo sem compartilhar quadrados',()=>{
  const units=[...Array.from({length:24},(_,i)=>troop('a'+i,'attacker',
   1+i%12,1+Math.floor(i/12))),
   ...Array.from({length:24},(_,i)=>troop('d'+i,'defender',
   1+i%12,15+Math.floor(i/12)))];
  const b=build(units,{width:30,height:20});
  expect(b.units).toHaveLength(48);
  expect(new Set(b.units.map(u=>u.position.x+':'+u.position.y)).size).toBe(48);
  expect(b.units.every(u=>u.source.kind==='model')).toBe(true);
 });
});
