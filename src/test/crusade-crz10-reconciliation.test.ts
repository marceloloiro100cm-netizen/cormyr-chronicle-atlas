import {describe,it,expect} from 'vitest';
import {crzPreset,crzRulesetHash} from '@/lib/crusade/ruleset';
import {crzSealCreature} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';
import {crzScenario,crzOffsetToAxial,crzHexKey} from '@/lib/crusade/geometry';
import {crzPrepareBattle} from '@/lib/crusade/setup';
import {crzStart,crzPlay,crzLegalCommands,type CrzCommand}
 from '@/lib/crusade/turns';
import {crzLegalActions} from '@/lib/crusade/selectors';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay}
 from '@/lib/crusade/replay';
import type {CrzBattleState} from '@/lib/crusade/battle-state';
import {crzExpected5e} from '@/lib/crusade/damage';
import {crzMakeStack} from '@/lib/crusade/stack';

const rule=crzPreset('CRZ-5E');
function creature(side:'gob'|'orc'){
 const gob=side==='gob';
 return crzSealCreature({
  schemaVersion:1,id:side+'-reconciled|original',name:side,
  source:'Dados fictícios do teste normativo T-INT-01',
  size:'M',creatureType:'humanoid',tags:['synthetic'],cr:gob?0.25:0.5,
  xp:gob?50:100,proficiencyBonus:2,
  abilityMods:{str:2,dex:gob?2:1,con:1,int:0,wis:0,cha:0},
  hp:{average:gob?7:15},ac:gob?15:13,speedFt:{walk:30},
  attacks:[
   {id:'blade',name:'Arma original',kind:'melee',toHit:gob?4:5,
    reachFt:5,damage:[{dice:gob?'1d6':'1d12',mod:gob?2:3,
     avg:gob?5:9,type:'slashing'}]},
   ...(gob?[{id:'bow',name:'Arco original',kind:'ranged' as const,
    toHit:4,rangeFt:{normal:80,long:320},
    damage:[{dice:'1d8',mod:1,avg:5,type:'piercing' as const}]}]:[]),
  ],multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},conditionImmunities:[],
  traits:gob?['charge' as const]:[],
  flags:{flying:false,ranged:gob,caster:false,legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Ficha sintética para testes do motor de Cruzada Cormyr.',
   permissionEvidence:'Entrada original criada para testes, sem bestiário externo.'},
  warnings:[],
 });
}
const catalog=crzBuildCatalog([creature('gob'),creature('orc')]);
const troop=(id:string,side:'gob'|'orc',count:number)=>({
 id,templateId:side+'-reconciled|original',count,
 source:{kind:'fictional' as const},training:'trained' as const,
});
function ready(goblins=60,orcs=30){
 return crzPrepareBattle({
  id:'reconciled-case',name:'T-INT-01 CRZ',
  seed:'aabbccdd',rulesetId:'CRZ-5E',rulesetHash:crzRulesetHash(rule),
  resolution:'expected',map:crzScenario('plain-open'),
  armies:{
   attacker:{side:'attacker',name:'Sintéticos A',stacks:[troop('a','gob',goblins)]},
   defender:{side:'defender',name:'Sintéticos D',stacks:[troop('d','orc',orcs)]},
  },
  controls:{attacker:'human',defender:'human'},
 },catalog);
}
function position(state:CrzBattleState,aColumn:number,dColumn:number):CrzBattleState{
 return {...state,stacks:state.stacks.map(s=>({...s,
  position:crzOffsetToAxial(s.side==='attacker'?aColumn:dColumn,4)}))};
}

describe('Conciliação dos PRs #281 e #282 — regras e habilidades',()=>{
 it('T-INT-01: no CRZ-5E o dano bruto 78 é limitado a 53 (7 baixas)',()=>{
  const state=position(crzStart(ready()),5,6);
  expect(state.activeStackId).toBe('a');
  const result=crzPlay(state,{type:'ATTACK',unitId:'a',targetId:'d',mode:'melee'});
  const orc=result.stacks.find(s=>s.id==='d')!;
  const gob=result.stacks.find(s=>s.id==='a')!;
  expect(orc).toMatchObject({hpPool:242,alive:17,topHp:2,moraleState:'shaken'});
  expect(gob).toMatchObject({hpPool:367,alive:53,topHp:3,moraleState:'steady'});
  expect(result.events.find(e=>e.type==='ATTACK_RESOLVED')).toMatchObject({
   rawDamage:208,appliedDamage:208,casualties:13,
  });
  expect(result.events.find(e=>e.type==='RETALIATION_RESOLVED')).toMatchObject({
   rawDamage:78,appliedDamage:53,casualties:7,
   aliveBefore:60,aliveAfter:53,
  });
  expect(rule.damage.overkill).toBe('cap');
 });
 it('carry só aparece em exemplo explícito, jamais por exceção oculta na retaliação',()=>{
  const withCarry={...rule,damage:{...rule.damage,overkill:'carry' as const}};
  const goblins=crzMakeStack({id:'g',size:'M',count:60,hpPerCreature:7,ruleset:rule});
  const strike={id:'orc-blade',count:1,toHit:5,parts:[{
   type:'slashing',dice:{count:1,sides:12},mod:3,
   mitigation:'normal' as const,
  }]};
  const parameters={attackerCount:17,attackBonus:-2,targetAc:15,
   target:goblins,entries:[strike]};
  const standard=crzExpected5e({ruleset:rule,...parameters});
  const alternate=crzExpected5e({ruleset:withCarry,...parameters});
  expect(standard).toMatchObject({rawDamage:78,receipt:{
   damageApplied:53,casualties:7,
  }});
  expect(alternate).toMatchObject({rawDamage:78,receipt:{
   damageApplied:78,casualties:11,stack:{hpPool:342,alive:49},
  }});
  expect(crzRulesetHash(withCarry)).not.toBe(crzRulesetHash(rule));
 });
 it('CHARGE exige traço e caminho reto com pelo menos dois hexágonos',()=>{
  const start=position(crzStart(ready(3,10)),1,4);
  const current=start.activeStackId!;
  const charge={type:'ABILITY' as const,unitId:current,ability:'CHARGE' as const};
  expect(()=>crzPlay(start,charge)).toThrow(/ilegal/i);
  const intended=crzOffsetToAxial(3,4);
  const move=crzLegalCommands(start).find(c=>c.type==='MOVE'&&
   crzHexKey(c.to)===crzHexKey(intended));
  expect(move).toBeTruthy();
  const moved=crzPlay(start,move!);
  expect(crzLegalActions(moved).abilities).toContain('CHARGE');
  const charged=crzPlay(moved,charge);
  expect(charged.events.some(e=>e.type==='ABILITY_USED')).toBe(true);
  expect(crzLegalActions(charged).canWait).toBe(false);
  expect(()=>crzPlay(charged,{type:'ATTACK',unitId:current,
   targetId:'d',mode:'ranged'})).toThrow(/ilegal/i);
  const command={type:'ATTACK' as const,unitId:current,
   targetId:'d',mode:'melee' as const};
  const normal=crzPlay(moved,command);
  const enhanced=crzPlay(charged,command);
  expect(enhanced.stacks.find(s=>s.id==='d')!.hpPool)
   .toBeLessThan(normal.stacks.find(s=>s.id==='d')!.hpPool);
  expect(start.events.some(e=>e.type==='ABILITY_USED')).toBe(false);
 });
 it('VOLLEY somente para atiradores: consumo limitado e bônus sem buff de retaliação',()=>{
  const state=position(crzStart(ready(3,10)),1,4);
  const volley={type:'ABILITY' as const,unitId:'a',ability:'VOLLEY' as const};
  expect(crzLegalActions(state).abilities).toContain('VOLLEY');
  const used=crzPlay(state,volley);
  expect(used.stacks.find(s=>s.id==='a')!.usage['volley']).toBe(1);
  expect(()=>crzPlay(used,volley)).toThrow(/ilegal/i);
  expect(crzLegalActions(used).attacks.every(a=>a.mode==='ranged')).toBe(true);
  const command={type:'ATTACK' as const,unitId:'a',
   targetId:'d',mode:'ranged' as const};
  const normal=crzPlay(state,command);
  const enhanced=crzPlay(used,command);
  expect(enhanced.stacks.find(s=>s.id==='d')!.hpPool)
   .toBeLessThan(normal.stacks.find(s=>s.id==='d')!.hpPool);
  const withoutCharges={...state,stacks:state.stacks.map(s=>s.id!=='a'?s:{
   ...s,usage:{...s.usage,volley:rule.ability.rechargeUsesPerBattle},
  })};
  expect(crzLegalActions(withoutCharges).abilities).not.toContain('VOLLEY');
 });
 it('seletor é somente leitura e permanece alinhado aos comandos reais',()=>{
  const origin=crzStart(ready(3,10));
  const snapshot=JSON.stringify(origin);
  const choices=crzLegalActions(origin);
  const commands=crzLegalCommands(origin);
  expect(choices.actorId).toBe(origin.activeStackId);
  expect(choices.moves.length).toBe(commands.filter(c=>c.type==='MOVE').length);
  expect(choices.canWait).toBe(commands.some(c=>c.type==='WAIT'));
  expect(choices.abilities).toContain('VOLLEY');
  expect(JSON.stringify(origin)).toBe(snapshot);
 });
 it('replay do lote 5 reexecuta ABILITY e detecta adulteração da habilidade',()=>{
  const start=crzReplayBegin(ready(3,10));
  const ability=crzLegalCommands(start.state).find(
   (c):c is Extract<CrzCommand,{type:'ABILITY'}>=>
    c.type==='ABILITY'&&c.ability==='VOLLEY');
  expect(ability).toBeTruthy();
  const session=crzReplayRecord(start,ability!);
  expect(crzVerifyReplay(session.replay).ok).toBe(true);
  const changed=JSON.parse(JSON.stringify(session.replay)) as typeof session.replay;
  (changed.steps[0] as any).command.ability='CHARGE';
  expect(crzVerifyReplay(changed).ok).toBe(false);
 });
 it('modo expected não consome PCG32 em moral positiva ou abalada',()=>{
  const start=crzStart(ready(3,10));
  const actor=start.activeStackId!;
  const modified={...start,stacks:start.stacks.map(s=>s.id===actor?{
   ...s,morale:50,moraleState:'steady' as const,
  }:{
   ...s,moraleState:'shaken' as const,
  })};
  const after=crzPlay(modified,{type:'END_ACTIVATION',unitId:actor});
  expect(after.rngState).toEqual(start.rngState);
  expect(after.events.some(e=>e.type==='EXTRA_TURN_GRANTED')).toBe(false);
  expect(after.events.some(e=>e.type==='TURN_SKIPPED')).toBe(false);
 });
});
