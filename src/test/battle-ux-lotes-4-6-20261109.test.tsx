import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleGotGuide} from '@/components/battle/BattleGotGuide';
import {BattleActionFeedback} from '@/components/battle/BattleActionFeedback';
import {BattleOutcomeSummary} from '@/components/battle/BattleOutcomeSummary';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {dndNeedsImpasseReview} from '@/lib/battle/ux/dnd-impasse';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});

describe('Lote 4 — fases contextualizadas e tratamento não destrutivo de impasse',()=>{
 it('não pula fases GOT e explica quando não há cerco ou heróis',()=>{
  render(<BattleGotGuide phase="siege" hasSiege={false} hasHeroes={false}/>);
  const guide=screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'});
  expect(guide.querySelectorAll('li')).toHaveLength(6);
  expect(guide.querySelector('[aria-current="step"]')).toHaveTextContent('Cerco');
  expect(within(guide).getByText(/Sem máquinas de cerco/)).toBeInTheDocument();
  expect(within(guide).getAllByText('Sem tropas especiais')).toHaveLength(3);
 });
 it('mostra comando de fases só quando relevante',()=>{
  const view=render(<BattleGotGuide phase="heroes-first" hasHeroes={false}/>);
  expect(screen.getByText(/Sem heróis em campo/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Ir ao painel de comandos'})).not.toBeInTheDocument();
  view.rerender(<BattleGotGuide phase="orders" hasHeroes={false}/>);
  expect(screen.getByRole('button',{name:'Ir ao painel de comandos'})).toBeEnabled();
 });
 it('alerta após três rodadas sem progresso sem impor empate',()=>{
  expect(dndNeedsImpasseReview({phase:'active',stagnantRounds:2})).toBe(false);
  expect(dndNeedsImpasseReview({phase:'active',stagnantRounds:3})).toBe(true);
  expect(dndNeedsImpasseReview({phase:'active',stagnantRounds:4})).toBe(true);
  expect(dndNeedsImpasseReview({phase:'completed',stagnantRounds:12})).toBe(false);
  const src=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(src).toContain('dndNeedsImpasseReview(frame)');
  expect(src).toContain('Sem resultado automático');
  expect(src).toContain("type:'DND_END_BATTLE'");
 });
});

describe('Lote 5 — resposta curta e resultado auditável',()=>{
 it('mostra última jogada com PV e baixas sem esconder o cálculo',()=>{
  render(<BattleActionFeedback round={4} label="Ataque" damage={14}
   casualties={2} detail="Acerto após Defesa e cobertura"/>);
  const region=screen.getByRole('region',{name:'Última jogada'});
  expect(region).toHaveAttribute('aria-live','polite');
  expect(within(region).getByText('R4 · Ataque')).toBeInTheDocument();
  expect(within(region).getByText('14 PV · 2 baixas')).toBeInTheDocument();
  fireEvent.click(within(region).getByText('Detalhes'));
  expect(within(region).getByText(/Defesa e cobertura/)).toBeInTheDocument();
 });
 it('resume o vencedor, a rodada e perdas por lado',()=>{
  render(<BattleOutcomeSummary title="Vitória aliada" round={7} reason="Retirada"
   losses={[{label:'Atacantes',count:2},{label:'Defensores',count:8}]}/>);
  const region=screen.getByRole('region',{name:'Resultado resumido'});
  expect(within(region).getByRole('heading',{name:'Vitória aliada'})).toBeInTheDocument();
  expect(within(region).getByText('Rodada 7 · Retirada')).toBeInTheDocument();
  expect(within(region).getByText('8 baixas')).toBeInTheDocument();
 });
 it('mantém motores, replay e campanha sem mutação dos dados oficiais',()=>{
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
  for(const name of ['BattleArena','BattleGotGame','BattleV3Game','BattleCrzLab']){
   const source=readFileSync('src/components/battle/'+name+'.tsx','utf8');
   expect(source).toContain('BattleActionFeedback');
   expect(source).toContain('BattleOutcomeSummary');
  }
  const component=readFileSync('src/components/battle/BattleActionFeedback.tsx','utf8');
  expect(component).not.toMatch(/supabase|update\(|insert\(|resolveSurvivors\(/);
 });
});

describe('Lote 6 — interatividade de mapa e ergonomia',()=>{
 it('mantém mapa clicável e feedback após movimento legal',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  fireEvent.click(screen.getByRole('button',{name:'Iniciar combate com forças-modelo'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  const map=within(dialog).getByRole('region',{name:'Campo de batalha PTE'});
  const destinations=within(map).getAllByRole('button',{name:/movimento permitido/});
  fireEvent.click(destinations[0]!);
  const feedback=within(dialog).getByRole('region',{name:'Última jogada'});
  expect(feedback).toHaveTextContent('Movimento');
  expect(within(dialog).getByRole('region',{name:'Registro da batalha'}))
   .toHaveTextContent('Movimento');
 });
 it('oferece toque amplo, foco por teclado e animação reduzida',()=>{
  const css=readFileSync('src/components/battle/battle-ux-lots-4-6.css','utf8');
  expect(css).toContain('@media(pointer:coarse)');
  expect(css).toContain('min-height:44px');
  expect(css).toContain('focus-visible');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
 });
});
