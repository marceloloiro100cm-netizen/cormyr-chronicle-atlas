import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {V3_COMMANDERS} from '@/lib/battle/v3/commanders';
import {MODEL_HOUSES} from '@/lib/battle/v3/model-houses';
import {createV3Game,v3CanUseCommander,v3UseCommander,v3LegalSkills,v3UseUnitSkill,
 v3PlayCommand} from '@/lib/battle/v3/engine';
import {getLegalActions} from '@/lib/battle/domain/turns';
import type {BattleState} from '@/lib/battle/domain/types';

const opts={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Crusada V3 — exércitos modelos, habilidades e separação da campanha',()=>{
 it('mantém 20 arquétipos e os dez poderes originais, 6 casas modelo e forma duas pilhas válidas de até 5',()=>{
  expect(V3_COMMANDERS).toHaveLength(20);
  expect(new Set(V3_COMMANDERS.map(c=>c.id)).size).toBe(20);
  expect(new Set(V3_COMMANDERS.map(c=>c.power)).size).toBe(10);
  expect(MODEL_HOUSES.length).toBeGreaterThanOrEqual(6);
  for(const home of MODEL_HOUSES){
   expect(home.name).toMatch(/Modelo/);
   expect(home.units.length).toBeGreaterThan(0);
   expect(home.units.length).toBeLessThanOrEqual(5);
  }
  const game=createV3Game(opts);
  expect(game.mode).toBe('PTE-3.0-SANDBOX');
  expect(game.battle.rulesVersion).toBe('PTE-2.0');
  expect(game.battle.phase).toBe('active');
  expect(game.battle.stacks).toHaveLength(8);
  expect(new Set(game.battle.stacks.map(s=>s.id)).size).toBe(8);
  expect(game.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  expect(game.battle.stacks.filter(s=>s.side==='attacker').length).toBe(4);
  expect(game.battle.stacks.filter(s=>s.side==='defender').length).toBe(4);
 });
 it('registra poder de comandante uma vez e nunca altera o snapshot de origem',()=>{
  const game=createV3Game(opts);
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const c=V3_COMMANDERS.find(c=>c.id===game.commanders[actor.side])!;
  const target=game.battle.stacks.find(s=>s.side===(c.powerTarget==='ally'?actor.side:actor.side==='attacker'?'defender':'attacker'))!;
  expect(v3CanUseCommander(game)).toBe(true);
  const result=v3UseCommander(game,target.id);
  expect(result.usedPowers[actor.side]).toBe(true);
  expect(game.usedPowers[actor.side]).toBe(false);
  expect(game.battle).not.toBe(result.battle);
  expect(result.log.at(-1)?.label).toContain(c.powerName);
  expect(()=>v3UseCommander(result,target.id)).toThrow();
 });
 it('utiliza as mesmas regras legais de movimento da arena já homologada',()=>{
  const game=createV3Game(opts);
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const choices=getLegalActions(game.battle);
  const move=choices.find(c=>c.type==='MOVE');
  expect(move).toBeTruthy();
  if(!move||move.type!=='MOVE')throw new Error('Não há deslocamento para teste.');
  const next=v3PlayCommand(game,move);
  const changed=next.battle.stacks.find(s=>s.id===actor.id)!;
  expect(changed.position).toEqual(move.to);
  expect(actor.position).not.toEqual(move.to);
  expect(changed.movedThisActivation).toBe(true);
  expect(()=>v3PlayCommand(next,move)).toThrow();
 });
 it('forma muralha de escudos como habilidade militar, com guarda lateral',()=>{
  const game=createV3Game({...opts,attackerCommander:'purple-dragon',defenderCommander:'purple-dragon'});
  const unit=game.battle.stacks.find(s=>s.primaryTypeId==='infantry')!;
  const rearranged={...game,battle:{...game.battle,activeUnitId:unit.id,
   controls:{attacker:'human' as const,defender:'human' as const}} as BattleState};
  expect(v3LegalSkills(rearranged)).toContain('SHIELD_WALL');
  const buffed=v3UseUnitSkill(rearranged,'SHIELD_WALL');
  expect(buffed.log.at(-1)?.label).toContain('Muralha');
  expect(buffed.battle.stacks.find(s=>s.id===unit.id)?.defenseGuard).toBe(true);
 });
 it('oferece apenas "Batalhar" ao jogador; criar batalha permanece Narrador',()=>{
  render(<BattleV3Game/>);
  expect(screen.getByRole('heading',{name:'Batalhar'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Batalhar'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Criar batalha'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('Casa modelo Aliado')).toBeInTheDocument();
  expect(screen.getByLabelText('Comandante Aliado')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Controle do adversário'),{target:{value:'human'}});
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  expect(screen.getByRole('heading',{name:/Exército de Hillmarch contra Hoste da Fênix/})).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Mapa hexagonal/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Fim de turno'})).toBeInTheDocument();
 });
 it('exposição de jogador tem escopo autenticado e não importa operações de escrita oficiais',()=>{
  const src=(path:string)=>readFileSync(resolve(path),'utf8');
  const route=src('src/routes/_authenticated/jogadores.tsx');
  const game=src('src/components/battle/BattleV3Game.tsx');
  const engine=src('src/lib/battle/v3/engine.ts');
  expect(route).toContain("tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED&&<BattleV3PlayerEntry");
  expect(route).not.toContain("tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&<BattleNarratorHub/>");
  expect(route).toContain('data.admin?<div');
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub/>");
  expect(game).not.toMatch(/useServerFn|supabase|houseOperation\(|changeUnitState\(/);
  expect(engine).not.toMatch(/supabase|houseOperation\(|changeUnitState\(|resolveSurvivors\(/);
 });
});
