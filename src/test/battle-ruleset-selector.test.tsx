import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BattleRulesetSelector} from '@/components/battle/BattleRulesetSelector';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BATTLE_RULESET_OPTIONS,battleRulesetReady} from '@/lib/battle/ruleset-modes';

describe('Seletor dos três sistemas de batalha — lote inicial',()=>{
 it('oferece três sistemas isolados, com Adaptado disponível e GOT/D&D em laboratório',()=>{
  expect(BATTLE_RULESET_OPTIONS.map(mode=>mode.id)).toEqual(['got','adapted','dnd']);
  expect(battleRulesetReady('adapted')).toBe(true);
  expect(battleRulesetReady('got')).toBe(false);
  expect(battleRulesetReady('dnd')).toBe(false);
 });
 it('permite escolher os três modos sem iniciar um combate',()=>{
  const onChange=vi.fn();
  render(<BattleRulesetSelector value="adapted" onChange={onChange}/>);
  const modes=screen.getAllByRole('radio');
  expect(modes).toHaveLength(3);
  expect(screen.getByRole('radio',{name:/Game of Thrones/})).not.toBeChecked();
  expect(screen.getByRole('radio',{name:/Adaptado/})).toBeChecked();
  fireEvent.click(screen.getByRole('radio',{name:/D&D/}));
  expect(onChange).toHaveBeenCalledWith('dnd');
 });
 it('mantém Adaptado independente, abre GOT e habilita laboratório 5e quadrado',()=>{
  render(<BattleNarratorHub/>);
  expect(screen.getByRole('radio',{name:/Adaptado/})).toBeChecked();
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
  fireEvent.click(screen.getByText('Mais opções'));
  expect(screen.getByRole('button',{name:'Cruzada com comandantes'})).toBeEnabled();
  fireEvent.click(screen.getByRole('radio',{name:/Game of Thrones/}));
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
  expect(screen.getByText(/Regras especiais em teste/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/D&D/}));
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
  expect(screen.getByText(/D20, CA, PV e criaturas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/Adaptado/}));
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
 });
});
