import {describe,it,expect} from 'vitest';
import {crzPreset,crzRulesetHash} from '@/lib/crusade/ruleset';
import {crzSealCreature} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';
import {crzScenario,crzDistance} from '@/lib/crusade/geometry';
import {crzPrepareBattle} from '@/lib/crusade/setup';
import {crzLegalCommands,type CrzCommand} from '@/lib/crusade/turns';
import {
 crzReplayBegin,crzReplayRecord,crzReplayParse,crzReplayResume,
 crzReplaySerialize,crzVerifyReplay,CRZ_REPLAY_MAX_COMMANDS,
 type CrzReplaySession,
} from '@/lib/crusade/replay';

const rules=crzPreset('CRZ-5E');
function ready(seed='001234abcd',resolution:'expected'|'hybrid'='expected'){
 const creature=crzSealCreature({
  schemaVersion:1,id:'soldado-replay|original',name:'Soldado sintético',
  source:'Teste original do motor CRZ',size:'M',creatureType:'humanoid',
  tags:['test'],cr:0.125,xp:25,proficiencyBonus:2,
  abilityMods:{str:1,dex:2,con:1,int:0,wis:0,cha:0},
  hp:{average:11,formula:'2d8+2'},ac:13,
  speedFt:{walk:30},
  attacks:[
   {id:'blade',name:'Lâmina',kind:'melee',toHit:4,
    reachFt:5,damage:[{dice:'1d6',mod:2,avg:5,type:'slashing'}]},
   {id:'bow',name:'Arco',kind:'ranged',toHit:3,
    rangeFt:{normal:80,long:320},
    damage:[{dice:'1d8',mod:1,avg:5,type:'piercing'}]},
  ],
  multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[],
  flags:{flying:false,ranged:true,caster:false,legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Criatura original produzida para teste de replay.',
   permissionEvidence:'Criada pelo projeto, sem conteúdo de terceiros.'},
  warnings:[],
 });
 const stack=(id:string)=>({
  id,templateId:'soldado-replay|original',count:2,
  training:'trained' as const,source:{kind:'fictional' as const},
 });
 return crzPrepareBattle({
  id:'replay-battle',name:'Treino de replay',seed,
  rulesetId:'CRZ-5E',rulesetHash:crzRulesetHash(rules),
  resolution,map:crzScenario('plain-open'),
  armies:{
   attacker:{side:'attacker',name:'Aliados',stacks:[stack('a')]},
   defender:{side:'defender',name:'Oponentes',stacks:[stack('d')]},
  },
  controls:{attacker:'human',defender:'human'},
 },crzBuildCatalog([creature]));
}
function copy<T>(x:T):T{return JSON.parse(JSON.stringify(x)) as T;}
function recordCommand(session:CrzReplaySession):CrzReplaySession{
 const id=session.state.activeStackId!;
 const commands=crzLegalCommands(session.state);
 return crzReplayRecord(session,commands.find(c=>c.type==='END_ACTIVATION')??{
  type:'END_ACTIVATION',unitId:id,
 });
}
function recordAnAttack(initial:CrzReplaySession):CrzReplaySession{
 let session=initial;
 for(let index=0;index<22;index++){
  if(session.state.phase==='completed')break;
  const current=session.state.stacks.find(s=>s.id===session.state.activeStackId)!;
  const target=session.state.stacks.find(s=>s.side!==current.side)!;
  const legal=crzLegalCommands(session.state);
  const attack=legal.find(c=>c.type==='ATTACK');
  if(attack)return crzReplayRecord(session,attack);
  const moves=legal.filter((c):c is Extract<CrzCommand,{type:'MOVE'}>=>
   c.type==='MOVE');
  const closest=moves.sort((a,b)=>
   crzDistance(a.to,target.position)-crzDistance(b.to,target.position))[0];
  session=crzReplayRecord(session,closest??{
   type:'END_ACTIVATION',unitId:current.id,
  });
 }
 throw new Error('Fixture: ataque não foi alcançado.');
}

describe('CRZ-1.0 Lote 5 · replays locais auditáveis',()=>{
 it('grava movimentos, eventos, round e restaura a mesma partida sem mutar entrada',()=>{
  const initial=ready();
  const session=crzReplayBegin(initial);
  const id=session.state.activeStackId!;
  const move=crzLegalCommands(session.state).find(c=>c.type==='MOVE');
  expect(move).toBeTruthy();
  const moved=crzReplayRecord(session,move!);
  const next=recordCommand(moved);
  expect(session.replay.steps).toHaveLength(0);
  expect(next.replay.steps).toHaveLength(2);
  expect(next.replay.steps[0].events.some(e=>e.type==='MOVED')).toBe(true);
  expect(next.replay.steps[0].command.unitId).toBe(id);
  expect(next.replay.steps[1].prevHash).toBe(next.replay.steps[0].hash);
  const checked=crzVerifyReplay(next.replay);
  expect(checked.ok).toBe(true);
  if(checked.ok)expect(checked.state).toEqual(next.state);
  const json=crzReplaySerialize(next.replay);
  const restored=crzReplayParse(json);
  expect(restored).toEqual(next);
  const extended=recordCommand(restored);
  expect(crzVerifyReplay(extended.replay).ok).toBe(true);
 });
 it('produz replay determinístico com ataques e RNG PCG32 no modo híbrido',()=>{
  const a=recordAnAttack(crzReplayBegin(ready('deadbeef','hybrid')));
  const b=recordAnAttack(crzReplayBegin(ready('deadbeef','hybrid')));
  expect(a.replay).toEqual(b.replay);
  expect(a.state.events.some(e=>e.type==='ATTACK_RESOLVED')).toBe(true);
  expect(a.replay.headHash).toMatch(/^[a-f0-9]{64}$/);
  expect(crzVerifyReplay(a.replay).ok).toBe(true);
  expect(crzReplayResume(a.replay).state).toEqual(a.state);
 });
 it('detecta adulteração em comando, eventos, RNG, estado, sequência e hash',()=>{
  const good=recordAnAttack(crzReplayBegin(ready('001234abcd','hybrid'))).replay;
  const variants=[
   (v:typeof good)=>{(v.steps[0] as any).command.unitId='intruso';},
   (v:typeof good)=>{(v.steps.at(-1) as any).events=[];},
   (v:typeof good)=>{(v.steps[0] as any).rngBefore.state='0000000000000000';},
   (v:typeof good)=>{(v.steps[0] as any).afterHash='0'.repeat(64);},
   (v:typeof good)=>{(v.steps[0] as any).seq=2;},
   (v:typeof good)=>{(v as any).headHash='f'.repeat(64);},
   (v:typeof good)=>{(v.initial as any).seed='deadcafe';},
   (v:typeof good)=>{(v as any).rulesetHash='f'.repeat(64);},
  ];
  for(const mutate of variants){
   const bad=copy(good);
   mutate(bad);
   expect(crzVerifyReplay(bad).ok).toBe(false);
  }
 });
 it('não permite ações ilegais, ator incorreto, snapshots oficiais ou versões não conhecidas',()=>{
  const first=crzReplayBegin(ready());
  expect(()=>crzReplayRecord(first,{
   type:'MOVE',unitId:first.state.activeStackId!,to:{q:500,r:500},
  })).toThrow();
  expect(()=>crzReplayRecord(first,{
   type:'END_ACTIVATION',unitId:first.state.activeStackId!,
  },'ai')).toThrow(/sem controle/i);
  expect(first.replay.steps).toHaveLength(0);
  const disallowed=copy(ready());
  (disallowed.stacks[0] as any).source={kind:'house-readonly'};
  expect(()=>crzReplayBegin(disallowed)).toThrow(/não autorizada/i);
  const bad=copy(first.replay);
  (bad as any).replayVersion=999;
  expect(crzVerifyReplay(bad).ok).toBe(false);
  expect(CRZ_REPLAY_MAX_COMMANDS).toBeGreaterThan(100);
 });
 it('rejeita JSON incompleto ou modificado e impede continuação sobre estado divergente',()=>{
  const session=recordCommand(crzReplayBegin(ready()));
  expect(()=>crzReplayParse('{')).toThrow();
  expect(crzVerifyReplay(null).ok).toBe(false);
  const altered=copy(session);
  (altered.state.stacks[0] as any).hpPool=0;
  expect(()=>crzReplayRecord(altered,{
   type:'END_ACTIVATION',unitId:altered.state.activeStackId!,
  })).toThrow(/divergente/i);
  const edited=copy(session.replay);
  (edited.steps[0] as any).hash='0'.repeat(64);
  expect(()=>crzReplaySerialize(edited)).toThrow();
 });
});
