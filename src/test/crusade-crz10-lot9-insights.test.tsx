import {describe,it,expect} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {CRZ_TRAINING_DEFAULTS,CRZ_TRAINING_SCENARIOS,crzTrainingReady}
 from '@/lib/crusade/training-demo';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay}
 from '@/lib/crusade/replay';
import {crzStart} from '@/lib/crusade/turns';
import {crzHexKey,crzMapIndex} from '@/lib/crusade/geometry';
import {crzObservedObjectives,crzAfterActionReport,crzAfterActionSerialize,
 CRZ_TRAINING_REPORT_VERSION} from '@/lib/crusade/insights';

const ready=(width:11|15=11,scenario='plain-open')=>crzTrainingReady({
 ...CRZ_TRAINING_DEFAULTS,width,scenario:scenario as 'plain-open',
 opponent:'human',
});
describe('CRZ Lote 9 — marcos observacionais e pós-ação verificável',()=>{
 it('marcos únicos são caminháveis, fora de implantação e estáveis em todos os mapas',()=>{
  for(const size of [11,15] as const)for(const scenario of CRZ_TRAINING_SCENARIOS){
   const state=crzStart(ready(size,scenario.id));
   const snapshot=JSON.stringify(state);
   const markers=crzObservedObjectives(state);
   expect(markers.map(m=>m.id)).toEqual(['crossroads','watchpoint','supplies']);
   expect(crzObservedObjectives(state)).toEqual(markers);
   expect(new Set(markers.map(m=>crzHexKey(m.position))).size).toBe(3);
   const zones=new Set([...state.map.deployment.attacker,
    ...state.map.deployment.defender].map(crzHexKey));
   for(const marker of markers){
    const tile=crzMapIndex(state.map).get(crzHexKey(marker.position));
    expect(tile).toBeDefined();
    expect(tile?.terrain).not.toBe('rock');
    expect(zones.has(crzHexKey(marker.position))).toBe(false);
    expect(marker.holder).toBeNull();
   }
   expect(JSON.stringify(state)).toBe(snapshot);
  }
 });
 it('atualiza somente observação por ocupação, sem regras próprias de vitória',()=>{
  const state=crzStart(ready());
  const first=crzObservedObjectives(state)[0]!;
  const moved={...state,stacks:state.stacks.map((s,i)=>
   i===0?{...s,position:first.position}:s)};
  const marks=crzObservedObjectives(moved);
  expect(marks[0]?.holder).toBe(state.stacks[0]?.side);
  expect(state.phase).toBe('active');
  expect(moved.winner).toBe(state.winner);
  expect(moved.events).toEqual(state.events);
 });
 it('relatório sobre replay válido preserva totais, seed e hash da cadeia',()=>{
  const start=crzReplayBegin(ready());
  const snapshot=JSON.stringify(start.replay);
  const report=crzAfterActionReport(start.replay);
  expect(report.reportVersion).toBe(CRZ_TRAINING_REPORT_VERSION);
  expect(report).toMatchObject({schemaVersion:1,phase:'active',
   rulesVersion:'CRZ-1.0',rulesetId:'CRZ-5E',
   seed:CRZ_TRAINING_DEFAULTS.seed,replayCommands:0,
   replayHeadHash:start.replay.headHash});
  for(const side of ['attacker','defender'] as const){
   const own=start.state.stacks.filter(s=>s.side===side);
   const total=own.reduce((n,s)=>n+s.initialCount,0);
   expect(report.sides[side].survivors).toBe(total);
   expect(report.sides[side].casualties).toBe(0);
   expect(report.sides[side].initialCreatures).toBe(total);
   expect(report.sides[side].inflictedDamage).toBe(0);
  }
  expect(report.objectives).toHaveLength(3);
  expect(JSON.parse(crzAfterActionSerialize(start.replay))).toEqual(report);
  expect(JSON.stringify(start.replay)).toBe(snapshot);
 });
 it('soma dano de magia e comandos por lado sem ler tabelas oficiais',()=>{
  let session=crzReplayBegin(ready());
  for(let i=0;i<12;i++){
   const unit=session.state.stacks.find(s=>s.id===session.state.activeStackId)!;
   if(unit.side==='attacker')break;
   session=crzReplayRecord(session,{type:'END_ACTIVATION',unitId:unit.id});
  }
  const actor=session.state.stacks.find(s=>s.id===session.state.activeStackId)!;
  expect(actor.side).toBe('attacker');
  session=crzReplayRecord(session,{type:'CAST',unitId:actor.id,
   spellId:'firebolt',targetId:'raider-d'});
  const after=crzAfterActionReport(session.replay);
  const spell=session.state.events.find(e=>e.type==='SPELL_DAMAGE');
  expect(spell).toBeDefined();
  if(spell?.type==='SPELL_DAMAGE'){
   expect(after.sides.attacker.inflictedDamage).toBe(spell.amount);
   expect(after.sides.defender.receivedDamage).toBe(spell.amount);
  }
  expect(after.sides.attacker.spellsCast).toBe(1);
  expect(after.replayCommands).toBe(session.replay.steps.length);
  expect(after.events).toBe(session.state.events.length);
  expect(crzVerifyReplay(session.replay).ok).toBe(true);
 });
 it('nega relatório gerado de arquivo adulterado, mesmo se JSON for válido',()=>{
  const start=crzReplayBegin(ready());
  const changed=JSON.parse(JSON.stringify(start.replay));
  changed.initial.seed='badfe11';
  expect(()=>crzAfterActionReport(changed)).toThrow();
  expect(()=>crzAfterActionSerialize(changed)).toThrow();
 });
 it('mostra marcos e tabela de estatísticas sem substituir replay/controles',()=>{
  render(<BattleCrzLab/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  const map=screen.getByRole('group',{name:'Mapa CRZ 11 por 9'});
  expect(map.querySelectorAll('[data-crz-objective]')).toHaveLength(3);
  const objectives=within(screen.getByRole('region',{name:'Marcos de observação CRZ'}));
  expect(objectives.getAllByRole('listitem')).toHaveLength(3);
  expect(objectives.getByText('Estrada de Cormyr')).toBeInTheDocument();
  const report=within(screen.getByRole('region',{name:'Relatório pós-batalha CRZ'}));
  expect(report.getAllByRole('row')).toHaveLength(3);
  expect(report.getByRole('button',{name:'Exportar relatório JSON'}))
   .toBeEnabled();
  expect(screen.getByRole('region',{name:'Replay CRZ'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Revisar desde o início'}));
  expect(objectives.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('button',{name:'Retomar treino'})).toBeInTheDocument();
 });
});
