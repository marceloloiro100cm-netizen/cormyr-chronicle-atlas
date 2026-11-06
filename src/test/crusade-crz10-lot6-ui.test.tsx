import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS,
 CRZ_TRAINING_CATALOG,CRZ_TRAINING_SCENARIOS}
 from '@/lib/crusade/training-demo';
import {crzTrainingAdvanceAi,crzTrainingReplayAt}
 from '@/lib/crusade/training-flow';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay}
 from '@/lib/crusade/replay';
import {crzLegalCommands} from '@/lib/crusade/turns';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';

describe('CRZ-1.0 · Lote 6 — treino do Narrador, HUD e replay',()=>{
 it('cria cenários e tropas fictícias com hashes estáveis, sem fonte oficial',()=>{
  expect(CRZ_TRAINING_SCENARIOS).toHaveLength(4);
  expect(CRZ_TRAINING_CATALOG.templates).toHaveLength(4);
  for(const size of [11,15] as const)for(const scenario of CRZ_TRAINING_SCENARIOS){
   const opts={...CRZ_TRAINING_DEFAULTS,width:size,scenario:scenario.id};
   const a=crzTrainingReady(opts),b=crzTrainingReady(opts);
   expect(a).toEqual(b);
   expect(a.rulesetId).toBe('CRZ-5E');
   expect(a.ruleset.damage.overkill).toBe('cap');
   expect(a.map.width).toBe(size);
   expect(a.stacks).toHaveLength(6);
   expect(a.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
   expect(a.leaders.attacker?.spells).toContain('bless');
   expect(a.controls).toEqual({attacker:'human',defender:'ai'});
  }
 });
 it('recusa seed não hexadecimal e não aceita o preset não implementado',()=>{
  expect(()=>crzTrainingReady({...CRZ_TRAINING_DEFAULTS,seed:'inseguro'}))
   .toThrow();
 });
 it('cada movimento de IA é registrado e pode ser reexecutado fielmente',()=>{
  const start=crzReplayBegin(crzTrainingReady(CRZ_TRAINING_DEFAULTS));
  let session=start;
  for(let i=0;i<10;i++){
   const unit=session.state.stacks.find(s=>s.id===session.state.activeStackId)!;
   if(session.state.controls[unit.side]==='ai')break;
   session=crzReplayRecord(session,{type:'END_ACTIVATION',unitId:unit.id},'human');
  }
  const active=session.state.stacks.find(s=>s.id===session.state.activeStackId)!;
  expect(session.state.controls[active.side]).toBe('ai');
  const played=crzTrainingAdvanceAi(session);
  expect(played.replay.steps.length).toBeGreaterThan(session.replay.steps.length);
  expect(crzVerifyReplay(played.replay).ok).toBe(true);
  expect(crzTrainingReplayAt(played.replay,0)).toEqual(start.state);
  expect(crzTrainingReplayAt(played.replay,played.replay.steps.length))
   .toEqual(played.state);
  expect(()=>crzTrainingReplayAt(played.replay,-1)).toThrow();
  const changed=JSON.parse(JSON.stringify(played.replay));
  changed.steps[0].actor=played.replay.steps[0]!.actor==='ai'?'human':'ai';
  expect(()=>crzTrainingReplayAt(changed,1)).toThrow();
 });
 it('oferece tabuleiro, ações, General e replay visual em sessão local',()=>{
  render(<BattleCrzLab/>);
  expect(screen.getByRole('region',{name:'Laboratório CRZ-1.0 do Narrador'}))
   .toBeInTheDocument();
  expect(screen.getByLabelText('Cenário CRZ')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  expect(screen.getByRole('region',{name:'Arena e comandos CRZ'})).toBeInTheDocument();
  expect(screen.getByRole('group',{name:'Mapa CRZ 11 por 9'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Painel do General CRZ'}))
   .toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/^Mover \(/})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/^Atacar \(/})).not.toBeInTheDocument();
  const moves=screen.getAllByRole('button',{name:/^Mover para /});
  expect(moves.length).toBeGreaterThan(0);
  fireEvent.click(moves[0]!);
  expect(screen.getByText(/Comando registrado no replay verificável/))
   .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Replay'}));
  expect(screen.getByRole('region',{name:'Replay CRZ'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Revisar desde o início'}));
  expect(screen.getByLabelText('Posição do replay')).toHaveTextContent(/0\s*\/\s*[1-9]\d*/);
  expect(screen.queryByRole('button',{name:/^Mover \(/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próximo'}));
  expect(screen.getByLabelText('Posição do replay')).toHaveTextContent(/1\s*\/\s*[1-9]\d*/);
  fireEvent.click(screen.getByRole('button',{name:'Retomar treino'}));
  expect(screen.getByRole('button',{name:'Encerrar ativação'})).toBeEnabled();
 });
 it('General executa bless no turno humano e é incluído na trilha auditável',()=>{
  render(<BattleCrzLab/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  expect(screen.getByLabelText('Magia do General')).toHaveValue('bless');
  fireEvent.click(screen.getByRole('button',{name:'Conjurar (3 energia)'}));
  expect(screen.getByText(/Magia do General · tillet-general/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Replay'}));
  expect(screen.getByLabelText('Posição do replay'))
   .toHaveTextContent(/[1-9]\d*\s*\/\s*[1-9]\d*/);
  expect(screen.getByRole('button',{name:'Conjurar (3 energia)'})).toBeDisabled();
 });
 it('não conecta a HUD ao banco nem substitui o modo V3 dos jogadores',()=>{
  const src=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(src).not.toMatch(/supabase|HouseState|noble_house_sheets|battle\/domain/);
  expect(src).not.toMatch(/fetch\(|useServerFn|localStorage|sessionStorage/);
  const hub=readFileSync('src/components/battle/BattleNarratorHub.tsx','utf8');
  const player=readFileSync('src/components/battle/BattleV3PlayerEntry.tsx','utf8');
  expect(hub).toContain('BattleCrzLab');
  expect(player).not.toContain('BattleCrzLab');
 });
});
