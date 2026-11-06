import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleV3Game} from '@/components/battle/BattleV3Game';

const opts={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
function started(){
 render(<BattleV3Game initialOptions={opts}/>);
 fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
 return screen.getByRole('region',{name:'Arena V4 unificada'});
}
describe('Batalha V3 · padrão de interface V4 unificada',()=>{
 it('contém general com placeholder, ordem superior, mapa central e últimas ações',()=>{
  const arena=started();
  expect(within(arena).getByRole('region',{name:'General e habilidades V3'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('img',{name:'Espaço reservado para retrato do comandante'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('region',{name:'Ordem de combate V3'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('region',{name:'Campo de batalha V3'}))
   .toBeInTheDocument();
  expect(within(arena).getByRole('complementary',{name:'Últimas ações V3'}))
   .toBeInTheDocument();
  expect(within(arena).queryByRole('button',{name:'Mover'})).not.toBeInTheDocument();
  expect(within(arena).queryByRole('button',{name:'Atacar'})).not.toBeInTheDocument();
  expect(within(arena).getByRole('button',{name:'Fim de turno'})).toBeEnabled();
 });
 it('hover e foco no topo destacam token correspondente sem executar turno',()=>{
  started();
  const order=screen.getByRole('region',{name:'Ordem de combate V3'});
  const cards=within(order).getAllByRole('button');
  expect(cards.length).toBe(8);
  const map=screen.getByRole('group',{name:/Mapa hexagonal/});
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(0);
  fireEvent.mouseEnter(cards[1]!);
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(1);
  fireEvent.mouseLeave(cards[1]!);
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(0);
  fireEvent.focus(cards[2]!);
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(1);
  fireEvent.blur(cards[2]!);
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(0);
 });
 it('move diretamente por hexágono legal, sem alternância manual de ações',()=>{
  started();
  const map=screen.getByRole('group',{name:/Mapa hexagonal/});
  const current=within(screen.getByRole('region',{name:'Ordem de combate V3'}))
   .getAllByRole('button')[0]!;
  expect(current).toHaveAttribute('aria-current','step');
  expect(current).toHaveAttribute('aria-pressed','true');
  expect(map.querySelectorAll('[data-battle-selected-ring]')).toHaveLength(1);
  const paths=within(map).getAllByRole('button',{name:/movimento permitido/});
  expect(paths.length).toBeGreaterThan(0);
  fireEvent.click(paths[0]!);
  expect(screen.getByText('Ordem aplicada com sucesso.')).toBeInTheDocument();
  expect(within(screen.getByRole('complementary',{name:'Últimas ações V3'}))
   .getByText(/Marcha/)).toBeInTheDocument();
 });
 it('inspecionar inimigo na ordem não concede controle das ações',()=>{
  started();
  const order=within(screen.getByRole('region',{name:'Ordem de combate V3'}));
  const enemy=order.getAllByRole('button').find(b=>
   b.getAttribute('aria-current')!=='step');
  expect(enemy).toBeDefined();
  fireEvent.click(enemy!);
  expect(enemy).toHaveAttribute('aria-pressed','true');
  expect(within(screen.getByRole('group',{name:/Mapa hexagonal/}))
   .queryAllByRole('button',{name:/movimento permitido/})).toHaveLength(0);
  expect(screen.getByRole('button',{name:'Fim de turno'})).toBeEnabled();
 });
 it('preserva alvo de habilidade, cancelamento, ajuda e controle da simulação',()=>{
  started();
  const general=within(screen.getByRole('region',{name:'General e habilidades V3'}));
  expect(general.getByRole('button',{name:'Esperar'})).toBeEnabled();
  expect(general.getByRole('button',{name:'Defender'})).toBeEnabled();
  const power=general.getAllByRole('button').find(button=>
   button.className.includes('crusade-v4-primary'))!;
  expect(power).toBeDefined();
  fireEvent.click(power);
  expect(power).toHaveAttribute('aria-pressed','true');
  expect(general.getByRole('button',{name:'Cancelar alvo'})).toBeInTheDocument();
  fireEvent.click(general.getByRole('button',{name:'Cancelar alvo'}));
  expect(power).toHaveAttribute('aria-pressed','false');
  expect(screen.getByRole('button',{name:'Exportar treino JSON'})).toBeInTheDocument();
 });
 it('escopo e responsividade independentes de dados oficiais',()=>{
  const css=readFileSync('src/components/battle/crusade-v4.css','utf8');
  const component=readFileSync('src/components/battle/BattleV3Game.tsx','utf8');
  expect(css).toContain('@media(max-width:660px)');
  expect(css).toContain('.crusade-v4-columns');
  expect(component).toContain('theme="cormyr"');
  expect(component).toContain('activationOrder');
  expect(component).not.toMatch(/supabase|useServerFn|houseOperation\(/);
 });
});
