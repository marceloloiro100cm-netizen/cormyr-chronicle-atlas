import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {newHouseState} from '@/lib/house/types';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {SpyPlayerPanel} from '@/components/house/espionage/spy-player-panel';
const base=()=>{
 const state=newHouseState('own-house','helmlands');
 state.base.wealth=45;
 state.domains=[{id:'11111111-1111-4111-8111-111111111111',name:'Domínio próprio',terrain:'plains',features:[],notes:''}];
 return state;
};
describe('Espionagem · Lote 8 interface do jogador',()=>{
 it('exibe abas acessíveis e informações de capacidade sem inventar agentes operacionais',()=>{
  render(<SpyPlayerPanel houseName="Evenhand" state={base()} catalog={CORE_CATALOG}
    houses={[{id:'target',name:'Casa Alvo'}]} canEdit={false} onOpenPurchase={()=>{}}/>);
  const nav=screen.getByRole('navigation',{name:'Seções de espionagem'});
  expect(within(nav).getAllByRole('button')).toHaveLength(7);
  fireEvent.click(within(nav).getByRole('button',{name:'Agentes'}));
  expect(screen.getByText('Sem vagas de espionagem em posses ativas.')).toBeTruthy();
 });
 it('faz prévia de missão sem consultar campo privado da Casa-alvo',()=>{
  render(<SpyPlayerPanel houseName="Evenhand" state={base()} catalog={CORE_CATALOG}
    houses={[{id:'target',name:'Casa Alvo'}]} canEdit={false} onOpenPurchase={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Missões'}));
  fireEvent.change(screen.getByLabelText('Tipo de missão'),{target:{value:'military'}});
  fireEvent.change(screen.getByLabelText('Alvo'),{target:{value:'target'}});
  fireEvent.click(screen.getByLabelText('house army'));
  fireEvent.click(screen.getByRole('button',{name:'Visualizar rascunho'}));
  expect(screen.getByRole('status').textContent).toContain('ainda não possui agentes');
 });
 it('navega por múltiplas etapas e oferece retorno à origem original',()=>{
  render(<SpyPlayerPanel houseName="Evenhand" state={base()} catalog={CORE_CATALOG}
   houses={[]} canEdit={false} onOpenPurchase={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Rotas'}));
  fireEvent.change(screen.getByLabelText('Origem'),{target:{value:'11111111-1111-4111-8111-111111111111'}});
  fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'helmlands'}});
  fireEvent.click(screen.getByRole('button',{name:'Adicionar etapa'}));
  expect(screen.getByText(/Etapas previstas/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Planejar retorno'}));
  expect((screen.getByLabelText('Destino') as HTMLSelectElement).value).toBe('11111111-1111-4111-8111-111111111111');
 });
 it('mostra carta e dossiê de exemplo sem apresentar dados adversários',()=>{
  render(<SpyPlayerPanel houseName="Evenhand" state={base()} catalog={CORE_CATALOG}
   houses={[]} canEdit={false} onOpenPurchase={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Dossiês'}));
  expect(screen.getByText(/Cobertura do objetivo: 4 de 8/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Relatórios'}));
  fireEvent.click(screen.getByRole('button',{name:'Ler exemplo de carta'}));
  expect(screen.getByText(/Os fatos reais e a identidade de um alvo não são carregados/)).toBeTruthy();
 });
 it('informa rota ausente e nunca exibe prazo arbitrário',()=>{
  render(<SpyPlayerPanel houseName="Evenhand" state={base()} catalog={CORE_CATALOG}
   houses={[]} canEdit={false} onOpenPurchase={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Rotas'}));
  fireEvent.change(screen.getByLabelText('Origem'),{target:{value:'11111111-1111-4111-8111-111111111111'}});
  fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'helmlands'}});
  fireEvent.click(screen.getByRole('button',{name:'Consultar percurso'}));
  expect(screen.getByRole('status').textContent).toContain('Rota não cadastrada');
 });
});