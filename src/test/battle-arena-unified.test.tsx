import {describe,it,expect} from 'vitest';
import {render,screen,within,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';

const openPte=()=>{
 render(<BattleNarratorHub/>);
 fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
 fireEvent.click(screen.getByRole('button',{name:'Iniciar combate com forças-modelo'}));
 return screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
};

describe('Auditoria V4 · arena unificada e limpa do Narrador',()=>{
 it('PTE também inicia ampliado, com mapa, comando e últimas ações visíveis',()=>{
  const dialog=openPte();
  expect(within(dialog).getByRole('region',{name:'Campo de batalha PTE'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('group',{name:/Mapa (?:hexagonal|quadrado) com/}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('heading',{name:'Comando tático'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('heading',{name:'Últimas ações'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('button',{name:'Ver histórico completo'}))
   .toHaveAttribute('aria-expanded','false');
  expect(within(dialog).getByText('Mais opções')).toBeInTheDocument();
  expect(dialog).toHaveAttribute('aria-modal','true');
 });
 it('minimiza e reabre sem reiniciar o campo nem trocar o turno ativo',()=>{
  const dialog=openPte();
  const before=within(dialog).getByText(/Rodada 1 \/ 20/).textContent;
  fireEvent.click(within(dialog).getByRole('button',{name:'Sair da tela ampliada'}));
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Campo de batalha PTE'}))
   .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ampliar batalha'}));
  const restored=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(within(restored).getByText(/Rodada 1 \/ 20/).textContent).toBe(before);
 });
 it('encerra exercício PTE em modo ampliado e mantém relatório exclusivamente tático',()=>{
  const dialog=openPte();
  fireEvent.click(within(dialog).getByRole('button',{name:'Encerrar batalha manualmente'}));
  fireEvent.change(within(dialog).getByLabelText('Motivo do encerramento'),
   {target:{value:'Trégua negociada pelos representantes dos exércitos.'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Confirmar encerramento'}));
  const result=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(within(result).getByRole('heading',{name:'Resultado da simulação'}))
   .toBeInTheDocument();
  expect(within(result).getByText(/sem alterações nas fichas oficiais/i))
   .toBeInTheDocument();
 });
 it('a V3 continua exibindo o General e o mapa ampliado',()=>{
  render(<BattleV3Game initialOptions={{
   attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
   attackerCommander:'tillet',defenderCommander:'ashkar-raider',
   scenario:'plain-open',opponent:'human',
  }}/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(within(dialog).getByRole('region',{name:'Campo de batalha V3'}))
   .toBeInTheDocument();
  expect(within(dialog).getByText(/^General: /)).toBeInTheDocument();
  expect(within(dialog).getByText(/Mover: toque no (?:hexágono|quadrado) verde/))
   .toBeInTheDocument();
 });
 it('a CRZ mantém portrait, mapa e ações com as mesmas instruções',()=>{
  render(<BattleCrzLab/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(within(dialog).getByRole('region',{name:'Campo de batalha'}))
   .toBeInTheDocument();
  expect(within(dialog).getByText(/^General: /)).toBeInTheDocument();
  expect(within(dialog).getByText(/Mover: toque no quadrado verde/))
   .toBeInTheDocument();
 });
 it('mantém engines puros e portal acessível sem duplicação de estado',()=>{
  const pte=readFileSync('src/components/battle/BattleArena.tsx','utf8');
  const v3=readFileSync('src/components/battle/BattleV3Game.tsx','utf8');
  const crz=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  const css=readFileSync('src/components/battle/battle-arena-unified.css','utf8');
  expect([pte,v3,crz].every(s=>s.includes('battle-arena-unified.css')))
   .toBe(true);
  expect(pte).not.toMatch(/changeUnitState\(|resolveSurvivors\(|houseOperation\(/);
  expect(css).toContain('.battle-unified-shell .battle-arena-grid');
  expect(css).toContain('.crusade-v4-columns');
  expect(css).toContain('.crz-battle-columns');
  expect(readFileSync('src/components/battle/BattleExpandedView.tsx','utf8'))
   .toContain('summary,a[href]');
 });
});
