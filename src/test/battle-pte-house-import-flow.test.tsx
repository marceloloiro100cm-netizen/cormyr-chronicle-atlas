import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BattleSetup} from '@/components/battle/BattleSetup';
import type {BattleStack,BattleState,Side} from '@/lib/battle/domain/types';
import {makeFictionalStack} from '@/lib/battle/domain/setup';

vi.mock('@/components/battle/BattleSourcePicker',()=>({
 BattleSourcePicker:({onAddMany}:{onAddMany:(stacks:BattleStack[],name:string)=>boolean})=>
  <button type="button" onClick={()=>{
   const model=makeFictionalStack({
    id:'preview-1',side:'attacker',name:'Guarda da Fênix',typeId:'infantry',
    training:'trained',count:100,position:{q:0,r:0},
   });
   const snapshot:BattleStack={...model,source:{
    kind:'house-readonly',houseId:'ashkar',unitId:'unit-ashkar-1',
    sourceVersion:8,sourceCapturedAt:'2026-11-07T00:00:00.000Z',
    officialHealth:6,officialMaxHealth:6,warnings:[],
   }};
   onAddMany([snapshot],'Ashkar');
  }}>Carregar Guarda da Fênix do catálogo</button>,
}));

describe('PTE · iniciar com tropas de uma Casa documentada',()=>{
 it('seleção Casa substitui tropa-modelo e usa a cópia oficial, sem gravar no original',()=>{
  const onStart=vi.fn((_battle:BattleState,_names:Record<Side,string>)=>{});
  render(<BattleSetup onStart={onStart} onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Casas cadastradas · Região e Casa'}));
  const start=screen.getByRole('button',{name:'Iniciar batalha com unidades das casas'});
  expect(start).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Carregar Guarda da Fênix do catálogo'}));
  expect(start).toBeEnabled();
  expect(screen.getByText(/1 unidades oficiais copiadas para este exercício/))
   .toBeInTheDocument();
  fireEvent.click(start);
  expect(onStart).toHaveBeenCalledOnce();
  const [battle,names]=onStart.mock.calls[0]!;
  const attackers=battle.stacks.filter(s=>s.side==='attacker');
  expect(attackers).toHaveLength(1);
  expect(attackers[0]?.name).toBe('Guarda da Fênix');
  expect(attackers[0]?.source.kind).toBe('house-readonly');
  expect(attackers[0]?.source.houseId).toBe('ashkar');
  expect(battle.stacks.filter(s=>s.side==='defender')).toHaveLength(1);
  expect(battle.stacks.filter(s=>s.side==='defender')[0]?.source.kind).toBe('fictional');
  expect(names.attacker).toBe('Casa Ashkar');
  expect(battle.phase).toBe('ready');
 });
});
