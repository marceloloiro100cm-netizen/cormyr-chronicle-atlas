import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {FirebaseHouseSheet} from './FirebaseHouseSheet';

afterEach(cleanup);
const sheet={
  id:'house-a',name:'Casa Exemplo',castle:'Fortaleza do Rio',
  version:7,
  state:{
    houseId:'house-a',schemaVersion:1,wealth:8,law:4,flag:true,
    units:[{id:'u1',name:'Lanceiros',quantity:40,speedMeters:6}],
    court:[{name:'Ser Afonso',role:'Comandante'}],
    holdings:{village:'Povoado A',mine:{name:'Mina do Vale',active:true}},
    undocumentedSection:{unknownDetail:'Deve aparecer'},
  },
};

describe('Firebase — ficha nobre somente leitura',()=>{
  it('mostra os mesmos campos do estado preservado, sem transformar em JSON',()=>{
    const {container}=render(<FirebaseHouseSheet sheet={sheet}/>);
    expect(screen.getByRole('article',{name:'Ficha da Casa Casa Exemplo'}))
      .toBeInTheDocument();
    expect(screen.getByText(/Fortaleza do Rio/)).toBeInTheDocument();
    expect(screen.getByText('Riqueza')).toBeInTheDocument();
    expect(screen.getByText('Lei')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('Sim').length).toBeGreaterThan(0);
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[contenteditable]')).toBeNull();
  });

  it('mantém unidades, Corte e seções desconhecidas do backup',()=>{
    render(<FirebaseHouseSheet sheet={sheet}/>);
    fireEvent.click(screen.getByText(/Exército e unidades · 1 registro/));
    expect(screen.getByText('Lanceiros')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Corte · 1 registro/));
    expect(screen.getByText('Ser Afonso')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/undocumented Section · 1 registro/));
    expect(screen.getByText('Deve aparecer')).toBeInTheDocument();
  });

  it('não interpreta strings privadas como HTML ou scripts',()=>{
    const suspicious={...sheet,state:{notes:'<img src=x onerror=alert(1)>',
      nested:{text:'<script>attack()</script>'}}};
    const {container}=render(<FirebaseHouseSheet sheet={suspicious}/>);
    expect(screen.getByText('<img src=x onerror=alert(1)>'))
      .toBeInTheDocument();
    expect(screen.getByText('<script>attack()</script>'))
      .toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('aceita campos vazios e aninhados sem remover campos',()=>{
    const empty={...sheet,state:{one:null,two:[],three:{},four:false}};
    render(<FirebaseHouseSheet sheet={empty}/>);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('four')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum registro')).toHaveLength(2);
    expect(screen.getByText('Não')).toBeInTheDocument();
  });
});
