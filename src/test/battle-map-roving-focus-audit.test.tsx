import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';

describe('Auditoria de acessibilidade — tabuleiro hexagonal PTE/V3',()=>{
 it('usa um único tab stop e fornece instruções para navegação por setas',()=>{
  render(<BattleBoard map={createScenario('plain-open')} onHexClick={vi.fn()}/>);
  const board=screen.getByRole('group',{name:/Mapa hexagonal com/});
  const hexes=Array.from(board.querySelectorAll<SVGGElement>('[data-battle-hex]'));
  expect(hexes.length).toBe(99);
  expect(hexes.filter(el=>el.getAttribute('tabindex')==='0')).toHaveLength(1);
  expect(screen.getByText(/Use Tab para entrar no mapa, setas/)).toBeInTheDocument();
 });
 it('permite percorrer, selecionar e não executa comando ao apenas navegar',()=>{
  const onHexClick=vi.fn();
  render(<BattleBoard map={createScenario('plain-open')} onHexClick={onHexClick}/>);
  const board=screen.getByRole('group',{name:/Mapa hexagonal com/});
  const hexes=Array.from(board.querySelectorAll<SVGGElement>('[data-battle-hex]'));
  const first=hexes.find(el=>el.getAttribute('tabindex')==='0')!;
  const before=first.getAttribute('data-battle-hex');
  fireEvent.keyDown(first,{key:'ArrowRight'});
  const after=Array.from(board.querySelectorAll<SVGGElement>('[data-battle-hex]'))
   .find(el=>el.getAttribute('tabindex')==='0')!;
  expect(after.getAttribute('data-battle-hex')).not.toBe(before);
  expect(onHexClick).not.toHaveBeenCalled();
  fireEvent.keyDown(after,{key:'Enter'});
  expect(onHexClick).toHaveBeenCalledOnce();
  const target=onHexClick.mock.calls[0]?.[0] as {q:number;r:number};
  expect(target.q+','+target.r).toBe(after.getAttribute('data-battle-hex'));
 });
 it('tabuleiro somente informativo não coloca nenhum hexágono na tabulação',()=>{
  render(<BattleBoard map={createScenario('contested-woods')}/>);
  const board=screen.getByRole('group',{name:/Mapa hexagonal com/});
  expect(Array.from(board.querySelectorAll('[data-battle-hex]'))
   .every(el=>!el.hasAttribute('tabindex'))).toBe(true);
 });
});
