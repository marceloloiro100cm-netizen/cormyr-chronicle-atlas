import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import {FirebaseHouseResources,readFirebaseHouseResources} from './FirebaseHouseResources';
afterEach(cleanup);
const state={
  base:{defense:20,influence:30,lands:10,law:0,population:50,power:22,wealth:17},
  permanent:{defense:2,influence:0,lands:-1,law:3,population:0,power:1,wealth:4},
  treasury:120,budget:400,method:'import',phase:'active',month:146,
  regionalApplied:false,identity:{region:'Helmlands'},
};
describe('Firebase Cloud — recursos e Tesouro por Casa',()=>{
  it('mostra exatamente sete recursos e indicadores registrados',()=>{
    const data=readFirebaseHouseResources(state);
    expect(data.rows).toHaveLength(7);
    expect(data.baseComplete).toBe(true);
    expect(data.permanentComplete).toBe(true);
    expect(data.rows.find(r=>r.key==='wealth')).toEqual({
      key:'wealth',label:'Riqueza',base:17,permanent:4,
    });
    expect(data.rows.find(r=>r.key==='lands')?.permanent).toBe(-1);
    expect(data.treasury).toBe(120);
    expect(data.month).toBe(146);
    render(<FirebaseHouseResources houseName="Evenhand" state={state}/>);
    expect(screen.getByRole('heading',{name:'Recursos e Tesouro'})).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(8);
    const wealth=screen.getByRole('row',{name:/Riqueza/});
    expect(within(wealth).getByRole('rowheader')).toHaveTextContent('Riqueza');
    expect(within(wealth).getAllByRole('cell').map(c=>c.textContent)).toEqual(['17','4']);
    expect(screen.getByText('Helmlands')).toBeInTheDocument();
    expect(screen.getByText('Importação')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
  });
  it('não confunde valor zero com dado ausente',()=>{
    const data=readFirebaseHouseResources({base:{law:0},permanent:{law:0},treasury:0,budget:0,month:0});
    expect(data.rows.find(r=>r.key==='law')?.base).toBe(0);
    expect(data.treasury).toBe(0);
    expect(data.budget).toBe(0);
    expect(data.month).toBe(0);
    expect(data.baseComplete).toBe(false);
    expect(data.permanentComplete).toBe(false);
    render(<FirebaseHouseResources houseName="Evenhand" state={{}}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Valores incompletos');
    expect(screen.getAllByText('Não informado').length).toBeGreaterThan(3);
  });
  it('descarta números não confiáveis sem converter strings em saldos',()=>{
    const data=readFirebaseHouseResources({
      base:{wealth:'99',defense:Infinity,lands:NaN},
      permanent:{wealth:99999999999},
      treasury:'1000',budget:-1,month:2.5,
    });
    expect(data.rows.find(r=>r.key==='wealth')?.base).toBeNull();
    expect(data.rows.find(r=>r.key==='defense')?.base).toBeNull();
    expect(data.rows.find(r=>r.key==='lands')?.base).toBeNull();
    expect(data.rows.find(r=>r.key==='wealth')?.permanent).toBeNull();
    expect(data.treasury).toBeNull();
    expect(data.budget).toBeNull();
    expect(data.month).toBeNull();
  });
  it('não inventa saldo disponível a partir da soma base e permanente',()=>{
    const data=readFirebaseHouseResources(state);
    expect(Object.keys(data)).not.toContain('available');
    expect(Object.keys(data)).not.toContain('total');
    const {container}=render(<FirebaseHouseResources houseName="Evenhand" state={state}/>);
    expect(container.textContent).toContain('não o saldo disponível');
    expect(container.querySelector('form,button,input,[contenteditable]')).toBeNull();
    const link=screen.getByRole('link',{name:'Consultar lançamentos auditados do Tesouro'});
    expect(link).toHaveAttribute('href','/firebase-treasury-history');
  });
  it('exibe conteúdo como texto e nunca executa HTML da fonte',()=>{
    const {container}=render(<FirebaseHouseResources houseName="Evenhand"
      state={{...state,method:'<script>alert(1)</script>',identity:{region:'<img src=x onerror=attack()>'}}}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=attack()>')).toBeInTheDocument();
    expect(container.querySelector('script,img')).toBeNull();
  });
  it('trata nomes de propriedades herdadas como texto, sem renderizar funções ou objetos',()=>{
    const unusual=readFirebaseHouseResources({
      method:'constructor',phase:'toString',
    });
    expect(unusual.method).toBe('constructor');
    expect(unusual.phase).toBe('toString');
    const {container}=render(<FirebaseHouseResources houseName="Evenhand"
      state={{method:'__proto__',phase:'constructor'}}/>);
    expect(screen.getByText('__proto__')).toBeInTheDocument();
    expect(screen.getByText('constructor')).toBeInTheDocument();
    expect(container.querySelector('button,form,input')).toBeNull();
  });
  it('não modifica o snapshot ao preparar a apresentação',()=>{
    const original=structuredClone(state);
    readFirebaseHouseResources(state);
    expect(state).toEqual(original);
  });
});
