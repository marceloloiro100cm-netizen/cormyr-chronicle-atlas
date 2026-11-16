import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {FirebaseOperationalHouseEconomy} from './FirebaseOperationalHouseEconomy';
import type {OperationalEconomyView} from '@/lib/house/firebase-operational-house-read';
import {zeroResources} from '@/lib/house/types';

afterEach(cleanup);
const all={...zeroResources(),defense:200};
const empty={...zeroResources()};
const summary:OperationalEconomyView={
  available:true,readOnly:true,houseId:'house-a',houseName:'Evenhand',
  version:1,sourceSheetVersion:3,calendarVersion:5,month:1522*12+1,
  updatedAt:null,
  balances:{total:all,allocated:empty,committed:{...empty,defense:10},
    available:{...all,defense:190}},
  holdings:[{id:'h1',name:'<script>alert(1)</script>',
    status:'building',domainName:'Vale de Ferlin'}],
  holdingsTotal:1,holdingsTruncated:false,
  projects:[{id:'p1',name:'Ampliação',status:'building',
    holdingName:'Torre Azul',start:1522*12+1,duration:4}],
  projectsTotal:1,projectsTruncated:false,
};
describe('Firebase Cloud — painel econômico operacional',()=>{
  it('distingue explicitamente ficha histórica sem estado operacional',()=>{
    render(<FirebaseOperationalHouseEconomy summary={null}/>);
    expect(screen.getByText(/Estado econômico operacional ainda não disponível/))
      .toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('mostra os sete recursos e versão sem qualquer controle de escrita',()=>{
    const {container}=render(<FirebaseOperationalHouseEconomy summary={summary}/>);
    expect(screen.getByText(/Versão operacional:/)).toBeInTheDocument();
    expect(screen.getByText('Sete recursos no estado operacional conciliado'))
      .toBeInTheDocument();
    expect(screen.getByText('190')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });
  it('escapa nomes de posses e não injeta HTML da origem',()=>{
    const {container}=render(<FirebaseOperationalHouseEconomy summary={summary}/>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });
  it('sinaliza exibição parcial sem fingir completar o inventário',()=>{
    const reduced={...summary,holdingsTotal:200,holdingsTruncated:true,
      projectsTotal:99,projectsTruncated:true};
    render(<FirebaseOperationalHouseEconomy summary={reduced}/>);
    expect(screen.getByText(/primeiras 100 posses/)).toBeInTheDocument();
    expect(screen.getByText(/primeiros 75 projetos/)).toBeInTheDocument();
  });
});
