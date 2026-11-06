import {describe,it,expect} from 'vitest';
import {crzPreset,crzRulesetHash} from '@/lib/crusade/ruleset';
import {crzSealCreature} from '@/lib/crusade/creatures';
import {crzBuildCatalog} from '@/lib/crusade/catalog';
import {crzScenario,crzDistance,crzOffsetToAxial,crzReachable,
 crzLineOfSight} from '@/lib/crusade/geometry';
import {crzPrepareBattle} from '@/lib/crusade/setup';
import {crzStart,crzPlay,crzLegalCommands,type CrzCommand}
 from '@/lib/crusade/turns';
import {crzChooseAi,crzRunAi} from '@/lib/crusade/ai';
import {crzCapable,type CrzBattleState} from '@/lib/crusade/battle-state';

const rule=crzPreset('CRZ-5E');
function registry(){
 const creature=crzSealCreature({
  schemaVersion:1,id:'soldado-sintetico|original',name:'Soldado sintético',
  source:'Fichas sintéticas CRZ Lote 4',size:'M',creatureType:'humanoid',
  tags:['test'],cr:0.125,xp:25,proficiencyBonus:2,
  abilityMods:{str:1,dex:2,con:1,int:0,wis:0,cha:0},
  hp:{average:11,formula:'2d8+2'},ac:13,
  speedFt:{walk:30},attacks:[
   {id:'blade',name:'Lâmina de teste',kind:'melee',toHit:4,
    reachFt:5,damage:[{dice:'1d6',mod:2,avg:5,type:'slashing'}]},
   {id:'bow',name:'Arco de teste',kind:'ranged',toHit:3,
    rangeFt:{normal:80,long:320},
    damage:[{dice:'1d8',mod:1,avg:5,type:'piercing'}]},
  ],
  multiattack:{origin:'fallback',steps:[]},
  damageMods:{resist:[],immune:[],vulnerable:[]},
  conditionImmunities:[],traits:[],
  flags:{flying:false,ranged:true,caster:false,legendary:false,swarm:false},
  provenance:{origin:'manual',srd:false,license:'original-authorized',
   attribution:'Ficha sintética de teste produzida para o motor experimental.',
   permissionEvidence:'Criação original, sem material protegido de bestiário.'},
  warnings:[],
 });
 return crzBuildCatalog([creature]);
}
const squad=(id:string,count=20)=>({
 id,templateId:'soldado-sintetico|original',count,
 training:'trained' as const,source:{kind:'fictional' as const},
});
function ready(options:{
 scenario?:'plain-open'|'contested-woods'|'narrow-passage';
 resolution?:'expected'|'hybrid';controls?:{
 attacker:'human'|'ai';defender:'human'|'ai';
 };leaders?:boolean;attackerCount?:number;defenderCount?:number;
}={}){
 return crzPrepareBattle({
  id:'test-battle',name:'Teste de Cruzada',
  seed:'001234abcd',rulesetId:'CRZ-5E',
  rulesetHash:crzRulesetHash(rule),resolution:options.resolution??'expected',
  map:crzScenario(options.scenario??'plain-open'),
  armies:{
   attacker:{side:'attacker',name:'Aliados',
    stacks:[squad('a',options.attackerCount??20)]},
   defender:{side:'defender',name:'Adversário',
    stacks:[squad('d',options.defenderCount??20)]},
  },
  controls:options.controls??{attacker:'human',defender:'human'},
  ...(options.leaders?{leaders:{
   attacker:{id:'commander-a',name:'Tillet de Cormyr',level:3,
    abilityMod:2,spells:['bless','firebolt','cure_wounds']},
   defender:{id:'commander-d',name:'Oficial Dragão Púrpura',level:2,
    spells:['bane']},
  }}:{}),
 },registry());
}
const game=(options:Parameters<typeof ready>[0]={})=>crzStart(ready(options));
function close(state:CrzBattleState):CrzBattleState{
 const a=crzOffsetToAxial(5,4),d=crzOffsetToAxial(6,4);
 return {...state,stacks:state.stacks.map(s=>
  s.side==='attacker'?{...s,position:a}:{...s,position:d})};
}
function countTurnsToRound(state:CrzBattleState,target=2):CrzBattleState{
 let next=state;
 for(let n=0;n<80&&next.phase==='active'&&next.round<target;n++){
  const active=next.activeStackId!;
  next=crzPlay(next,{type:'END_ACTIVATION',unitId:active},
   next.controls[next.stacks.find(s=>s.id===active)!.side]);
 }
 return next;
}
describe('CRZ-1.0 · Lote 4: batalha em memória, isolada e determinística',()=>{
 it('monta mapa 11×9, implantação, iniciativa e evento de início estáveis',()=>{
  const one=game(),two=game();
  expect(one).toEqual(two);
  expect(one.rulesVersion).toBe('CRZ-1.0');
  expect(one.rulesetHash).toBe(crzRulesetHash(rule));
  expect(one.events.map(e=>e.type)).toEqual([
   'BATTLE_STARTED','ROUND_STARTED','ACTIVATION_STARTED',
  ]);
  expect(one.stacks.map(s=>s.position)).toHaveLength(2);
  expect(new Set(one.stacks.map(s=>s.position.q+','+s.position.r)).size).toBe(2);
  expect(one.activeStackId).toBeTruthy();
  expect(one.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  expect(one.round).toBe(1);
 });
 it('revalida o seed, o mapa e as zonas mesmo se um estado inicial for adulterado',()=>{
  const initial=ready();
  const badRng={...initial,rngState:{...initial.rngState,
   state:'0000000000000000'}};
  expect(()=>crzStart(badRng)).toThrow(/E_SETUP_RNG/);
  const badPosition={...initial,stacks:initial.stacks.map((stack,index)=>
   index===0?{...stack,position:{q:500,r:500}}:stack)};
  expect(()=>crzStart(badPosition)).toThrow(/E_SETUP_MAP/);
  const left=initial.stacks.find(s=>s.side==='attacker')!;
  const right=initial.stacks.find(s=>s.side==='defender')!;
  const wrongZone={...initial,stacks:initial.stacks.map(s=>s.id===left.id?
   {...s,position:right.position}:s.id===right.id?
   {...s,position:left.position}:s)};
  expect(()=>crzStart(wrongZone)).toThrow(/E_SETUP_ZONE/);
  expect(crzStart(initial).phase).toBe('active');
 });
 it('impede reusar unidade, comanda somente o lado correto e mantém entrada pura',()=>{
  const first=game(),snapshot=JSON.stringify(first),id=first.activeStackId!;
  expect(()=>crzPlay(first,{type:'END_ACTIVATION',unitId:'intruder'})).toThrow();
  expect(()=>crzPlay(first,{type:'MOVE',unitId:id,to:{q:900,r:900}}))
   .toThrow(/ilegal/i);
  const wrong=first.stacks.find(s=>s.id===id)!.side==='attacker'?'ai':'ai';
  expect(()=>crzPlay(first,{type:'END_ACTIVATION',unitId:id},wrong))
   .toThrow(/sem controle/i);
  expect(JSON.stringify(first)).toBe(snapshot);
 });
 it('permite caminho e movimento dentro do orçamento sem atravessar outras pilhas',()=>{
  const start=game(),id=start.activeStackId!,unit=start.stacks.find(s=>s.id===id)!;
  const moves=crzLegalCommands(start).filter(
   (c):c is Extract<CrzCommand,{type:'MOVE'}>=>c.type==='MOVE');
  expect(moves.length).toBeGreaterThan(0);
  const to=moves[0]!.to;
  const moved=crzPlay(start,{type:'MOVE',unitId:id,to});
  expect(moved.stacks.find(s=>s.id===id)?.position).toEqual(to);
  expect(moved.events.at(-1)?.type).toBe('MOVED');
  expect(crzLegalCommands(moved).some(c=>c.type==='MOVE')).toBe(false);
  expect(()=>crzPlay(moved,{type:'MOVE',unitId:id,to:unit.position}))
   .toThrow();
  expect(start.stacks.find(s=>s.id===id)?.position).toEqual(unit.position);
  const rocks=crzScenario('narrow-passage');
  expect(crzReachable(rocks,crzOffsetToAxial(4,0),6)
   .some(p=>p.to.q===crzOffsetToAxial(5,0).q&&p.to.r===0)).toBe(false);
  expect(crzDistance(unit.position,to)).toBeGreaterThanOrEqual(1);
 });
 it('WAIT posterga ativação, DEFEND concede guarda e não permite esperar novamente',()=>{
  const start=game(),id=start.activeStackId!;
  const waited=crzPlay(start,{type:'WAIT',unitId:id});
  expect(waited.events.some(e=>e.type==='WAITED'&&e.unitId===id)).toBe(true);
  expect(waited.waitingQueue).toContain(id);
  expect(waited.activeStackId).not.toBe(id);
  const second=crzPlay(waited,{type:'END_ACTIVATION',unitId:waited.activeStackId!});
  expect(second.activeStackId).toBe(id);
  expect(second.activeFromWait).toBe(true);
  expect(crzLegalCommands(second).some(c=>c.type==='WAIT')).toBe(false);
  const defended=crzPlay(second,{type:'DEFEND',unitId:id});
  expect(defended.events.some(e=>e.type==='DEFENDED'&&e.unitId===id)).toBe(true);
  // DEFEND da primeira ativação permanece enquanto o outro lado atua.
  const fresh=game(),freshId=fresh.activeStackId!;
  const guard=crzPlay(fresh,{type:'DEFEND',unitId:freshId});
  expect(guard.stacks.find(s=>s.id===freshId)?.defendActive).toBe(true);
 });
 it('avança exatamente uma rodada e não ultrapassa o teto de turnos',()=>{
  const result=countTurnsToRound(game(),2);
  expect(result.round).toBe(2);
  expect(result.events.some(e=>e.type==='ROUND_ENDED'&&e.round===1)).toBe(true);
  expect(result.events.some(e=>e.type==='ROUND_STARTED'&&e.round===2)).toBe(true);
  expect(result.stacks.every(s=>s.activation.moved===false)).toBe(true);
 });
 it('resolve ataque esperado e retaliação apenas uma vez por rodada',()=>{
  const state=close(game()),active=state.stacks.find(s=>s.id===state.activeStackId)!;
  const enemy=state.stacks.find(s=>s.side!==active.side)!;
  const legal=crzLegalCommands(state);
  expect(legal.some(c=>c.type==='ATTACK'&&c.mode==='melee'&&
   c.targetId===enemy.id)).toBe(true);
  const next=crzPlay(state,{type:'ATTACK',unitId:active.id,
   targetId:enemy.id,mode:'melee'});
  const attacks=next.events.filter(e=>e.type==='ATTACK_RESOLVED');
  const retaliation=next.events.filter(e=>e.type==='RETALIATION_RESOLVED');
  expect(attacks).toHaveLength(1);
  expect(retaliation).toHaveLength(1);
  expect(next.stacks.find(s=>s.id===enemy.id)!.hpPool)
   .toBeLessThan(enemy.hpPool);
  expect(next.stacks.find(s=>s.id===enemy.id)?.activation.retaliationRound).toBe(1);
  expect(crzPlay).toBeTypeOf('function');
 });
 it('batalha encerrada por eliminação não aceita comandos posteriores',()=>{
  const state=close(game({attackerCount:100,defenderCount:1})),
   attacker=state.stacks.find(s=>s.side==='attacker')!;
  const current=state.activeStackId!;
  // Se o defensor iniciar pelo desempate, encerra sua ativação primeiro.
  const first=current===attacker.id?state:crzPlay(state,{
   type:'END_ACTIVATION',unitId:current});
  const actor=first.stacks.find(s=>s.id===first.activeStackId)!;
  expect(actor.side).toBe('attacker');
  const defender=first.stacks.find(s=>s.side==='defender')!;
  const final=crzPlay(first,{type:'ATTACK',unitId:actor.id,
   targetId:defender.id,mode:'melee'});
  expect(final.phase).toBe('completed');
  expect(final.winner).toBe('attacker');
  expect(final.resultReason).toBe('elimination');
  expect(final.events.at(-1)?.type).toBe('BATTLE_ENDED');
  expect(()=>crzPlay(final,{type:'END_ACTIVATION',unitId:actor.id}))
   .toThrow(/encerrada/i);
 });
 it('general usa energia uma vez por rodada e só aceita feitiços declarados',()=>{
  const start=game({leaders:true}),unit=start.stacks.find(s=>s.id===start.activeStackId)!;
  const leader=start.leaders[unit.side];
  expect(leader).toBeTruthy();
  const spellId=unit.side==='attacker'?'bless':'bane';
  const next=crzPlay(start,{type:'CAST',unitId:unit.id,spellId,targetId:null});
  expect(next.leaders[unit.side]?.energy).toBe(leader!.energy-3);
  expect(next.leaders[unit.side]?.spellsCastThisRound).toBe(1);
  expect(next.events.some(e=>e.type==='EFFECT_APPLIED')).toBe(true);
  expect(()=>crzPlay(next,{type:'CAST',unitId:unit.id,
   spellId,targetId:null})).toThrow(/momento permitido|já atuou/i);
  expect(start.leaders[unit.side]?.energy).toBe(leader?.energy);
 });
 it('rejeita presets ainda não implementados, sem rotular compatibilidade falsa',()=>{
  const initial=ready();
  const wotr=crzPreset('CRZ-WOTR');
  const patched={...initial,rulesetId:'CRZ-WOTR' as const,
   rulesetHash:crzRulesetHash(wotr),ruleset:wotr};
  expect(()=>crzStart(patched)).toThrow(/aguardam redutores próprios/i);
 });
 it('IA executa comandos da própria facção, respeitando o turno humano',()=>{
  const start=game({controls:{attacker:'human',defender:'ai'}});
  expect(()=>crzChooseAi(start)).toThrow(/lado humano/i);
  const human=start.stacks.find(s=>s.id===start.activeStackId)!;
  if(human.side==='attacker'){
   const changed=crzPlay(start,{type:'END_ACTIVATION',unitId:human.id});
   const played=crzRunAi(changed);
   expect(played.phase==='completed'||played.controls[
    played.stacks.find(s=>s.id===played.activeStackId)!.side]==='human').toBe(true);
   expect(played.events.length).toBeGreaterThan(changed.events.length);
  }
 });
 it('rolagens PCG32 se reproduzem ao atacar no mesmo estado inicial',()=>{
  const origin=close(game({resolution:'hybrid',attackerCount:2,defenderCount:2})),
   unit=origin.stacks.find(s=>s.id===origin.activeStackId)!,
   enemy=origin.stacks.find(s=>s.side!==unit.side)!;
  const cmd={type:'ATTACK' as const,unitId:unit.id,targetId:enemy.id,
   mode:'melee' as const};
  const a=crzPlay(origin,cmd),b=crzPlay(origin,cmd);
  expect(a).toEqual(b);
  expect(a.rngState).not.toEqual(origin.rngState);
 });
});
