import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {FirebaseCalendarSnapshot} from './FirebaseCalendarSnapshot';

afterEach(cleanup);

describe('Firebase Hub Temporal — leitura Harptos',()=>{
  it('apresenta Hammer no formato oficial, sem ação de avanço',()=>{
    const {container}=render(<FirebaseCalendarSnapshot date={{
      year:1522,month:0,day:1,festival:null,version:5,
    }}/>);
    expect(screen.getByRole('heading',{name:'1ª désdia · Hammer · 1522 CV'}))
      .toBeInTheDocument();
    expect(screen.getByText('Dia 1 de Hammer')).toBeInTheDocument();
    expect(container.querySelector('[aria-current="date"]'))
      .toHaveTextContent('1ª désdia');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Data preservada no Firebase/))
      .toBeInTheDocument();
  });

  it('identifica a segunda e a terceira désdias com limites exatos',()=>{
    const {container,rerender}=render(<FirebaseCalendarSnapshot date={{
      year:1522,month:1,day:11,festival:null,version:8,
    }}/>);
    expect(container.querySelector('[aria-current="date"]'))
      .toHaveTextContent('2ª désdia');
    expect(screen.getByRole('heading',{name:'2ª désdia · Alturiak · 1522 CV'}))
      .toBeInTheDocument();
    rerender(<FirebaseCalendarSnapshot date={{
      year:1522,month:11,day:30,festival:null,version:9,
    }}/>);
    expect(container.querySelector('[aria-current="date"]'))
      .toHaveTextContent('3ª désdia');
    expect(screen.getByRole('heading',{name:'3ª désdia · Nightal · 1522 CV'}))
      .toBeInTheDocument();
  });

  it('festivais intercalares não são exibidos como dias de désdia',()=>{
    const {container}=render(<FirebaseCalendarSnapshot date={{
      year:1522,month:0,day:30,festival:'midwinter',version:12,
    }}/>);
    expect(screen.getByText('Midwinter · Meio do Inverno'))
      .toBeInTheDocument();
    expect(screen.getByText('Festival intercalar · fora das désdias'))
      .toBeInTheDocument();
    expect(container.querySelector('[aria-current="date"]')).toBeNull();
    expect(screen.queryByText('3ª désdia')).toBeNull();
  });

  it('não inventa uma data se o snapshot for inválido',()=>{
    render(<FirebaseCalendarSnapshot date={{
      year:1522,month:12,day:31,festival:null,version:0,
    }}/>);
    expect(screen.getByRole('status'))
      .toHaveTextContent('Calendário de Cormyr ainda não disponível');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
