import {describe,it,expect} from 'vitest';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import {crzStart,crzPlay,crzLegalCommands} from '@/lib/crusade/turns';
import {crzCast} from '@/lib/crusade/leader';
import {crzDistance,crzNeighbors,crzHexKey,crzMapIndex} from '@/lib/crusade/geometry';
import {initialGeneralProfile,generalTrainingLevel,generalProfileFromJson,
 awardGeneralTraining} from '@/lib/crusade/general-progression';
import {crzReplayBegin} from '@/lib/crusade/replay';

describe('P2 · variantes CRZ jogáveis de treino',()=>{
 for(const preset of ['CRZ-WOTR','PTE-2.0-compat'] as const){
  it('executa ataque legal do preset '+preset+' sem efeito em fichas oficiais',()=>{
   const ready=crzTrainingReady({...CRZ_TRAINING_DEFAULTS,preset,
    opponent:'human',resolution:'expected'});
   const started=crzStart(ready);
   expect(started.rulesetId).toBe(preset);
   const actor=started.stacks.find(s=>s.id===started.activeStackId)!;
   const target=started.stacks.find(s=>s.side!==actor.side)!;
   const available=crzMapIndex(started.map);
   const targetPos=crzNeighbors(actor.position).find(h=>
    available.get(crzHexKey(h))?.terrain!=='rock'&&available.has(crzHexKey(h))&&
    !started.stacks.some(s=>s.id!==actor.id&&s.id!==target.id&&
     crzHexKey(s.position)===crzHexKey(h)))!;
   expect(targetPos).toBeDefined();
   const before={...started,stacks:started.stacks.map(s=>
    s.id===target.id?{...s,position:targetPos}:s)};
   const attack=crzLegalCommands(before).find(c=>
    c.type==='ATTACK'&&c.targetId===target.id&&c.mode==='melee');
   if(!attack)throw new Error('Sem ataque corpo a corpo legal para o preset '+preset);
   const after=crzPlay(before,attack,'human');
   expect(after.events.some(e=>e.type==='ATTACK_RESOLVED')).toBe(true);
   expect(after.stacks.find(s=>s.id===target.id)!.hpPool)
    .toBeLessThanOrEqual(target.hpPool);
   expect(started.events).not.toEqual(after.events);
   expect(started.stacks.find(s=>s.id===target.id)!.position).toEqual(target.position);
  });
 }
 it('recusa preset com resolução híbrida e preserva CRZ-5E híbrido',()=>{
  expect(()=>crzTrainingReady({...CRZ_TRAINING_DEFAULTS,preset:'CRZ-WOTR',
   resolution:'hybrid'})).toThrow(/expected/);
  expect(crzStart(crzTrainingReady(CRZ_TRAINING_DEFAULTS)).rulesetId).toBe('CRZ-5E');
 });
});

describe('P3 · magia multi-alvo e progressão segura',()=>{
 it('atinge várias pilhas inimigas com uma magia; registra eventos e não causa fogo amigo',()=>{
  const start=crzStart(crzTrainingReady({...CRZ_TRAINING_DEFAULTS,opponent:'human'}));
  const active=start.stacks.find(s=>s.side==='attacker')!;
  const enemy=start.stacks.filter(s=>s.side==='defender');
  const anchor={q:active.position.q+3,r:active.position.r};
  const shifted=start.stacks.map(s=>{
   const index=enemy.findIndex(e=>e.id===s.id);
   return index>=0?{...s,position:{q:anchor.q+index%2,r:anchor.r+Math.floor(index/2)}}:s;
  });
  const battle={...start,activeStackId:active.id,stacks:shifted};
  const attackerHp=battle.stacks.filter(s=>s.side==='attacker').map(s=>s.hpPool);
  const cast=crzCast(battle,'fireball',enemy[0]!.id);
  const dealt=cast.events.filter(e=>e.type==='SPELL_DAMAGE');
  expect(dealt.length).toBeGreaterThanOrEqual(2);
  expect(dealt.every(e=>e.type==='SPELL_DAMAGE'&&enemy.some(u=>u.id===e.unitId))).toBe(true);
  expect(cast.stacks.filter(s=>s.side==='attacker').map(s=>s.hpPool)).toEqual(attackerHp);
  expect(cast.leaders.attacker!.energy).toBe(start.leaders.attacker!.energy-6);
  expect(start.events.some(e=>e.type==='SPELL_DAMAGE')).toBe(false);
  expect(crzDistance(active.position,anchor)).toBeLessThanOrEqual(5);
 });
 it('nível de General depende somente de XP válido e recusa perfil adulterado',()=>{
  const empty=initialGeneralProfile();
  expect(empty.level).toBe(1);
  expect(generalTrainingLevel(99)).toBe(1);
  expect(generalTrainingLevel(100)).toBe(2);
  expect(generalTrainingLevel(2840)).toBe(10);
  expect(generalProfileFromJson(JSON.stringify(empty))).toEqual(empty);
  expect(()=>generalProfileFromJson(JSON.stringify({...empty,level:10})))
   .toThrow(/incompatível/);
  expect(()=>generalProfileFromJson(JSON.stringify({...empty,replayHashes:['a'.repeat(64),'a'.repeat(64)]})))
   .toThrow(/duplicado/);
 });
 it('não concede XP com replay ainda em andamento',()=>{
  const session=crzReplayBegin(crzTrainingReady(CRZ_TRAINING_DEFAULTS));
  expect(()=>awardGeneralTraining(initialGeneralProfile(),session.replay))
   .toThrow(/não encerrada/);
 });
});
