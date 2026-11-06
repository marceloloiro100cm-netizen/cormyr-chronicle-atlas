import {describe,it,expect} from 'vitest';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS}
 from '@/lib/crusade/training-demo';
import {crzStart,crzPlay,crzLegalCommands,type CrzCommand}
 from '@/lib/crusade/turns';
import {crzOffsetToAxial} from '@/lib/crusade/geometry';
import {crzEffectBonus} from '@/lib/crusade/battle-state';
import {crzShieldWallTargets,CRZ_LOT8_SPELLS}
 from '@/lib/crusade/leader';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay}
 from '@/lib/crusade/replay';

const ready=()=>crzTrainingReady({...CRZ_TRAINING_DEFAULTS,opponent:'human'});
const at=(col:number,row:number)=>crzOffsetToAxial(col,row);
function withScoutInZoc(){
 const initial=crzStart(ready());
 return {...initial,activeStackId:'scout-d',
  stacks:initial.stacks.map(s=>({
   ...s,position:s.id==='scout-d'?at(4,4):
    s.id==='guard-a'?at(5,4):s.position,
  })),
 };
}
function formation(){
 const initial=crzStart(ready());
 return {...initial,activeStackId:'guard-a',
  stacks:initial.stacks.map(s=>({
   ...s,position:s.id==='guard-a'?at(3,4):
    s.id==='guard-b'?at(4,4):
    s.id==='archer-a'?at(1,8):s.position,
  })),
 };
}
describe('CRZ Lote 8 — habilidades táticas determinísticas',()=>{
 it('NIMBLE_ESCAPE é exclusiva da criatura com o traço curado',()=>{
  const state=withScoutInZoc();
  const scout=state.stacks.find(s=>s.id==='scout-d')!;
  const others=state.stacks.filter(s=>s.id!=='scout-d');
  expect(scout.template.traits).toContain('nimble-escape');
  expect(others.every(s=>!s.template.traits.includes('nimble-escape'))).toBe(true);
  expect(crzLegalCommands(state)).toContainEqual({
   type:'ABILITY',unitId:'scout-d',ability:'NIMBLE_ESCAPE',
  });
  const wrong={...state,activeStackId:'guard-a'};
  expect(()=>crzPlay(wrong,{type:'ABILITY',unitId:'guard-a',
   ability:'NIMBLE_ESCAPE'})).toThrow(/ilegal/i);
 });
 it('evasão atravessa ZOC sem atravessar unidades/rochas ou conceder dado extra',()=>{
  const initial=withScoutInZoc();
  const before=crzLegalCommands(initial).filter(
   (c):c is Extract<CrzCommand,{type:'MOVE'}>=>c.type==='MOVE');
  const escaped=crzPlay(initial,{type:'ABILITY',unitId:'scout-d',
   ability:'NIMBLE_ESCAPE'});
  expect(escaped.stacks.find(s=>s.id==='scout-d')!.activation.preparedAbility)
   .toBe('NIMBLE_ESCAPE');
  const after=crzLegalCommands(escaped).filter(
   (c):c is Extract<CrzCommand,{type:'MOVE'}>=>c.type==='MOVE');
  const original=new Set(before.map(c=>c.to.q+','+c.to.r));
  const opened=after.find(c=>!original.has(c.to.q+','+c.to.r));
  expect(opened).toBeDefined();
  const moved=crzPlay(escaped,opened!);
  const scout=moved.stacks.find(s=>s.id==='scout-d')!;
  expect(scout.position).toEqual(opened!.to);
  expect(scout.activation.moved).toBe(true);
  expect(crzLegalCommands(moved).some(c=>c.type==='MOVE')).toBe(false);
  expect(crzLegalCommands(moved).some(c=>c.type==='ABILITY')).toBe(false);
  expect(escaped.rulesetHash).toBe(initial.rulesetHash);
 });
 it('escudo em formação protege apenas aliados corpo a corpo adjacentes',()=>{
  const state=formation();
  const eligible=crzShieldWallTargets(state,'attacker');
  expect(eligible.map(s=>s.id).sort()).toEqual(['guard-a','guard-b']);
  expect(CRZ_LOT8_SPELLS).toContain('shield_wall_formation');
  const beforeEnergy=state.leaders.attacker!.energy;
  const cast=crzPlay(state,{type:'CAST',unitId:'guard-a',
   spellId:'shield_wall_formation',targetId:null});
  expect(cast.leaders.attacker!.energy).toBe(beforeEnergy-2);
  expect(crzEffectBonus(cast.stacks.find(s=>s.id==='guard-a')!,'ac')).toBe(2);
  expect(crzEffectBonus(cast.stacks.find(s=>s.id==='guard-b')!,'ac')).toBe(2);
  expect(crzEffectBonus(cast.stacks.find(s=>s.id==='archer-a')!,'ac')).toBe(0);
  expect(cast.events.filter(e=>e.type==='EFFECT_APPLIED')).toHaveLength(2);
  expect(()=>crzPlay(cast,{type:'CAST',unitId:'guard-a',
   spellId:'shield_wall_formation',targetId:null})).toThrow();
  const refreshed={...cast,leaders:{...cast.leaders,attacker:{
   ...cast.leaders.attacker!,spellsCastThisRound:0,
  }}};
  const recast=crzPlay(refreshed,{type:'CAST',unitId:'guard-a',
   spellId:'shield_wall_formation',targetId:null});
  expect(recast.stacks.find(s=>s.id==='guard-a')!.effects.filter(
   e=>e.id.includes('shield_wall_formation'))).toHaveLength(1);
 });
 it('formação não consome energia com alvo ilegal ou aliados separados',()=>{
  const state=formation();
  expect(()=>crzPlay(state,{type:'CAST',unitId:'guard-a',
   spellId:'shield_wall_formation',targetId:'guard-b'})).toThrow();
  const separated={...state,stacks:state.stacks.map(s=>({
   ...s,position:s.id==='guard-b'?at(1,0):s.position,
  }))};
  expect(crzShieldWallTargets(separated,'attacker')).toHaveLength(0);
  expect(()=>crzPlay(separated,{type:'CAST',unitId:'guard-a',
   spellId:'shield_wall_formation',targetId:null})).toThrow(/formação exige/i);
  expect(state.leaders.attacker!.energy).toBe(separated.leaders.attacker!.energy);
 });
 it('replay com evasão e seed preserva igualdade e detecta adulteração',()=>{
  let session=crzReplayBegin(ready());
  for(let i=0;i<10&&session.state.activeStackId!=='scout-d';i++){
   const id=session.state.activeStackId!;
   session=crzReplayRecord(session,{type:'END_ACTIVATION',unitId:id},'human');
  }
  expect(session.state.activeStackId).toBe('scout-d');
  session=crzReplayRecord(session,{type:'ABILITY',unitId:'scout-d',
   ability:'NIMBLE_ESCAPE'},'human');
  const ok=crzVerifyReplay(session.replay);
  expect(ok.ok).toBe(true);
  if(ok.ok)expect(ok.state).toEqual(session.state);
  const corrupted=JSON.parse(JSON.stringify(session.replay));
  corrupted.steps[corrupted.steps.length-1].command.ability='CHARGE';
  expect(crzVerifyReplay(corrupted).ok).toBe(false);
 });
});
