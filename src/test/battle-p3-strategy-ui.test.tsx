import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BattleStrategicLab} from '@/components/battle/BattleStrategicLab';

describe('P3 · tela operacional integrada ao Narrador',()=>{
 it('exibe mapa de rotas e permite executar cerco em turnos sem fichas oficiais',()=>{
  const onBack=vi.fn();
  render(<BattleStrategicLab onBack={onBack}/>);
  expect(screen.getByRole('region',{name:'Mapa operacional'})).toBeInTheDocument();
  expect(screen.getByText(/custo abstrato 2 pontos/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Iniciar cerco fictício'}));
  expect(screen.getByText(/100\/100/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Bombardear muralhas'}));
  expect(screen.getByText(/77\/100/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Reparar muralhas'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Reparar muralhas'}));
  expect(screen.getByText(/94\/100/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Voltar ao módulo'}));
  expect(onBack).toHaveBeenCalledOnce();
 });
 it('painel estratégico não inclui funções mutáveis da campanha nem client Supabase',()=>{
  const ui=readFileSync(resolve('src/components/battle/BattleStrategicLab.tsx'),'utf8');
  const engine=readFileSync(resolve('src/lib/crusade/strategic-operations.ts'),'utf8');
  expect(ui).not.toMatch(/useServerFn|supabase|houseOperation\(/i);
  expect(engine).not.toMatch(/supabase|noble_house_sheets|houseOperation\(/i);
 });
});
