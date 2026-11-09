import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleGotGuide} from '@/components/battle/BattleGotGuide';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleActionPulse,BattleOutcomeSummary,
 pteActionText,crzActionText} from '@/components/battle/BattleUxFeedback';
import {suggestDndImpassReview} from '@/lib/battle/ux/dnd-impasse';
import type {CrzEvent} from '@/lib/crusade/battle-state';
import type {BattleEvent} from '@/lib/battle/domain/types';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});
const ended=(round:number):CrzEvent=>({
 seq:round,round,type:'ROUND_ENDED',note:'Fim da rodada'
});
const hit:CrzEvent={
 seq:7,round:2,type:'ATTACK_RESOLVED',unitId:'a',targetId:'b',
 mode:'rolled',attacks:2,hits:1,crits:0,rawDamage:12,
 appliedDamage:8,casualties:1,aliveBefore:10,aliveAfter:9,topHpAfter:4,
};

describe('Lote 4 — orientação sem alteração do motor',()=>{
 it('mantém as seis etapas GOT e destaca cerco/heróis sem ações',()=>{
  render(<BattleGotGuide phase="orders" hasSiege={false} hasHeroes={false}/>);
  const guide=screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'});
  expect(guide.querySelectorAll('li')).toHaveLength(6);
  expect(guide.querySelectorAll('li.is-without-actions')).toHaveLength(3);
  expect(guide.querySelector('[aria-current="step"]')).toHaveTextContent('Ordens');
  expect(within(guide).getByRole('button',{name:'Ver ordens'})).toBeEnabled();
 });
 it('não mostra atalho de ordens durante cerco e conserva fases sem pulo',()=>{
  render(<BattleGotGuide phase="siege" hasSiege hasHeroes={false}/>);
  expect(screen.queryByRole('button',{name:'Ver ordens'})).not.toBeInTheDocument();
  expect(screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'})
   .querySelector('[aria-current="step"]')).toHaveTextContent('Cerco');
  expect(screen.getByText('Sobre as fases')).toBeInTheDocument();
 });
 it('só recomenda revisão de impasse após três rodadas completas sem dano',()=>{
  expect(suggestDndImpassReview([ended(1),ended(2)])).toBe(false);
  expect(suggestDndImpassReview([ended(1),ended(2),ended(3)])).toBe(true);
  expect(suggestDndImpassReview([ended(1),hit,ended(2),ended(3)])).toBe(false);
  expect(suggestDndImpassReview([ended(1),ended(2),ended(3),ended(4)])).toBe(true);
  expect(suggestDndImpassReview([
   ended(1),ended(2),ended(3),{seq:5,round:3,type:'DND_STACK_ADDED',
    unitId:'a',side:'attacker',count:2},
  ])).toBe(false);
 });
});

describe('Lote 5 — eventos curtos e resultados auditáveis',()=>{
 it('traduz dano e baixas PTE, sem alterar o evento nem o replay',()=>{
  const e:BattleEvent={
   seq:1,round:1,actorId:'a',type:'DAMAGE',
   command:{type:'ATTACK',unitId:'a',targetId:'b'},
   delta:{damage:14,casualties:2},
  };
  const snapshot=JSON.stringify(e);
  expect(pteActionText(e,[{id:'a',name:'Arqueiros'}]))
   .toBe('Ataque · Arqueiros · 14 PV · 2 baixas');
  expect(JSON.stringify(e)).toBe(snapshot);
 });
 it('separa acertos, PV e baixas D&D em um texto curto',()=>{
  expect(crzActionText(hit,[{id:'a',name:'Goblins'}]))
   .toBe('Ataque · Goblins · 1/2 acertos · 8 PV · 1 baixas');
 });
 it('mantém fórmula completa recolhida e resumo do vencedor legível',()=>{
  render(<>
   <BattleActionPulse summary="Ataque · 14 PV" detail="1d20 + 5 versus CA 15"/>
   <BattleOutcomeSummary winner="Atacantes venceram" round={3}
    attacker={{label:'Atacantes',remaining:8,losses:2}}
    defender={{label:'Defensores',remaining:3,losses:7}}
    note="Sem alterar Casas"/>
  </>);
  const pulse=screen.getByRole('region',{name:'Última jogada'});
  expect(within(pulse).getByText('Ataque · 14 PV')).toBeInTheDocument();
  expect(within(pulse).getByText('Ver detalhes')).toBeInTheDocument();
  const outcome=screen.getByRole('region',{name:'Resumo do resultado'});
  expect(within(outcome).getByText('Atacantes venceram')).toBeInTheDocument();
  expect(within(outcome).getByText(/8 combatentes restantes/)).toBeInTheDocument();
 });
 it('GOT inicia rápido e sinaliza fases opcionais sem mudar o motor',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar agora'}));
  const guide=screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'});
  expect(guide.querySelectorAll('li')).toHaveLength(6);
  expect(guide.querySelectorAll('li.is-without-actions').length).toBeGreaterThan(0);
 });
 it('D&D inicia e responde a toque legal com feedback contextual',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar agora'}));
  const board=screen.getByRole('group',{name:/Mapa CRZ/});
  const move=within(board).getAllByRole('button',{name:/^Mover para /})[0];
  expect(move).toBeDefined();
  fireEvent.click(move!);
  expect(screen.getByRole('region',{name:'Última jogada'}))
   .toHaveTextContent(/avançou/);
 });
 it('PTE apresenta resultado compacto após encerramento e preserva replay',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  fireEvent.click(screen.getByRole('button',{name:'Iniciar combate com forças-modelo'}));
  fireEvent.click(screen.getByRole('button',{name:'Encerrar batalha manualmente'}));
  fireEvent.change(screen.getByLabelText('Motivo do encerramento'),
   {target:{value:'Encerramento narrativo para testar o resumo.'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar encerramento'}));
  expect(screen.getByRole('region',{name:'Resumo do resultado'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Rever turnos'})).toBeEnabled();
 });
});

describe('Lote 6 — segurança, toque e manutenção',()=>{
 it('preserva o bloqueio de jogadores e os três motores independentes',()=>{
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
  const got=readFileSync('src/lib/battle/got/engine.ts','utf8');
  const dnd=readFileSync('src/lib/crusade/dnd-mode.ts','utf8');
  expect(got).toContain('createWarBattle');
  expect(dnd).toContain('isDndV3');
 });
 it('assegura foco visível, toque 44px, responsividade e movimento reduzido',()=>{
  const css=readFileSync('src/components/battle/battle-ux-feedback.css','utf8');
  expect(css).toContain('min-height:44px');
  expect(css).toContain(':focus-visible');
  expect(css).toContain('@media(max-width:440px)');
  expect(css).toContain('prefers-reduced-motion:reduce');
  const ui=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(ui).toContain('suggestDndImpassReview(frame.events)');
  expect(ui).toContain("type:'DND_END_BATTLE'");
 });
});
