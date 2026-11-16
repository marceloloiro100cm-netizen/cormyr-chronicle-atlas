import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FirebaseHoldingsRoster,readFirebaseHoldings} from './FirebaseHoldingsRoster';
afterEach(cleanup);
const state={
  domains:[{id:'d1',name:'Vale do Immerflow'}],
  holdings:[
    {id:'h1',name:'Torre do Rio',status:'active',domainId:'d1',category:'fortification',source:'Arquivo original'},
    {id:'h2',name:'Mina Alta',status:'building',domainId:'d1',category:'estate'},
    {id:'h3',name:'Ponte Caída',status:'destroyed',domainId:'d1'},
  ],
  projects:[{id:'p1',holdingId:'h2',name:'Escavação',status:'building',start:10,duration:3}],
};
describe('Firebase Cloud — posses por Casa',()=>{
  it('mostra situações e projetos sem inventar conclusão',()=>{
    const v=readFirebaseHoldings(state);
    expect(v.total).toBe(3);
    expect(v.active).toBe(1);
    expect(v.building).toBe(1);
    expect(v.inactive).toBe(1);
    expect(v.rows[1]?.projects).toEqual([{name:'Escavação',status:'building',start:10,duration:3}]);
    const {container}=render(<FirebaseHoldingsRoster houseName="Evenhand" state={state}/>);
    expect(screen.getByRole('heading',{name:'Posses e construções'})).toBeInTheDocument();
    expect(screen.getByText('Torre do Rio')).toBeInTheDocument();
    expect(screen.getByText('Vale do Immerflow',{exact:false}).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Projetos vinculados · 1'));
    expect(screen.getByText(/Escavação · building/)).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
  it('nega totais derivados de fontes incompletas',()=>{
    const v=readFirebaseHoldings({holdings:[
      {name:'Sem estado'},null,{name:'Desconhecida',status:'other'},
    ]});
    expect(v.total).toBe(3);
    expect(v.unreadable).toBe(1);
    expect(v.active).toBeNull();
    expect(v.building).toBeNull();
    expect(v.inactive).toBeNull();
  });
  it('não injeta HTML da ficha e não abre outras Casas',()=>{
    const {container}=render(<FirebaseHoldingsRoster houseName="Evenhand"
      state={{holdings:[{id:'1',name:'<script>alert(1)</script>',
        status:'active',source:'<img src=x onerror=attack()>'}]}}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText(/<img src=x onerror=attack\(\)>/)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });
  it('limita cartões e não finge totais completos',()=>{
    const holdings=Array.from({length:152},(_,i)=>({
      id:String(i),name:'Posse '+i,status:'active',
    }));
    const v=readFirebaseHoldings({holdings});
    expect(v.total).toBe(152);
    expect(v.limited).toBe(true);
    expect(v.active).toBeNull();
    expect(v.rows).toHaveLength(150);
    const {container}=render(<FirebaseHoldingsRoster
      houseName="Evenhand" state={{holdings}}/>);
    expect(container.querySelectorAll('article')).toHaveLength(150);
    expect(screen.getByRole('status')).toHaveTextContent('exibição é parcial');
    expect(holdings).toHaveLength(152);
  });
  it('exibe ausência de posses sem inventar dados',()=>{
    render(<FirebaseHoldingsRoster houseName="Evenhand" state={{}}/>);
    expect(screen.getByText('Nenhuma posse registrada nesta ficha.')).toBeInTheDocument();
  });
});
