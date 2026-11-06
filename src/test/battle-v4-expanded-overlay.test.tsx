import {describe,it,expect} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};

describe('V4 · batalha ampliada automaticamente sobre o site',()=>{
 it('abre V3 em diálogo de tela inteira, sem botão Ajustes, e mantém a batalha ao minimizar',()=>{
  render(<div data-testid="site-shell">
   <nav aria-label="Menu do site">Menu do Narrador</nav>
   <BattleV3Game initialOptions={options}/>
  </div>);
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(dialog).toHaveAttribute('aria-modal','true');
  expect(dialog).toHaveClass('battle-expanded-dialog');
  expect(document.body.style.overflow).toBe('hidden');
  expect(within(dialog).getByRole('region',{name:'Arena V4 unificada'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('region',{name:'Ordem de combate V3'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('region',{name:'Campo de batalha V3'}))
   .toBeInTheDocument();
  expect(within(dialog).queryByRole('button',{name:'Ajustes',exact:true}))
   .not.toBeInTheDocument();
  const map=within(dialog).getByRole('group',{name:/Mapa hexagonal/});
  const destinations=within(map).getAllByRole('button',{name:/movimento permitido/});
  fireEvent.click(destinations[0]!);
  expect(within(dialog).getByText('Ordem aplicada com sucesso.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button',{name:'Sair da tela ampliada'}));
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(screen.getByRole('region',{name:'Arena V4 unificada'})).toBeInTheDocument();
  expect(screen.getByText('Ordem aplicada com sucesso.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ampliar batalha'}));
  expect(screen.getByRole('dialog',{name:'Batalha em tela ampliada'}))
   .toBeInTheDocument();
  expect(screen.getByText('Ordem aplicada com sucesso.')).toBeInTheDocument();
  fireEvent.keyDown(document,{key:'Escape',code:'Escape'});
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
 });
 it('abre CRZ automaticamente e preserva replay e controles em tela ampliada',()=>{
  render(<BattleCrzLab/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  expect(within(dialog).getByRole('region',{name:'Arena e comandos CRZ'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('region',{name:'Painel do General CRZ'}))
   .toBeInTheDocument();
  expect(within(dialog).getByRole('region',{name:'Ordem de combate'}))
   .toBeInTheDocument();
  expect(within(dialog).queryByRole('button',{name:'Ajustes',exact:true}))
   .not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button',{name:'Replay'}));
  expect(within(dialog).getByRole('region',{name:'Replay CRZ'}))
   .toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button',{name:'Sair da tela ampliada'}));
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Replay CRZ'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ampliar batalha'}));
  expect(screen.getByRole('dialog',{name:'Batalha em tela ampliada'}))
   .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Novo treino'}));
  expect(screen.queryByRole('dialog',{name:'Batalha em tela ampliada'}))
   .not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}))
   .toBeInTheDocument();
 });
});
