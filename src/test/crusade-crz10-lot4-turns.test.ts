import {describe,it,expect} from 'vitest';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {offsetToAxial,hexDistance} from '@/lib/battle/geometry/hex';
import {crzSealCreature} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';
import {crzPreset,CRZ_APPROVED_HASHES} from '@/lib/crusade/ruleset';
import {crzFromPool} from '@/lib/crusade/stack';
import {crzPrepareBattle,crzStartBattle,crzOrder,crzMoraleAfterDamage,
 type CrzBattleState,type CrzBattleUnit} from '@/lib/crusade/battle';
import {crzApplyCommand} from '@/lib/crusade/turns';
import {crzReachable,crzAttackOptions} from '@/lib/crusade/geometry';
import {crzStrike} from '@/lib/crusade/combat';

function creature(name:'gob'|'orc'){
 const gob=name==='gob';
 return crzSealCreature({
  schemaVersion:1,id:name+'-sintetico|test',name:name,
  source:'Ficha ficcional dos goldens de integração',
  size:'M',creatureType:'humanoid',tags:['synthetic','manual'],
  cr:gob?0.25:0.5,xp:gob?50:100,proficiencyBonus:2,
  abilityMods:{str:2,dex:gob?2:1,con:1,int:0,wis:0,cha:0},
  hp:{average:gob?7:15},ac:gob?15:13,speedFt:{walk:30},
  attacks:[{id:'blade',name:'Arma sintética',kind:'melee',
   toHit:gob?4:5,reachFt:5,damage:[{
    dice:gob?'1d6':'1d12',mod:gob?2:3,
    avg:gob?5:9,type:'slashing',
   }]}],
  multiattack:{steps:[],origin:'fallback'},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[],
  flags:{flying:false,ranged:false,caster:false,legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Monstros sintéticos com valores fornecidos no golden técnico de Cormyr',
   permissionEvidence:'Uso interno de entradas numéricas dos exemplos enviados pelo Narrador.'},
  warnings:[],
 });
}
const rules=crzPreset('CRZ-5E');
const catalog=crzBuildCatalog([creature('gob'),creature('orc')]);
const troop=(id:string,templateId:string,count:number,position?:{q:number;r:number})=>({
 id,templateId,count,source:{kind:'fictional' as const},training:'trained' as const,
 ...(position?{position}:{}),
});
function ready(args:{
 goblins?:number;orcs?:number;
 attackerIds?:readonly string[];defenderIds?:readonly string[];
 resolution?:'expected'|'hybrid'|'rolled';
 scenario?:'plain-open'|'contested-woods'|'border-hills'|'narrow-passage';
 withLeader?:boolean;seed?:string;
}={}){
 const attackers=args.attackerIds??['a1'],defenders=args.defenderIds??['d1'];
 return crzPrepareBattle({
  catalog,rulesetId:'CRZ-5E',rulesetHash:CRZ_APPROVED_HASHES['CRZ-5E'],
  seed:args.seed??'aabbccdd',resolution:args.resolution??'expected',
  map:createScenario(args.scenario??'plain-open'),
  attacker:{side:'attacker',name:'Forças ficcionais A',
   stacks:attackers.map(id=>troop(id,'gob-sintetico|test',args.goblins??60))},
  defender:{side:'defender',name:'Forças ficcionais B',
   stacks:defenders.map(id=>troop(id,'orc-sintetico|test',args.orcs??30))},
  ...(args.withLeader?{leaders:{attacker:{
   id:'tillet-sintetico',name:'Tillet de treino',level:3,castingMod:2,
   spells:['bless','bane','shield_of_faith','cure_wounds'] as const,
  }}}:{}),
 });
}
function adjacent(state:CrzBattleState):CrzBattleState{
 return {...state,stacks:state.stacks.map(s=>({...s,
  position:s.side==='attacker'?offsetToAxial(2,4):offsetToAxial(3,4),
 }))};
}
describe('CRZ-1.0 Lote 4 · setup e iniciativa',()=>{
 it('prepara com seed, hash e implanta pilhas ficcionais em zonas distintas',()=>{
  const state=ready({attackerIds:['a1','a2'],defenderIds:['d1','d2']});
  expect(state).toMatchObject({rulesVersion:'CRZ-1.0',phase:'ready',
   rulesetId:'CRZ-5E',seed:'aabbccdd',round:0,activeId:null,
   noProgressRounds:0,winner:null});
  expect(state.stacks).toHaveLength(4);
  const positions=new Set(state.stacks.map(s=>s.position.q+','+s.position.r));
  expect(positions.size).toBe(4);
  expect(state.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  for(const s of state.stacks){
   expect(state.map.deployment[s.side]).toContainEqual(s.position);
  }
  expect(ready({attackerIds:['a1','a2'],defenderIds:['d1','d2']}))
   .toEqual(state);
 });
 it('recusa configurações adulteradas, seed ausente e presets sem redutor',()=>{
  const input=ready();
  expect(()=>crzPrepareBattle({...{
   catalog,rulesetId:'CRZ-5E' as const,rulesetHash:'0'.repeat(64),
   seed:'aabbccdd',resolution:'expected' as const,map:input.map,
   attacker:{side:'attacker' as const,name:'A',stacks:[troop('a1','gob-sintetico|test',1)]},
   defender:{side:'defender' as const,name:'B',stacks:[troop('d1','orc-sintetico|test',1)]},
  }})).toThrow(/E_SETUP_RULESET/);
  expect(()=>crzPrepareBattle({
   catalog,rulesetId:'CRZ-WOTR',rulesetHash:CRZ_APPROVED_HASHES['CRZ-WOTR'],
   seed:'aabbccdd',resolution:'expected',map:input.map,
   attacker:{side:'attacker',name:'A',stacks:[troop('a1','gob-sintetico|test',1)]},
   defender:{side:'defender',name:'B',stacks:[troop('d1','orc-sintetico|test',1)]},
  })).toThrow(/redutor.*somente CRZ-5E/i);
  expect(()=>crzPrepareBattle({
   catalog,rulesetId:'CRZ-5E',rulesetHash:CRZ_APPROVED_HASHES['CRZ-5E'],
   seed:'',resolution:'expected',map:input.map,
   attacker:{side:'attacker',name:'A',stacks:[troop('a1','gob-sintetico|test',1)]},
   defender:{side:'defender',name:'B',stacks:[troop('d1','orc-sintetico|test',1)]},
  })).toThrow(/E_SETUP_SEED/);
 });
 it('ordena por iniciativa, atacante, DEX e ID, sem RNG',()=>{
  const base=ready({attackerIds:['a1','a2'],defenderIds:['d1','d2']});
  expect(crzOrder(base.stacks,rules)).toEqual(['a1','a2','d1','d2']);
  const started=crzStartBattle(base);
  expect(started.phase).toBe('active');
  expect(started.round).toBe(1);
  expect(started.activeId).toBe('a1');
  expect(started.queue).toEqual(['a2','d1','d2']);
  expect(started.events.map(e=>e.type).slice(0,2))
   .toEqual(['BATTLE_STARTED','ACTIVATED']);
  expect(crzStartBattle(ready())).toEqual(crzStartBattle(ready()));
 });
});
describe('CRZ-1.0 Lote 4 · ações, moral e retaliação',()=>{
 it('T-INT-01: goblins causam 208, orcs ficam abalados e retaliam 78',()=>{
  const before=adjacent(crzStartBattle(ready()));
  const after=crzApplyCommand(before,{type:'ATTACK',unitId:'a1',targetId:'d1'});
  const orcs=after.stacks.find(s=>s.id==='d1')!;
  const goblins=after.stacks.find(s=>s.id==='a1')!;
  expect(orcs).toMatchObject({hpPool:242,alive:17,topHp:2,moraleState:'shaken'});
  expect(goblins).toMatchObject({hpPool:342,alive:49,topHp:6,moraleState:'steady'});
  expect(after.events.find(e=>e.type==='ATTACKED')?.data).toMatchObject({
   mode:'expected',damage:208,casualties:13,aliveBefore:30,aliveAfter:17,
  });
  expect(after.events.find(e=>e.type==='RETALIATED')?.data).toMatchObject({
   mode:'expected',damage:78,casualties:11,aliveBefore:60,aliveAfter:49,
  });
  expect(after.activeId).toBe('a1');
  expect(after.stacks.find(s=>s.id==='d1')?.activation.retaliationRound).toBe(1);
  expect(()=>crzApplyCommand(after,{type:'ATTACK',unitId:'a1',targetId:'d1'}))
   .toThrow(/já atacou/);
 });
 it('não gera retaliação quando o defensor é destruído; termina por eliminação',()=>{
  const state=adjacent(crzStartBattle(ready({orcs:1})));
  const next=crzApplyCommand(state,{type:'ATTACK',unitId:'a1',targetId:'d1'});
  expect(next.phase).toBe('completed');
  expect(next.winner).toBe('attacker');
  expect(next.resultReason).toBe('elimination');
  expect(next.events.some(e=>e.type==='RETALIATED')).toBe(false);
  expect(next.activeId).toBeNull();
 });
 it('moral por baixas não inventa mortos ao debandar',()=>{
  const state=crzStartBattle(ready());
  const target=state.stacks.find(s=>s.id==='d1')!;
  const damaged={...target,...crzFromPool(target,120)};
  const shaken=crzMoraleAfterDamage(damaged,rules);
  expect(shaken.alive).toBe(8);
  expect(shaken.moraleState).toBe('routed');
  expect(shaken.hpPool).toBe(120);
 });
 it('impede teleporte, segundo MOVE, MOVE após ATTACK e ação fora do turno',()=>{
  const state=crzStartBattle(ready());
  expect(()=>crzApplyCommand(state,{type:'MOVE',unitId:'a1',
   to:offsetToAxial(9,4)})).toThrow(/E_COMMAND_MOVE/);
  expect(()=>crzApplyCommand(state,{type:'END_ACTIVATION',unitId:'d1'}))
   .toThrow(/E_COMMAND_TURN/);
  const moves=crzReachable(state,state.stacks.find(s=>s.id==='a1')!);
  expect(moves.length).toBeGreaterThan(0);
  const moved=crzApplyCommand(state,{type:'MOVE',unitId:'a1',to:moves[0]!.to});
  expect(moved.events.some(e=>e.type==='MOVED')).toBe(true);
  expect(moved.progressThisRound).toBe(true);
  expect(()=>crzApplyCommand(moved,{type:'MOVE',unitId:'a1',to:moves[0]!.to}))
   .toThrow(/E_COMMAND_MOVE/);
  expect(()=>crzApplyCommand(moved,{type:'WAIT',unitId:'a1'}))
   .toThrow(/E_COMMAND_WAIT/);
 });
 it('WAIT só uma vez: fila normal antes do retorno reverso; DEFEND persiste até a próxima ativação',()=>{
  let game=crzStartBattle(ready({
   attackerIds:['a1','a2'],defenderIds:['d1','d2'],
  }));
  game=crzApplyCommand(game,{type:'WAIT',unitId:'a1'});
  expect(game.activeId).toBe('a2');
  game=crzApplyCommand(game,{type:'WAIT',unitId:'a2'});
  expect(game.activeId).toBe('d1');
  game=crzApplyCommand(game,{type:'WAIT',unitId:'d1'});
  expect(game.activeId).toBe('d2');
  game=crzApplyCommand(game,{type:'WAIT',unitId:'d2'});
  expect(game.activeId).toBe('d2');
  expect(game.stacks.find(s=>s.id==='d2')?.activation.afterWait).toBe(true);
  expect(()=>crzApplyCommand(game,{type:'WAIT',unitId:'d2'})).toThrow(/E_COMMAND_WAIT/);
  game=crzApplyCommand(game,{type:'DEFEND',unitId:'d2'});
  expect(game.activeId).toBe('d1');
  expect(game.stacks.find(s=>s.id==='d2')?.activation.defendActive).toBe(true);
  game=crzApplyCommand(game,{type:'END_ACTIVATION',unitId:'d1'});
  expect(game.activeId).toBe('a2');
  game=crzApplyCommand(game,{type:'END_ACTIVATION',unitId:'a2'});
  expect(game.activeId).toBe('a1');
  game=crzApplyCommand(game,{type:'END_ACTIVATION',unitId:'a1'});
  expect(game.round).toBe(2);
 });
 it('duas rodadas sem MOVE ou dano encerram por impasse',()=>{
  let game=crzStartBattle(ready());
  for(let count=0;count<8&&game.phase==='active';count++){
   const active=game.activeId!;
   game=crzApplyCommand(game,{type:'END_ACTIVATION',unitId:active});
  }
  expect(game).toMatchObject({phase:'completed',winner:null,
   resultReason:'stalemate',noProgressRounds:2});
 });
 it('ZOC e linha de visão dependem do mapa, nunca do desenho do tabuleiro',()=>{
  const base=crzStartBattle(ready({scenario:'contested-woods'}));
  const actor=base.stacks.find(s=>s.id===base.activeId)!;
  const opts=crzReachable(base,actor);
  expect(opts.every(p=>hexDistance(actor.position,p.to)<=actor.movementHex)).toBe(true);
  expect(crzAttackOptions(base,actor)).toEqual([]);
  const adjacentState=adjacent(base);
  const a=adjacentState.stacks.find(s=>s.id==='a1')!;
  expect(crzAttackOptions(adjacentState,a).map(t=>t.targetId))
   .toContain('d1');
 });
 it('modo esperado não consome RNG na moral numérica',()=>{
  const started=crzStartBattle(ready());
  const old=started.rng;
  let next=crzApplyCommand(started,{type:'END_ACTIVATION',unitId:'a1'});
  next=crzApplyCommand(next,{type:'END_ACTIVATION',unitId:'d1'});
  expect(next.rng).toEqual(old);
 });
});
describe('CRZ-1.0 Lote 4 · general, energia e habilidades controladas',()=>{
 it('general atua antes da tropa, uma vez por rodada, sem regeneração',()=>{
  const started=crzStartBattle(ready({withLeader:true}));
  const originalEnergy=started.leaders.attacker!.energy;
  const blessed=crzApplyCommand(started,{type:'LEADER_CAST',
   side:'attacker',spell:'bless'});
  expect(blessed.leaders.attacker!.energy).toBe(originalEnergy-3);
  expect(blessed.leaders.attacker!.castRound).toBe(1);
  expect(blessed.stacks.find(s=>s.id==='a1')?.effects[0]).toMatchObject({
   stat:'attack',modifier:1,
  });
  expect(()=>crzApplyCommand(blessed,{type:'LEADER_CAST',
   side:'attacker',spell:'cure_wounds',targetId:'a1'}))
   .toThrow(/limite/);
  const movedTo=crzReachable(blessed,blessed.stacks.find(s=>s.id==='a1')!)[0]!.to;
  const moved=crzApplyCommand(blessed,{type:'MOVE',unitId:'a1',to:movedTo});
  expect(()=>crzApplyCommand(moved,{type:'LEADER_CAST',
   side:'attacker',spell:'shield_of_faith',targetId:'a1'})).toThrow(/antes/);
 });
 it('cura preserva o teto do pool original e requer alvo aliado',()=>{
  const started=crzStartBattle(ready({withLeader:true}));
  const wounded={...started,stacks:started.stacks.map(s=>s.id==='a1'?
   {...s,...crzFromPool(s,s.hpPool-35)}:s)};
  const old=wounded.stacks.find(s=>s.id==='a1')!;
  const healed=crzApplyCommand(wounded,{type:'LEADER_CAST',
   side:'attacker',spell:'cure_wounds',targetId:'a1'});
  const current=healed.stacks.find(s=>s.id==='a1')!;
  expect(current.hpPool).toBeGreaterThan(old.hpPool);
  expect(current.hpPool).toBeLessThanOrEqual(current.initialCount*current.hpPerCreature);
  expect(current.alive).toBeGreaterThanOrEqual(old.alive);
  expect(()=>crzApplyCommand(started,{type:'LEADER_CAST',
   side:'attacker',spell:'cure_wounds',targetId:'d1'}))
   .toThrow(/alvo aliado/);
 });
 it('Volley com limites e CHARGE restrita à ficha/movimento adequado',()=>{
  const started=crzStartBattle(ready());
  expect(()=>crzApplyCommand(started,{type:'ABILITY',unitId:'a1',ability:'CHARGE'}))
   .toThrow(/carga exige traço/);
  expect(()=>crzApplyCommand(started,{type:'ABILITY',unitId:'a1',ability:'VOLLEY'}))
   .toThrow(/Volley exige atiradores/);
 });
});
