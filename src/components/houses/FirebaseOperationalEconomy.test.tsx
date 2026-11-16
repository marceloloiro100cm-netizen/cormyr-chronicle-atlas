import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {FirebaseOperationalEconomy,type OperationalEconomyView}
  from './FirebaseOperationalEconomy';
import {zeroResources} from '@/lib/house/types';
afterEach(cleanup);
const zeros=zeroResources();
const view:OperationalEconomyView={
  houseId:'house-a',version:2,sourceSheetVersion:3,calendarMonth:18265,
  readOnly:true,
  balances:{total:{...zeros,defense:90},
    allocated:{...zeros,defense:10},committed:{...zeros,defense:20},
    available:{...zeros,defense:60}},
  holdingsTotal:1,projectsTotal:1,partial:false,
  holdings:[{id:'h1',itemId:'tower',name:'<img src=x onerror=attack()>',
    domainId:'d1',status:'building'}],
  projects:[{id:'p1',name:'Torre nova',holdingId:'h1',
    status:'building',start:18265,duration:3,modifier:0}],
};
describe('Firebase — visão operacional da Casa',()=>{
  it('mostra recursos atualizados sem controles de compra',()=>{
    const {container}=render(<FirebaseOperationalEconomy
      houseName="Evenhand" houseId="house-a" data={view}/>);
    expect(screen.getByText('Economia operacional · Firebase')).toBeInTheDocument();
    expect(screen.getByText('Recursos operacionais conciliados')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Posses atualizadas · 1 exibidas'));
    expect(screen.getByText('<img src=x onerror=attack()>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
  it('não exibe o estado de uma Casa diferente nem inventa zero',()=>{
    const {container}=render(<FirebaseOperationalEconomy
      houseName="Goldfin" houseId="house-b" data={view}/>);
    expect(screen.getByText(/ainda não homologada para consulta/))
      .toBeInTheDocument();
    expect(screen.queryByText('90')).toBeNull();
    expect(container.querySelector('table')).toBeNull();
  });
  it('avisa sobre listas parciais e saldo negativo sem alterar dados',()=>{
    const data:OperationalEconomyView={...view,partial:true,
      balances:{...view.balances,available:{...view.balances.available,defense:-1}}};
    const original=structuredClone(data);
    render(<FirebaseOperationalEconomy houseName="Evenhand"
      houseId="house-a" data={data}/>);
    expect(screen.getByText(/há recursos com saldo negativo/))
      .toBeInTheDocument();
    expect(screen.getByText(/Listas parciais/)).toBeInTheDocument();
    expect(data).toEqual(original);
  });
});
