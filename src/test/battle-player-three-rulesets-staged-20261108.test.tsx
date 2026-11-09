import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';
import {BATTLE_RULESET_OPTIONS} from '@/lib/battle/ruleset-modes';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {GOT_LAB_SAVE_KEY} from '@/lib/battle/got/lab-save';
import {PLAYER_DND_MODELS} from '@/lib/crusade/dnd-player-models';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});
describe('Três simuladores do jogador preparados, mas ainda NÃO liberados',()=>{
 it('mantém a rota de jogadores fechada enquanto mostra três sistemas no seletor futuro',()=>{
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
  expect(BATTLE_RULESET_OPTIONS.map(mode=>mode.id))
   .toEqual(['got','adapted','dnd']);
  const route=readFileSync('src/routes/_authenticated/jogadores.tsx','utf8');
  const menu=readFileSync('src/components/battle/BattleV3PlayerEntry.tsx','utf8');
  expect(route).toContain("tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED&&<BattleV3PlayerEntry");
  expect(menu).toContain('BattleRulesetSelector');
  expect(menu).toContain("rulesetMode==='got'?'got-training'");
  expect(menu).toContain("rulesetMode==='dnd'?'dnd-training'");
  expect(menu).toContain('<BattleV3Game onBack=');
  expect(menu).toContain('<PlayerGotGame playerSandbox');
  expect(menu).toContain('<PlayerDndGame mode="dnd" playerSandbox');
 });
 it('GOT de jogador não oferece tropas oficiais e mantém salvamento local segregado',()=>{
  window.localStorage.setItem(GOT_LAB_SAVE_KEY,'conteudo-privado-do-narrador');
  render(<BattleGotGame playerSandbox onBack={vi.fn()}/>);
  expect(screen.getByText(/Modo de treino do jogador/)).toBeInTheDocument();
  expect(screen.queryByText('Usar unidades oficiais das Casas (somente leitura)'))
   .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Iniciar simulação pelo livro'}));
  expect(screen.getByRole('heading',{name:'Escaramuça de treinamento'}))
   .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Salvar simulação neste navegador'}));
  expect(window.localStorage.getItem(GOT_LAB_SAVE_KEY))
   .toBe('conteudo-privado-do-narrador');
  expect(window.localStorage.getItem('cormyr-got-player-training-v1'))
   .not.toBeNull();
 });
 it('D&D do jogador só mostra criaturas fictícias e não monta controles do Narrador',()=>{
  expect(PLAYER_DND_MODELS).toHaveLength(5);
  expect(PLAYER_DND_MODELS.every(item=>
   item.creature.provenance.origin==='manual'&&item.creature.tags.includes('player-model')))
   .toBe(true);
  render(<BattleCrzLab mode="dnd" playerSandbox onBack={vi.fn()}/>);
  expect(screen.getByRole('region',{name:'D&D · simulador local do jogador'}))
   .toBeInTheDocument();
  expect(screen.getByText(/O bestiário privado do Narrador não é consultado/))
   .toBeInTheDocument();
  expect(screen.getByRole('option',{name:/Draco de treino/}))
   .toBeInTheDocument();
  expect(screen.queryByLabelText('Estado do bestiário privado D&D'))
   .not.toBeInTheDocument();
  expect(screen.queryByText('Batalhas privadas do Narrador')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Iniciar batalha D&D/}));
  expect(screen.getByRole('region',{name:'Arena e comandos CRZ'}))
   .toBeInTheDocument();
  expect(screen.queryByText('Salvar batalha privada')).not.toBeInTheDocument();
  expect(screen.queryByText('Gerenciar criaturas, reforços e resultado'))
   .not.toBeInTheDocument();
  expect(screen.queryByText('Importar replay')).not.toBeInTheDocument();
 });
});
