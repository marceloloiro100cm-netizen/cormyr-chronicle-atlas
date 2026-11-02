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
 it('prepara dificuldade privada sem gerar chance ou aplicar decisão automaticamente',()=>{
  render(<SpyNarratorPanel houseName="Evenhand" houseId="house-evenhand"/>);
  fireEvent.click(screen.getByText('Prévia de dificuldade e Lei local (somente Narrador)'));
  fireEvent.change(screen.getByLabelText('Dificuldade base aprovada'),{target:{value:'12'}});
  fireEvent.change(screen.getByLabelText('Lei local validada pela fonte'),{target:{value:'43'}});
  fireEvent.change(screen.getByLabelText('Justificativa narratorial'),{
   target:{value:'Fonte narrativa verificada e documentada pelo Narrador'},
  });
  fireEvent.click(screen.getByRole('button',{name:'Preparar decisão de dificuldade'}));
  expect(screen.getByText(/Prévia local: base 12, Lei 43/)).toBeTruthy();
  expect(screen.getByText(/Sem cálculo final, sem envio e sem gravação/)).toBeTruthy();
 });
 it('não habilita publicação e conclusão real',()=>{
  render(<SpyNarratorPanel houseName="Evenhand" houseId="house-evenhand"/>);
  expect((screen.getByRole('button',{name:'Publicar carta real (exige RLS e auditoria)'} ) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Concluir deslocamento (exige RPC)'}) as HTMLButtonElement).disabled).toBe(true);
 });
});