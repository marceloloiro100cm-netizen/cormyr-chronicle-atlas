import {describe,expect,it} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MailPeriodNotice} from '@/components/players/mail-period-notice';

describe('Aviso privado sobre rodadas e período histórico',()=>{
 it('mantém a fotografia da rodada quando o calendário já avançou',()=>{
  render(<MailPeriodNotice date="1522-02-01" round={{
   number:2,status:'open',harptos_period:'1522-01:désdia-3',
  }}/>);
  expect(screen.getByText(/Semana de correspondência/)).toHaveTextContent('2');
  expect(screen.getByText(/referência na abertura/)).toHaveTextContent('3ª désdia · Hammer · 1522 CV');
  expect(screen.getByText(/O calendário atual está em outro período/)).toBeInTheDocument();
  expect(screen.getByText(/Período atual do Reino/)).toHaveTextContent('1ª désdia · Alturiak · 1522 CV');
 });
 it('não inventa referência retroativa de uma rodada legada',()=>{
  render(<MailPeriodNotice date="1522-01-25" round={{
   number:1,status:'closed',harptos_period:null,
  }}/>);
  expect(screen.getByText(/Referência histórica não registrada/)).toBeInTheDocument();
  expect(screen.getByText(/não é seguro inferir uma data retrospectiva/)).toBeInTheDocument();
 });
});
