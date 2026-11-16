import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {
  FirebaseConstructionQuote,type ConstructionQuoteView,
} from './FirebaseConstructionQuote';

afterEach(cleanup);
const resources={
  defense:30,influence:20,lands:40,law:10,population:10,power:10,wealth:20,
};
const quote:ConstructionQuoteView={
  houseId:'house-a',houseName:'Evenhand',sheetVersion:3,
  domainId:'domain-a',domainName:'Vale do Immerflow',
  item:{id:'tower',name:'Torre',category:'fortification',
    duration:{months:36,dice:10,sides:6},pending:null},
  before:resources,after:{...resources,defense:20},
  costs:[{resource:'defense',amount:10,mode:'allocation'}],
  discounts:[],errors:[],purchaseEligibleByRules:true,
  readOnly:true,purchaseEnabled:false,
  snapshotReconciliationPending:true,
};
const state={
  domains:[{id:'domain-a',name:'Vale do Immerflow',terrain:'hills',
    features:[],notes:''}],
  holdings:[],
};
describe('Simulação Firebase de construções',()=>{
  it('permite consultar mas nunca mostra botão de compra ou escrita',async()=>{
    const onQuote=vi.fn(async()=>quote);
    const {container}=render(<FirebaseConstructionQuote
      houseId="house-a" state={state} onQuote={onQuote}/>);
    fireEvent.change(screen.getByRole('combobox',{name:'Item do catálogo'}),{
      target:{value:'tower'},
    });
    fireEvent.change(screen.getByRole('combobox',{name:'Domínio da Casa'}),{
      target:{value:'domain-a'},
    });
    fireEvent.click(screen.getByRole('button',{name:'Simular custos'}));
    await waitFor(()=>expect(onQuote).toHaveBeenCalledWith({
      houseId:'house-a',itemId:'tower',domainId:'domain-a',
    }));
    expect(screen.getByText('Torre · Vale do Immerflow')).toBeInTheDocument();
    expect(screen.getByText(/Compra desabilitada nesta fase/)).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')?.textContent)
      .toBe('Simular custos');
    expect(screen.queryByRole('button',{name:/comprar|confirmar compra|adquirir/i}))
      .toBeNull();
  });
  it('indica bloqueios do motor de regras sem liberar recursos',async()=>{
    const blocked={...quote,errors:['Saldo insuficiente: defense.'],
      purchaseEligibleByRules:false};
    const {container}=render(<FirebaseConstructionQuote
      houseId="house-a" state={state} onQuote={async()=>blocked}/>);
    fireEvent.change(screen.getByRole('combobox',{name:'Item do catálogo'}),{
      target:{value:'tower'},
    });
    fireEvent.change(screen.getByRole('combobox',{name:'Domínio da Casa'}),{
      target:{value:'domain-a'},
    });
    fireEvent.click(screen.getByRole('button',{name:'Simular custos'}));
    await waitFor(()=>expect(screen.getByText('Condições não atendidas'))
      .toBeInTheDocument());
    expect(container.textContent).toContain('Saldo insuficiente');
  });
  it('falha sem domínios sem enviar pedidos para outra Casa',()=>{
    const onQuote=vi.fn(async()=>quote);
    render(<FirebaseConstructionQuote houseId="house-a" state={{}}
      onQuote={onQuote}/>);
    expect(screen.getByText(/não possui domínios disponíveis/))
      .toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Simular custos'})).toBeNull();
    expect(onQuote).not.toHaveBeenCalled();
  });
});
