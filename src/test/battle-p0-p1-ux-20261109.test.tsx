import {describe,it,expect,afterEach,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {BattleGotPhaseDock,gotNextDecision} from '@/components/battle/BattleGotPhaseDock';
import {summarizeDndEncounter} from '@/lib/battle/ux/dnd-encounter-summary';
import {BattleSaveScope} from '@/components/battle/BattleSaveScope';
import {readFileSync} from 'node:fs';
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('P1: fases GOT — apenas próximo comando legal, sem ignorar regras',()=>{
 it('seleciona o painel de cada fase, inclusive fases vazias',()=>{
  expect(gotNextDecision('siege',false,false).target).toBe('got-battle-orders');
  expect(gotNextDecision('siege',false,false).hint).toMatch(/Sem armas/);
  expect(gotNextDecision('heroes-first',true,false).target).toBe('got-personal-actions');
  expect(gotNextDecision('heroes-second',true,false).hint).toMatch(/Sem heróis/);
  expect(gotNextDecision('orders',false,false).button).toBe('Dar ordem');
  expect(gotNextDecision('finished',false,false).target).toBe('got-after-action');
 });
 it('exibe uma decisão por fase e leva ao painel, sem resolver regras automaticamente',()=>{
  const destination=document.createElement('section');
  destination.id='got-battle-orders';
  const control=document.createElement('button');
  control.textContent='Ordenar';
  destination.appendChild(control);
  document.body.appendChild(destination);
  const scroll=vi.fn();
  destination.scrollIntoView=scroll;
  render(<BattleGotPhaseDock phase="orders" hasSiege={false} hasHeroes={false}/>);
  expect(screen.getByRole('region',{name:'Próxima decisão'})).toHaveTextContent('Ordens');
  fireEvent.click(screen.getByRole('button',{name:'Dar ordem'}));
  expect(scroll).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(control);
  destination.remove();
 });
});

describe('P1: montador D&D informa forças sem inventar equilíbrio',()=>{
 const catalog=[{id:'inf',hp:10,ac:12},{id:'dragon',hp:40,ac:18}];
 it('pondera PV e CA por quantidade, não por número de pilhas',()=>{
  const s=summarizeDndEncounter([
   {side:'attacker',templateId:'inf',count:5},
   {side:'attacker',templateId:'dragon',count:1},
   {side:'defender',templateId:'inf',count:3},
  ],catalog);
  expect(s.attacker).toMatchObject({stacks:2,creatures:6,totalHp:90,meanAc:13});
  expect(s.defender).toMatchObject({stacks:1,creatures:3,totalHp:30,meanAc:12});
  expect(s.comparison).toContain('Atacantes');
  expect(s.comparison).toContain('não prevê');
 });
 it('não atribui PV fictícios a criaturas sem ficha válida',()=>{
  const s=summarizeDndEncounter([
   {side:'attacker',templateId:'unknown',count:2},
   {side:'defender',templateId:'inf',count:3},
  ],catalog);
  expect(s.attacker).toMatchObject({totalHp:null,meanAc:null,unknown:2});
  expect(s.comparison).toContain('iniciativa');
 });
 it('não aceita efetivo inválido como criatura válida',()=>{
  const s=summarizeDndEncounter([
   {side:'attacker',templateId:'inf',count:-20},
   {side:'defender',templateId:'inf',count:2},
  ],catalog);
  expect(s.attacker.creatures).toBe(0);
 });
});

describe('P1: salvamentos transparentes e sem troca de motores',()=>{
 it('apresenta escopo real em todos os modos sem afirmar que já foi salvo',()=>{
  const view=render(<BattleSaveScope system="got"/>);
  expect(screen.getByText('Este navegador')).toBeInTheDocument();
  expect(screen.getByText(/Salve|Use Salvar batalha/)).toBeInTheDocument();
  view.rerender(<BattleSaveScope system="adapted"/>);
  expect(screen.getByText('Conta do Narrador')).toBeInTheDocument();
  view.rerender(<BattleSaveScope system="dnd"/>);
  expect(screen.getByText('Conta do Narrador · privado')).toBeInTheDocument();
  view.rerender(<BattleSaveScope system="v3"/>);
  expect(screen.getByText('Arquivo local')).toBeInTheDocument();
 });
 it('mantém botões de saída, desfazer, salvar e a barreira de jogadores',()=>{
  const arena=readFileSync('src/components/battle/BattleArena.tsx','utf8');
  expect(arena).toContain('aria-label="Desfazer última ação"');
  expect(arena).toContain('onClick={undo}>Desfazer');
  expect(arena).toContain('onClick={()=>void saveCurrent()}>Salvar batalha');
  const got=readFileSync('src/components/battle/BattleGotGame.tsx','utf8');
  expect(got).toContain('<BattleGotPhaseDock phase={battle.phase}');
  expect(got).toContain('onClick={saveLocalBattle}>Salvar batalha');
  const dnd=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(dnd).toContain('summarizeDndEncounter(dndRoster,dndChoices)');
  expect(readFileSync('src/lib/battle/feature-flag.ts','utf8'))
   .toContain('BATTLE_PLAYERS_ENABLED=false');
 });
});
