import {describe,it,expect} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';

const start=()=>{
 render(<BattleCrzLab/>);
 fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
 return screen.getByRole('region',{name:'Arena e comandos CRZ'});
};

describe('CRZ · V4: arena tática no padrão aprovado',()=>{
 it('encaixa General, retrato vazio, ordem, mapa e últimas ações na mesma arena',()=>{
  const arena=start();
  expect(within(arena).getByRole('region',{name:'Painel do General CRZ'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('img',{name:'Espaço reservado para retrato do General'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('region',{name:'Ordem de combate'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('group',{name:'Mapa CRZ 11 por 9'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('region',{name:'Últimas ações'}))
   .toBeInTheDocument();
  expect(within(arena).getByText('Como jogar')).toBeInTheDocument();
  expect(within(arena).queryByRole('button',{name:/^Mover \(/})).not.toBeInTheDocument();
  expect(within(arena).queryByRole('button',{name:/^Atacar \(/})).not.toBeInTheDocument();
 });
 it('ao passar mouse ou foco numa unidade da ordem aparece anel sobre ela no mapa',()=>{
  start();
  const turnBar=screen.getByRole('region',{name:'Ordem de combate'});
  const units=within(turnBar).getAllByRole('button');
  expect(units.length).toBeGreaterThanOrEqual(6);
  const map=screen.getByRole('group',{name:'Mapa CRZ 11 por 9'});
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(0);
  fireEvent.mouseEnter(units[1]!);
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(1);
  fireEvent.mouseLeave(units[1]!);
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(0);
  fireEvent.focus(units[1]!);
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(1);
  fireEvent.blur(units[1]!);
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(0);
 });
 it('seleção verde, destino de movimento por clique e histórico auditado',()=>{
  start();
  const map=screen.getByRole('group',{name:'Mapa CRZ 11 por 9'});
  const bar=screen.getByRole('region',{name:'Ordem de combate'});
  const current=within(bar).getAllByRole('button')[0]!;
  expect(current).toHaveAttribute('aria-current','step');
  expect(current).toHaveAttribute('aria-pressed','true');
  expect(map.querySelectorAll('[data-crz-selected-ring]')).toHaveLength(1);
  const destinations=within(map).getAllByRole('button',{name:/^Mover para /});
  expect(destinations.length).toBeGreaterThan(0);
  fireEvent.click(destinations[0]!);
  expect(screen.getByText(/Comando registrado no replay verificável/))
   .toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'Últimas ações'}))
   .getAllByText(/Movimento/).length).toBeGreaterThan(0);
 });
 it('seleção de unidade fora do turno só inspeciona, não falsifica movimentos',()=>{
  start();
  const map=screen.getByRole('group',{name:'Mapa CRZ 11 por 9'});
  const bar=screen.getByRole('region',{name:'Ordem de combate'});
  const enemy=within(bar).getAllByRole('button').find(x=>
   x.getAttribute('aria-label')?.includes('Ashkar'))!;
  expect(enemy).toBeDefined();
  fireEvent.click(enemy);
  expect(enemy).toHaveAttribute('aria-pressed','true');
  expect(within(map).queryAllByRole('button',{name:/^Mover para /})).toHaveLength(0);
  expect(map.querySelectorAll('[data-crz-selected-ring]')).toHaveLength(1);
 });
 it('preserva espera, defesa, habilidades e General sem duplicar botões de movimento',()=>{
  start();
  const general=within(screen.getByRole('region',{name:'Painel do General CRZ'}));
  expect(general.getByText('General')).toBeInTheDocument();
  expect(general.getByLabelText('Magia do General')).toHaveValue('bless');
  expect(general.getByRole('button',{name:'Encerrar ativação'})).toBeEnabled();
  expect(general.getByRole('button',{name:'Defender'})).toBeEnabled();
  expect(general.getByRole('button',{name:'Esperar'})).toBeEnabled();
  fireEvent.click(general.getByRole('button',{name:'Conjurar (3 energia)'}));
  expect(within(screen.getByRole('region',{name:'Últimas ações'}))
   .getByText(/Magia do General · tillet-general/)).toBeInTheDocument();
 });
 it('histórico, objetivos, relatório e replay são gavetas da mesma arena',()=>{
  start();
  const bar=screen.getByRole('group',{name:'Informações da batalha'});
  fireEvent.click(within(bar).getByRole('button',{name:'Marcos'}));
  expect(screen.getByRole('region',{name:'Marcos de observação CRZ'}))
   .toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button',{name:'Relatório'}));
  expect(screen.getByRole('region',{name:'Relatório pós-batalha CRZ'}))
   .toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button',{name:'Replay'}));
  expect(screen.getByRole('region',{name:'Replay CRZ'}))
   .toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button',{name:'Ações'}));
  expect(screen.getByRole('region',{name:'Últimas ações'}))
   .toBeInTheDocument();
 });
 it('estilo V4 usa textos legíveis, responsividade e mantém simulação isolada',()=>{
  const css=readFileSync('src/components/battle/crz-lab.css','utf8');
  const jsx=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(css).toContain('.crz-battle-stage');
  expect(css).toContain('.crz-battle-columns');
  expect(css).toContain('@media(max-width:650px)');
  expect(jsx).toContain('crzReplayRecord(session,command');
  expect(jsx).toContain('crzLegalCommands(frame)');
  expect(jsx).not.toMatch(/supabase|HouseState|useServerFn|localStorage/);
 });
});
