import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {FirebaseHouseCourtDomains,readFirebaseCourtDomains} from './FirebaseHouseCourtDomains';

afterEach(cleanup);
const state={
  court:[
    {id:'p1',name:'Ser Quendolin',role:'Castelão',notes:'Zela pela muralha'},
    {id:'p2',name:'Lady Maria',role:'Herdeira'},
  ],
  domains:[
    {id:'d1',name:'Vale do Immerflow',terrain:'hills',
      features:['river','forest'],community:'hamlet',notes:'Vale da Casa'},
  ],
};
describe('Firebase Cloud — Corte e Domínios por Casa',()=>{
  it('mostra dados registrados sem inventar membros ou locais',()=>{
    const data=readFirebaseCourtDomains(state);
    expect(data.court.total).toBe(2);
    expect(data.domains.total).toBe(1);
    expect(data.court.entries[0]?.role).toBe('Castelão');
    expect(data.domains.entries[0]?.features).toEqual(['river','forest']);
    render(<FirebaseHouseCourtDomains houseName="Evenhand" state={state}/>);
    expect(screen.getByRole('heading',{name:'Corte da Casa'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Domínios da Casa'})).toBeInTheDocument();
    expect(screen.getByText('Ser Quendolin')).toBeInTheDocument();
    expect(screen.getByText('Lady Maria')).toBeInTheDocument();
    expect(screen.getByText('Vale do Immerflow')).toBeInTheDocument();
    expect(screen.getByText('Zela pela muralha')).toBeInTheDocument();
  });
  it('distingue campo ausente de lista vazia',()=>{
    const missing=readFirebaseCourtDomains({});
    expect(missing.court.total).toBeNull();
    expect(missing.domains.total).toBeNull();
    const {unmount}=render(<FirebaseHouseCourtDomains houseName="Evenhand" state={{}}/>);
    expect(screen.getByText('Corte não disponível neste snapshot.')).toBeInTheDocument();
    unmount();
    render(<FirebaseHouseCourtDomains houseName="Evenhand" state={{court:[],domains:[]}}/>);
    expect(screen.getByText('Nenhum integrante registrado.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum domínio registrado.')).toBeInTheDocument();
  });
  it('não expõe controles de escrita ou links externos',()=>{
    const {container}=render(<FirebaseHouseCourtDomains houseName="Evenhand" state={state}/>);
    expect(container.querySelector('button,input,form,a,img,[contenteditable]')).toBeNull();
  });
  it('escapa conteúdo potencialmente malicioso e ignora imagem remota',()=>{
    const {container}=render(<FirebaseHouseCourtDomains houseName="Evenhand" state={{
      court:[{name:'<script>alert(1)</script>',notes:'<img src=x onerror=attack()>'}],
      domains:[{name:'Vale',image:'https://example.invalid/private.png'}],
    }}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=attack()>')).toBeInTheDocument();
    expect(container.querySelector('script,img')).toBeNull();
  });
  it('não declara registros completos acima do limite ou com entradas inválidas',()=>{
    const court=Array.from({length:62},(_,i)=>({name:'Pessoa '+i}));
    const domains=Array.from({length:83},(_,i)=>({name:'Domínio '+i}));
    const data=readFirebaseCourtDomains({court,domains});
    expect(data.court.total).toBe(62);
    expect(data.court.entries).toHaveLength(60);
    expect(data.court.limited).toBe(true);
    expect(data.domains.total).toBe(83);
    expect(data.domains.entries).toHaveLength(80);
    expect(data.domains.limited).toBe(true);
    const malformed=readFirebaseCourtDomains({court:[null,{name:'Preservada'}],domains:[false]});
    expect(malformed.court.invalid).toBe(true);
    expect(malformed.court.entries).toHaveLength(1);
    const {container}=render(<FirebaseHouseCourtDomains houseName="Evenhand" state={{court,domains}}/>);
    expect(container.querySelectorAll('article')).toHaveLength(140);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
  it('não modifica o snapshot original ao compor o painel',()=>{
    const input=structuredClone(state);
    readFirebaseCourtDomains(input);
    expect(input).toEqual(state);
  });
});
