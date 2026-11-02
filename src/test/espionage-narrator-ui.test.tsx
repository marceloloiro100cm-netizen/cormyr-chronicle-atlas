import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
vi.mock('@/lib/calendar/campaign-time',()=>({
 useCampaignTime:()=>({data:{year:1524,month:0,day:20,festival:null,version:5,auto_advance:false},isError:false}),
}));
import {SpyNarratorPanel} from '@/components/house/espionage/spy-narrator-panel';
describe('Espionagem · Lote 9 mesa de demonstração do Narrador',()=>{
 it('sela, autoriza e vê carta demonstrativa sem lançar informação em banco',()=>{
  render(<SpyNarratorPanel houseName="Evenhand" houseId="house-evenhand"/>);
  expect(screen.getByText('Mesa de inteligência — Evenhand')).toBeTruthy();
  expect(screen.getByText(/Lote 10/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Selar carta demonstrativa'}));
  expect(screen.getByText(/Carta de demonstração SELADA/)).toBeTruthy();
  expect(screen.getByText(/nenhuma informação será projetada/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Justificativa da autorização de comunicação'),{
   target:{value:'Comunicação de teste autorizada somente na simulação'},
  });
  fireEvent.click(screen.getByRole('button',{name:'Simular liberação da carta'}));
  expect(screen.getByText(/Liberação SIMULADA/)).toBeTruthy();
  expect(screen.getByText(/COBERTURA DO OBJETIVO/i).textContent??'').not.toContain('HouseState');
 });
 it('não habilita publicação e conclusão real',()=>{
  render(<SpyNarratorPanel houseName="Evenhand" houseId="house-evenhand"/>);
  expect((screen.getByRole('button',{name:'Publicar carta real (exige RLS e auditoria)'} ) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Concluir deslocamento (exige RPC)'}) as HTMLButtonElement).disabled).toBe(true);
 });
});