import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {
  FirebaseConstructionSchedule,readFirebaseConstructionSchedule,
} from './FirebaseConstructionSchedule';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';

afterEach(cleanup);
const calendar={year:1522,month:1};
const month=monthFromHarptosDate(calendar);
const state={
  month,holdings:[{id:'h1',name:'Fortaleza da Colina'}],
  projects:[
    {id:'p1',name:'Muralhas',holdingId:'h1',status:'building',
      start:month-4,duration:3,modifier:0},
    {id:'p2',name:'Nova torre',holdingId:'h1',status:'building',
      start:month,duration:4,modifier:1},
    {id:'p3',name:'Antigo dique',holdingId:'h1',status:'completed'},
    {id:'p4',name:'Capela',holdingId:'h1',status:'cancelled'},
  ],
};
describe('Firebase Cloud — cronograma de construções autorizado',()=>{
  it('reutiliza o calendário oficial e indica vencimento sem concluir obra',()=>{
    const snapshot=structuredClone(state);
    const v=readFirebaseConstructionSchedule(state,calendar);
    expect(v.available).toBe(true);
    expect(v.total).toBe(4);
    expect(v.dueCount).toBe(1);
    expect(v.rows.map(p=>p.timing)).toEqual([
      'due_for_review','in_progress','completed','cancelled',
    ]);
    expect(v.rows[0]?.deadline).toBe(month-1);
    const {container}=render(<FirebaseConstructionSchedule
      houseName="Evenhand" state={state} calendar={calendar}/>);
    expect(screen.getByText('Muralhas')).toBeInTheDocument();
    expect(screen.getByText('Prazo atingido — precisa de revisão'))
      .toBeInTheDocument();
    expect(screen.getByText('Concluído no registro histórico'))
      .toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(state).toEqual(snapshot);
  });
  it('não estima datas sem calendário ou modificador registrado',()=>{
    const noCalendar=readFirebaseConstructionSchedule(state,null);
    expect(noCalendar.dueCount).toBe(0);
    expect(noCalendar.rows[0]?.timing).toBe('unverified');
    const incomplete=readFirebaseConstructionSchedule({
      month,projects:[{id:'1',name:'Obra sem modificador',status:'building',
        start:month-1,duration:1}],
    },calendar);
    expect(incomplete.rows[0]?.timing).toBe('unverified');
    expect(incomplete.rows[0]?.deadline).toBeNull();
    render(<FirebaseConstructionSchedule houseName="Evenhand"
      state={state} calendar={null}/>);
    expect(screen.getByText(/Calendário ou referência temporal/))
      .toBeInTheDocument();
  });
  it('não presume lista vazia para ficha incompleta',()=>{
    const v=readFirebaseConstructionSchedule({month},calendar);
    expect(v.available).toBe(false);
    expect(v.total).toBeNull();
    render(<FirebaseConstructionSchedule houseName="Evenhand"
      state={{month}} calendar={calendar}/>);
    expect(screen.getByText(/Cronograma indisponível/))
      .toBeInTheDocument();
  });
  it('bloqueia HTML e não faz leitura de outra Casa',()=>{
    const injected={month,projects:[{id:'p',status:'building',
      name:'<img src=x onerror=alert(1)>',start:month,duration:1,modifier:0}],
    holdings:[]};
    const {container}=render(<FirebaseConstructionSchedule
      houseName="Evenhand" state={injected} calendar={calendar}/>);
    expect(screen.getByText('<img src=x onerror=alert(1)>'))
      .toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });
  it('limita leitura de listas extensas sem inventar total auditado',()=>{
    const items=Array.from({length:105},(_,i)=>({
      id:'p'+i,name:'Obra '+i,status:'building',
      start:month,duration:2,modifier:0,
    }));
    const v=readFirebaseConstructionSchedule({month,projects:items},calendar);
    expect(v.total).toBe(105);
    expect(v.rows).toHaveLength(100);
    expect(v.partial).toBe(true);
    expect(v.dueCount).toBeNull();
    const {container}=render(<FirebaseConstructionSchedule
      houseName="Evenhand" state={{month,projects:items}} calendar={calendar}/>);
    expect(container.querySelectorAll('article')).toHaveLength(100);
    expect(screen.getByText(/Exibição parcial ou registros inconsistentes/))
      .toBeInTheDocument();
  });
});
