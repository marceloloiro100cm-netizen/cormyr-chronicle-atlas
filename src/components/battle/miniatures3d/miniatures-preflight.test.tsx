import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MiniaturePreparationSummary} from './MiniaturePreparationSummary';
afterEach(cleanup);
describe('P1: preparação e combate explicitamente separados',()=>{
 it('preparação do Narrador é informativa e não cria comandos de jogo',()=>{
  render(<MiniaturePreparationSummary mode="GOT" width={11} height={9}
   attackers={4} defenders={4} climate="Céu limpo" />);
  expect(screen.getByText(/11 × 9 quadrados/)).toBeInTheDocument();
  expect(screen.getByText(/posições iniciais automaticamente/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Atacar|Mover|Avançar turno/})).toBeNull();
 });
 it('avisa sobre posicionamento manual já configurado sem alterá-lo',()=>{
  render(<MiniaturePreparationSummary mode="GOT" width={15} height={11}
   attackers={3} defenders={3} manualDeployment/>);
  expect(screen.getByText(/Posições iniciais ajustadas/)).toBeInTheDocument();
 });
});
