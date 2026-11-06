import {describe,it,expect} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {BATTLE_CRZ_TRAINING_UI_ENABLED} from '@/lib/battle/feature-flag';

describe('CRZ Lote 7 — acessibilidade e gating de laboratório',()=>{
 it('piloto é habilitado por padrão mas mantém kill-switch para o build',()=>{
  expect(BATTLE_CRZ_TRAINING_UI_ENABLED).toBe(true);
  const hub=readFileSync('src/components/battle/BattleNarratorHub.tsx','utf8');
  expect(hub).toContain('BATTLE_CRZ_TRAINING_UI_ENABLED&&<Button');
  expect(hub).toContain("view==='crz'&&BATTLE_CRZ_TRAINING_UI_ENABLED");
  const player=readFileSync('src/components/battle/BattleV3PlayerEntry.tsx','utf8');
  expect(player).not.toContain('BattleCrzLab');
 });
 it('suporta zoom 100/150/200, restauração e contraste reversível',()=>{
  render(<BattleCrzLab/>);
  const contrast=screen.getByRole('button',{name:'Alto contraste CRZ'});
  expect(contrast).toHaveAttribute('aria-pressed','false');
  fireEvent.click(contrast);
  expect(contrast).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('region',{name:'Laboratório CRZ-1.0 do Narrador'}))
   .toHaveClass('crz-high-contrast');
  fireEvent.click(contrast);
  expect(contrast).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  expect(screen.getByLabelText('Zoom do mapa CRZ')).toHaveTextContent('100%');
  const plus=screen.getByRole('button',{name:'Ampliar zoom CRZ'});
  fireEvent.click(plus);
  expect(screen.getByLabelText('Zoom do mapa CRZ')).toHaveTextContent('150%');
  fireEvent.click(plus);
  expect(screen.getByLabelText('Zoom do mapa CRZ')).toHaveTextContent('200%');
  expect(plus).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Ajustar mapa CRZ'}));
  expect(screen.getByLabelText('Zoom do mapa CRZ')).toHaveTextContent('100%');
  expect(screen.getByRole('button',{name:'Reduzir zoom CRZ'})).toBeDisabled();
 });
 it('usa foco de tabulação único no mapa e controles explicados',()=>{
  render(<BattleCrzLab/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar treinamento CRZ'}));
  const map=screen.getByRole('group',{name:'Mapa CRZ 11 por 9'});
  const tiles=map.querySelectorAll<SVGGElement>('[data-crz-hex]');
  expect(tiles.length).toBe(99);
  expect(Array.from(tiles).filter(x=>x.getAttribute('tabindex')==='0')).toHaveLength(1);
  const initial=Array.from(tiles).find(x=>x.getAttribute('tabindex')==='0')!;
  expect(initial.getAttribute('aria-describedby')).toBe('crz-keyboard-help');
  expect(screen.getByText(/setas navegam pelos hexágonos/)).toBeInTheDocument();
  fireEvent.keyDown(initial,{key:'Enter'});
  expect(Array.from(tiles).some(x=>x.getAttribute('aria-label')?.includes('Inspecionar'))).toBe(true);
 });
 it('não depende de credenciais, servidor ou bibliotecas de visual proprietário',()=>{
  const board=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(board).not.toMatch(/supabase|fetch\(|useServerFn|@\/lib\/battle\/domain/);
  expect(board).toContain('ArrowRight');
  expect(board).toContain('onKeyDown');
 });
});
