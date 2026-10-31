import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {MilitaryAssets,militaryPurchaseReadiness} from '@/components/house/military-assets';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {MILITARY_HOLDINGS} from '@/lib/house/unit-progression';
import {newHouseState,type Holding} from '@/lib/house/types';

const makeState=()=>{
 const s=newHouseState('military-cards-test');
 s.domains=[{id:'dom',name:'Vale',terrain:'hills',features:[],notes:''}];
 return s;
};
const master=CORE_CATALOG.find(i=>i.id==='pros-master-of-arms')!;
const cardFor=(name:string)=>{
 const label=screen.getByText(name,{selector:'small'});
 const card=label.closest('details');
 if(!card)throw Error('Card ausente: '+name);
 return card as HTMLElement;
};
const createHolding=(id:string,name:string):Holding=>({
 id:'hold-test',itemId:id,name,domainId:'dom',costs:[],effects:[],
 ruleVersion:'test',source:'test',status:'active'
});
describe('cards militares e compra vinculada ao patrimônio',()=>{
 it('exibe todos os itens militares definidos no catálogo, inclusive fortificações, portos e melhorias',()=>{
  const ids=new Set(CORE_CATALOG.map(i=>i.id));
  expect(MILITARY_HOLDINGS.length).toBeGreaterThan(40);
  expect(new Set(MILITARY_HOLDINGS).size).toBe(MILITARY_HOLDINGS.length);
  expect(MILITARY_HOLDINGS.every(id=>ids.has(id))).toBe(true);
  render(<MilitaryAssets state={makeState()} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  expect(cardFor('Mestre de Armas')).toBeInTheDocument();
  expect(cardFor('Academia Militar')).toBeInTheDocument();
  expect(cardFor('Docas Secas')).toBeInTheDocument();
  expect(cardFor('Castelo')).toBeInTheDocument();
  expect(within(cardFor('Mestre de Armas')).getByText('Não adquirido')).toBeInTheDocument();
 });
 it('bloqueia a compra quando não há saldo suficiente, mas deixa as regras acessíveis',()=>{
  const s=makeState(),onBuy=vi.fn();
  expect(militaryPurchaseReadiness(master,s)).toBe('money');
  render(<MilitaryAssets state={s} canEdit busy={false} onRename={async()=>true} onBuy={onBuy}/>);
  const card=cardFor('Mestre de Armas');
  fireEvent.click(within(card).getByText('Mestre de Armas'));
  expect(within(card).getByText('Custo e regras de compra')).toBeVisible();
  const buy=within(card).getByRole('button',{name:'Sem recursos'});
  expect(buy).toBeDisabled();
  fireEvent.click(buy);
  expect(onBuy).not.toHaveBeenCalled();
 });
 it('libera comprar usando o mesmo catálogo e identifica a posse adquirida pelo nome',()=>{
  const s=makeState(),onBuy=vi.fn();s.base.wealth=30;s.base.power=35;
  expect(militaryPurchaseReadiness(master,s)).toBe('ready');
  const view=render(<MilitaryAssets state={s} canEdit busy={false} onRename={async()=>true} onBuy={onBuy}/>);
  const card=cardFor('Mestre de Armas');
  fireEvent.click(within(card).getByText('Mestre de Armas'));
  fireEvent.click(within(card).getByRole('button',{name:'Comprar'}));
  expect(onBuy).toHaveBeenCalledWith(master.id);
  view.rerender(<MilitaryAssets state={{...s,holdings:[createHolding(master.id,'Mestre Alerion')]}} canEdit busy={false} onRename={async()=>true} onBuy={onBuy}/>);
  expect(within(cardFor('Mestre de Armas')).getByText('Mestre Alerion')).toBeInTheDocument();
  expect(within(cardFor('Mestre de Armas')).queryByRole('button',{name:'Comprar'})).not.toBeInTheDocument();
 });
 it('permite minimizar e expandir sem perder as posses',()=>{
  render(<MilitaryAssets state={makeState()} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Minimizar'}));
  expect(screen.queryByText('Mestre de Armas',{selector:'small'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Expandir'}));
  expect(cardFor('Mestre de Armas')).toBeInTheDocument();
 });
});
