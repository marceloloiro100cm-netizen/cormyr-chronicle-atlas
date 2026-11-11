import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder,previewWarAttack,previewWarChargeReach,advanceWarRound} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {rollDice} from '@/lib/battle/got/dice';
import {warRollDistribution,warTestOdds,warExpectedDamage,formatWarChance} from '@/lib/battle/got/odds';
import {attackableWarTargets,quickWarOrders,reachableWarCells,warCommandOdds} from '@/lib/battle/got/command-preview';
import {buildWarForce,suggestedWarfare,warUnitPowerCost,WAR_FORCE_MAX_UNITS,WAR_FORCE_TIERS} from '@/lib/battle/got/force-builder';
import {buildWarConvocationPlan,stableWarUuid} from '@/lib/battle/got/convocation';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {chooseWarAiOrder} from '@/lib/battle/got/ai-commander';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

const field=(extra:Partial<Parameters<typeof createWarBattle>[0]>={}):WarBattle=>createWarBattle({
 id:'ux-test',name:'Teste de comando',seed:'comando-tatico',width:12,height:7,
 commanders:modelWarCommanders({attacker:3,defender:3}),
 units:[
  modelWarUnit({id:'a1',name:'Lanceiros',side:'attacker',position:{x:4,y:3},typeId:'infantry'}),
  modelWarUnit({id:'a2',name:'Arqueiros',side:'attacker',position:{x:1,y:1},typeId:'archers'}),
  modelWarUnit({id:'d1',name:'Guarda',side:'defender',position:{x:5,y:3},typeId:'infantry'}),
  modelWarUnit({id:'d2',name:'Batedores',side:'defender',position:{x:10,y:5},typeId:'scouts'}),
 ],...extra});

describe('GOT · probabilidades exatas dos testes',()=>{
 it('distribuição soma 1 e confere com 1 e 2 dados',()=>{
  const one=warRollDistribution(1);
  expect(one.slice(1).every(p=>Math.abs(p-1/6)<1e-12)).toBe(true);
  const two=warRollDistribution(2);
  expect(two[7]).toBeCloseTo(6/36,12);
  expect(two[2]).toBeCloseTo(1/36,12);
  for(const [rank,bonus,penalty] of [[3,0,0],[4,2,0],[3,1,1],[5,3,2],[2,0,2]] as const){
   const total=warRollDistribution(rank,bonus,penalty).reduce((a,b)=>a+b,0);
   expect(total).toBeCloseTo(1,10);
  }
 });
 it('dado de bônus melhora e dado de penalidade piora a chance',()=>{
  const base=warTestOdds({rank:3,difficulty:9}).success;
  expect(warTestOdds({rank:3,bonus:1,difficulty:9}).success).toBeGreaterThan(base);
  expect(warTestOdds({rank:3,penalty:1,difficulty:9}).success).toBeLessThan(base);
  expect(warTestOdds({rank:2,penalty:2,difficulty:1}).success).toBe(0);
 });
 it('concorda com o gerador de dados do motor em grande amostra',()=>{
  let seed=12345,hits=0;const n=20000;
  for(let i=0;i<n;i++){
   const roll=rollDice(seed,3,1,1);seed=roll.nextSeed;
   if(roll.total>=8)hits++;
  }
  const exact=warTestOdds({rank:3,bonus:1,penalty:1,difficulty:8}).success;
  expect(Math.abs(hits/n-exact)).toBeLessThan(0.02);
 });
 it('graus, falha crítica, dano médio e formatação',()=>{
  const odds=warTestOdds({rank:3,difficulty:6});
  expect(odds.degrees.reduce((a,b)=>a+b,0)).toBeCloseTo(odds.success,12);
  expect(odds.critical).toBeCloseTo(0,12);
  // 3d6 nunca ficam 5 abaixo de 6 (mínimo 3 > 1), mas ficam abaixo de 14−5.
  expect(warTestOdds({rank:3,difficulty:14}).critical).toBeGreaterThan(0);
  expect(warExpectedDamage(odds,3,3)).toBeGreaterThan(0);
  expect(warExpectedDamage(odds,1,10)).toBe(0);
  expect(formatWarChance(0.9999)).toBe('>99%');
  expect(formatWarChance(0.0001)).toBe('<1%');
  expect(formatWarChance(0.5)).toBe('50%');
  expect(warTestOdds({rank:3,difficulty:12,modifier:-2}).success)
   .toBeLessThan(warTestOdds({rank:3,difficulty:12}).success);
 });
});
describe('GOT · prévia de comando sem dados',()=>{
 it('prévia de ataque usa exatamente os números da resolução real',()=>{
  const battle=field();
  const preview=previewWarAttack(battle,'a1','d1');
  expect(preview.legal).toBe(true);
  expect(preview.testDice).toBe(3);
  expect(preview.defense).toBe(battle.units.find(u=>u.id==='d1')!.defense);
  const turn={...battle,turn:'attacker' as const};
  const result=issueWarOrder(turn,{commanderId:'leader-attacker',unitId:'a1',
   order:{kind:'attack',targetId:'d1'}});
  const event=result.battle.events.find(e=>e.kind==='attack');
  if(result.passed){
   expect(event?.difficulty).toBe(preview.defense);
   expect(event?.roll).toHaveLength(preview.testDice+preview.bonusDice);
  }
  expect(battle.events).toHaveLength(turn.events.length);
 });
 it('fora de alcance e carga explicam o motivo sem lançar erro',()=>{
  const battle=field();
  expect(previewWarAttack(battle,'a1','d2').legal).toBe(false);
  expect(previewWarAttack(battle,'a1','d2').reason).toMatch(/alcance/);
  expect(previewWarAttack(battle,'a2','d2',{ranged:true}).legal).toBe(true);
  expect(previewWarAttack(battle,'x','d2').legal).toBe(false);
  const charge=previewWarAttack(battle,'a1','d1',{charge:true});
  expect(charge.penaltyDice).toBe(1);
  expect(charge.baseDamage).toBe(previewWarAttack(battle,'a1','d1').baseDamage+2);
  expect(previewWarChargeReach(battle,'a1','d1').legal).toBe(true);
  // Batedores em 10,5 não estão em linha reta com corredor livre a partir de 4,3.
  expect(typeof previewWarChargeReach(battle,'a1','d2').legal).toBe('boolean');
  expect(previewWarChargeReach(battle,'a1','a2').legal).toBe(false);
 });
 it('lista quadrados e alvos legais, com chances',()=>{
  const battle=field();
  const cells=reachableWarCells(battle,'a1');
  expect(cells.length).toBeGreaterThan(4);
  expect(cells.some(c=>c.x===5&&c.y===3)).toBe(false);
  expect(cells.every(c=>Math.abs(c.x-4)+Math.abs(c.y-3)<=4)).toBe(true);
  const sprint=reachableWarCells(battle,'a1',true);
  expect(sprint.every(c=>c.x===4||c.y===3)).toBe(true);
  const melee=attackableWarTargets(battle,'a1','melee');
  expect(melee.map(t=>t.unitId)).toEqual(['d1']);
  expect(melee[0]!.odds!.success).toBeGreaterThan(0.5);
  expect(melee[0]!.expectedDamage).toBeGreaterThanOrEqual(0);
  expect(attackableWarTargets(battle,'a2','ranged').length).toBe(2);
  expect(attackableWarTargets(battle,'a1','ranged')).toHaveLength(0);
  expect(attackableWarTargets(battle,'a1','charge').some(t=>t.unitId==='d1')).toBe(true);
  expect(reachableWarCells(battle,'nope')).toHaveLength(0);
 });
 it('chance de comando acompanha a Disciplina e ordens repetidas',()=>{
  const battle=field();
  const unit=battle.units.find(u=>u.id==='a1')!;
  const leader=battle.commanders.find(c=>c.side==='attacker')!;
  const first=warCommandOdds(battle,leader,unit,{kind:'attack'});
  expect(first.difficulty).toBe(unit.discipline);
  const tired=warCommandOdds(battle,leader,{...unit,issuedThisRound:1},{kind:'attack'});
  expect(tired.difficulty).toBe(unit.discipline+3);
  expect(tired.odds.success).toBeLessThan(first.odds.success);
 });
 it('ordens rápidas respeitam a condição e o equipamento da tropa',()=>{
  const battle=field();
  const infantry=battle.units.find(u=>u.id==='a1')!;
  const archers=battle.units.find(u=>u.id==='a2')!;
  const ids=(u:WarUnit)=>quickWarOrders(u).map(o=>o.id);
  expect(ids(infantry)).toEqual(['attack','charge','move','run','defend','retreat']);
  expect(ids(archers)).toContain('shoot');
  expect(ids({...infantry,health:4})).toContain('rally');
  expect(ids({...infantry,condition:'disorganized',health:0})).toContain('reorganize');
  expect(ids({...infantry,condition:'routed',health:0})).toEqual(['revive']);
  expect(new Set(ids(archers)).size).toBe(ids(archers).length);
 });
});
describe('GOT · forças por Poder da Casa',()=>{
 it('respeita o orçamento, o limite do tabuleiro e cresce com o Poder',()=>{
  let previous=0;
  for(const power of [0,5,12,20,38,55,75,120,200]){
   const force=buildWarForce(power);
   expect(force.units.length).toBeGreaterThanOrEqual(2);
   expect(force.units.length).toBeLessThanOrEqual(WAR_FORCE_MAX_UNITS);
   expect(force.spent).toBe(force.units.reduce((n,u)=>n+u.cost,0));
   if(power>=12)expect(force.spent).toBeLessThanOrEqual(power);
   expect(force.units.length).toBeGreaterThanOrEqual(previous);
   previous=force.units.length;
   for(const unit of force.units)
    expect(unit.cost).toBe(warUnitPowerCost(unit.typeId,unit.training));
  }
  expect(buildWarForce(75).units.length).toBeGreaterThan(buildWarForce(20).units.length);
  expect(suggestedWarfare(75)).toBeGreaterThan(suggestedWarfare(20));
  expect(WAR_FORCE_TIERS.map(t=>t.power)).toEqual([...WAR_FORCE_TIERS.map(t=>t.power)].sort((a,b)=>a-b));
  expect(()=>buildWarForce(-1)).toThrow();
 });
});
describe('GOT · plano de convocação oficial',()=>{
 const official=(unit:WarUnit,houseId:string,unitId:string):WarUnit=>({...unit,
  source:{kind:'house-readonly',houseId,unitId,version:7}});
 const finished=():WarBattle=>{
  const base=field();
  const units=base.units.map(u=>u.id==='a1'?official(u,'casa-a','11111111-1111-4111-8111-111111111111'):
   u.id==='d1'?{...official(u,'casa-d','22222222-2222-4222-8222-222222222222'),
    condition:'destroyed' as const,health:0}:
   u.id==='d2'?{...u,condition:'destroyed' as const,health:0}:u);
  return {...base,units,phase:'finished',winner:'attacker'};
 };
 it('só unidades oficiais geram lançamentos, com chaves estáveis',()=>{
  const battle=finished();
  const aftermath=previewWarAftermath(battle);
  const plan=buildWarConvocationPlan(battle,aftermath,'Batalha do Vau');
  expect(plan.officialUnits).toBe(2);
  expect(plan.modelUnits).toBe(2);
  expect(plan.houses.map(h=>h.houseId).sort()).toEqual(['casa-a','casa-d']);
  const entry=plan.houses.find(h=>h.houseId==='casa-d')!.entries[0]!;
  expect(entry.condition).toBe('destroyed');
  expect(entry.roll).toBeGreaterThanOrEqual(1);
  expect(entry.roll).toBeLessThanOrEqual(6);
  expect(entry.sourceVersion).toBe(7);
  expect(entry.justification).toContain('Batalha do Vau');
  expect(entry.justification).toContain('derrota');
  const again=buildWarConvocationPlan(battle,previewWarAftermath(battle),'Batalha do Vau');
  expect(again.houses.flatMap(h=>h.entries.map(e=>e.operationKey)))
   .toEqual(plan.houses.flatMap(h=>h.entries.map(e=>e.operationKey)));
  const keys=plan.houses.flatMap(h=>h.entries.flatMap(e=>[e.operationKey,e.evolutionId]));
  expect(new Set(keys).size).toBe(keys.length);
  for(const key of keys)
   expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(aftermath.appliedToHouse).toBe(false);
 });
 it('recusa batalha em andamento ou resultado de outra batalha',()=>{
  const battle=finished();
  expect(()=>buildWarConvocationPlan(field(),previewWarAftermath(battle))).toThrow(/encerrada/);
  expect(()=>buildWarConvocationPlan({...battle,id:'outra'},previewWarAftermath(battle)))
   .toThrow(/não pertence/);
  expect(stableWarUuid('a')).not.toBe(stableWarUuid('b'));
  expect(stableWarUuid('a')).toBe(stableWarUuid('a'));
 });
 it('refatoração do ataque mantém a batalha determinística',()=>{
  const play=()=>{
   let b:WarBattle={...field(),turn:'attacker'};
   b=issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a1',order:{kind:'attack',targetId:'d1'}}).battle;
   if(b.phase==='orders'&&b.turn==='defender')
    b=issueWarOrder(b,{commanderId:'leader-defender',unitId:'d1',order:{kind:'attack',targetId:'a1'}}).battle;
   return b.phase==='orders'?advanceWarRound(b):b;
  };
  expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
 });
});
describe('GOT · oponente automático',()=>{
 it('sempre escolhe ordem legal e a batalha termina sem intervenção',()=>{
  for(const seed of ['ia-1','ia-2','ia-3','ia-4','ia-5','ia-6']){
   let battle=field({seed,units:[
    modelWarUnit({id:'a1',name:'Lanceiros',side:'attacker',position:{x:1,y:2},typeId:'infantry'}),
    modelWarUnit({id:'a2',name:'Arqueiros',side:'attacker',position:{x:1,y:4},typeId:'archers'}),
    modelWarUnit({id:'a3',name:'Cavaleiros',side:'attacker',position:{x:1,y:6},typeId:'cavalry'}),
    modelWarUnit({id:'d1',name:'Guarda',side:'defender',position:{x:10,y:2},typeId:'infantry'}),
    modelWarUnit({id:'d2',name:'Batedores',side:'defender',position:{x:10,y:4},typeId:'scouts'}),
   ]});
   let guard=0;
   while(battle.phase==='orders'&&guard++<600){
    const decision=chooseWarAiOrder(battle,battle.turn);
    if(!decision){battle=advanceWarRound(battle);continue;}
    const before=battle.ordersRemaining[decision.commanderId]!;
    battle=issueWarOrder(battle,decision).battle;
    expect(battle.ordersRemaining[decision.commanderId]).toBe(before-1);
    expect(decision.note.length).toBeGreaterThan(10);
    const left=Object.values(battle.ordersRemaining).reduce((a,b)=>a+b,0);
    if(left===0&&battle.phase==='orders')battle=advanceWarRound(battle);
   }
   expect(battle.phase).toBe('finished');
   expect(battle.round).toBeLessThan(60);
  }
 });
 it('não age fora da vez, prefere atacar quem está engajado e é determinístico',()=>{
  const battle={...field(),turn:'attacker' as const};
  expect(chooseWarAiOrder(battle,'defender')).toBeNull();
  const decision=chooseWarAiOrder(battle,'attacker')!;
  expect(decision.order.kind).toBe('attack');
  expect(decision.unitId).toBe('a1');
  expect(chooseWarAiOrder(battle,'attacker')).toEqual(decision);
  expect(chooseWarAiOrder({...battle,phase:'finished'},'attacker')).toBeNull();
 });
});
