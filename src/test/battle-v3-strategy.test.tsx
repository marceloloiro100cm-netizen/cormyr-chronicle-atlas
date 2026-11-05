import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {V3_STRATEGY_NODES,V3_STRATEGY_ROADS,V3_STRATEGY_RULE_VERSION,
 v3StartStrategy,v3StrategyNeighbors,v3StrategyMarchCost,
 v3StrategyOrder,v3StrategyAiTurn} from '@/lib/battle/v3/strategy';

describe('Crusada V3.3 — mapa estratégico isolado',()=>{
 it('possui rede conexa de estradas com sete locais e três objetivos',()=>{
  expect(V3_STRATEGY_NODES).toHaveLength(7);
  expect(V3_STRATEGY_ROADS).toHaveLength(8);
  expect(new Set(V3_STRATEGY_NODES.map(n=>n.id)).size).toBe(7);
  const reached=new Set<string>(['camp']),queue=['camp'] as ('camp'|'crossroads'|'grove'|'bridge'|'watch'|'market'|'fort')[];
  while(queue.length){
   const node=queue.shift()!;
   for(const neighbor of v3StrategyNeighbors(node)){
    if(!reached.has(neighbor)){reached.add(neighbor);queue.push(neighbor);}
   }
  }
  expect(reached.size).toBe(V3_STRATEGY_NODES.length);
 });
 it('rejeita estrada ilegal, recruta e reabastece com valores inteiramente fictícios',()=>{
  const game=v3StartStrategy(300,300,'human');
  expect(game.rulesVersion).toBe(V3_STRATEGY_RULE_VERSION);
  expect(()=>v3StrategyOrder(game,{type:'MARCH',to:'market'})).toThrow(/adjacente/i);
  const recruited=v3StrategyOrder(game,{type:'RECRUIT'});
  expect(recruited.troops.attacker).toBe(320);
  expect(recruited.supplies.attacker).toBe(game.supplies.attacker-60);
  const d=v3StrategyOrder(recruited,{type:'WAIT'});
  const supplied=v3StrategyOrder(d,{type:'RESUPPLY'});
  expect(supplied.supplies.attacker).toBe(Math.min(1200,recruited.supplies.attacker+120));
  expect(game.troops.attacker).toBe(300);
  expect(()=>v3StartStrategy(0,300)).toThrow();
  expect(()=>v3StrategyMarchCost(0)).toThrow();
 });
 it('IA adversária captura objetivo e passa o dia sem tocar no calendário oficial',()=>{
  const game=v3StartStrategy(300,280,'ai');
  const awaiting=v3StrategyOrder(game,{type:'WAIT'});
  expect(awaiting.turn).toBe('defender');
  const after=v3StrategyAiTurn(awaiting);
  expect(after.turn).toBe('attacker');
  expect(after.day).toBe(2);
  expect(after.owners.market).toBe('defender');
  expect(after.supplies.defender).toBeLessThan(game.supplies.defender);
  expect(v3StrategyAiTurn(after)).toBe(after);
 });
 it('aplica escaramuça abstrata e mantém todos os soldados em objetos locais',()=>{
  let s=v3StartStrategy(400,300,'human');
  s=v3StrategyOrder(s,{type:'MARCH',to:'crossroads'});
  s=v3StrategyOrder(s,{type:'MARCH',to:'watch'});
  s=v3StrategyOrder(s,{type:'MARCH',to:'bridge'});
  const before=s.troops.attacker+s.troops.defender;
  s=v3StrategyOrder(s,{type:'MARCH',to:'bridge'});
  expect(s.troops.attacker+s.troops.defender).toBeLessThan(before);
  expect(s.log.at(-1)?.message).toContain('Escaramuça');
  expect(s.owners.bridge).toBe('attacker');
  expect(s.position.defender).toBe('watch');
  expect(s.phase).toBe('active');
 });
 it('não cria soldados quando a última tropa é eliminada no combate abstrato',()=>{
  let s=v3StartStrategy(1,400,'human');
  s=v3StrategyOrder(s,{type:'MARCH',to:'crossroads'});
  s=v3StrategyOrder(s,{type:'MARCH',to:'watch'});
  s=v3StrategyOrder(s,{type:'MARCH',to:'bridge'});
  s=v3StrategyOrder(s,{type:'MARCH',to:'bridge'});
  expect(s.troops.attacker).toBe(0);
  expect(s.phase).toBe('completed');
  expect(s.winner).toBe('defender');
 });
 it('declara vitória após controlar os três marcos ao fim do dia',()=>{
  let s=v3StartStrategy(400,300,'human');
  for(const move of ['crossroads','bridge','watch','bridge','market'] as const){
   s=v3StrategyOrder(s,{type:'MARCH',to:move});
   s=v3StrategyOrder(s,{type:'WAIT'});
  }
  expect(s.owners.bridge).toBe('attacker');
  expect(s.owners.watch).toBe('attacker');
  expect(s.owners.market).toBe('attacker');
  expect(s.phase).toBe('completed');
  expect(s.winner).toBe('attacker');
  expect(()=>v3StrategyOrder(s,{type:'WAIT'})).toThrow();
 });
 it('o botão de planejamento abre mapa clicável e mantém a opção tática Batalhar',()=>{
  render(<BattleV3Game/>);
  fireEvent.click(screen.getByRole('button',{name:/Planejar Cruzada/}));
  const board=within(screen.getByRole('region',{name:'Mapa estratégico da Cruzada'}));
  expect(board.getByRole('heading',{name:'Mapa estratégico de treinamento'})).toBeInTheDocument();
  expect(board.getByRole('button',{name:/Estrada do Norte.*Pode marchar/})).toBeEnabled();
  fireEvent.click(board.getByRole('button',{name:/Estrada do Norte.*Pode marchar/}));
  expect(board.getByText(/Ordem estratégica registrada/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Batalhar'})).toBeInTheDocument();
 });
});
