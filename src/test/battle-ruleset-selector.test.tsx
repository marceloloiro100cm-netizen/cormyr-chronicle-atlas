import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BattleRulesetSelector} from '@/components/battle/BattleRulesetSelector';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BATTLE_RULESET_OPTIONS,battleRulesetReady} from '@/lib/battle/ruleset-modes';

describe('Seletor dos três sistemas de batalha — lote inicial',()=>{
 it('oferece três identificadores estáveis, com apenas Adaptado executável',()=>{
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
 it('mantém Adaptado independente, abre laboratório GOT e bloqueia motor D&D pendente',()=>{
  render(<BattleNarratorHub/>);
  expect(screen.getByRole('radio',{name:/Adaptado/})).toBeChecked();
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'Batalha rápida com comandantes'})).toBeEnabled();
  fireEvent.click(screen.getByRole('radio',{name:/Game of Thrones/}));
  expect(screen.queryByRole('button',{name:'Criar batalha'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Testar regras do livro'})).toBeEnabled();
  expect(screen.getByText(/Não será substituído pelo Adaptado/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/D&D/}));
  expect(screen.getByRole('button',{name:'Iniciar batalha — em desenvolvimento'})).toBeDisabled();
  expect(screen.getByText(/Bônus de ataque, Classe de Armadura/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/Adaptado/}));
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
 });
});
