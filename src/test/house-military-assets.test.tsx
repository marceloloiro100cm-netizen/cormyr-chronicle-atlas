import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {MilitaryAssets,militaryPurchaseReadiness} from '@/components/house/military-assets';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {MILITARY_HOLDINGS,MILITARY_HOLDING_BENEFITS,renameMilitaryHolding} from '@/lib/house/unit-progression';
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
 it('exibe apenas os 33 investimentos com efeito militar próprio verificado',()=>{
  const ids=new Set(CORE_CATALOG.map(i=>i.id));
  expect(MILITARY_HOLDINGS).toHaveLength(33);
  expect(Object.keys(MILITARY_HOLDING_BENEFITS)).toHaveLength(33);
  expect(Object.values(MILITARY_HOLDING_BENEFITS).every(text=>text.trim().length>10)).toBe(true);
  expect(new Set(MILITARY_HOLDINGS).size).toBe(MILITARY_HOLDINGS.length);
  expect(MILITARY_HOLDINGS.every(id=>ids.has(id))).toBe(true);
  const {container}=render(<MilitaryAssets state={makeState()} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  expect(container.querySelectorAll('.military-asset-card')).toHaveLength(33);
  expect(cardFor('Mestre de Armas')).toBeInTheDocument();
  expect(cardFor('Academia Militar')).toBeInTheDocument();
  expect(cardFor('Docas Secas')).toBeInTheDocument();
  expect(cardFor('Castelo')).toBeInTheDocument();
  expect(within(cardFor('Mestre de Armas')).getByText('Não adquirido')).toBeInTheDocument();
  expect(within(cardFor('Mestre de Armas')).getByText(MILITARY_HOLDING_BENEFITS['pros-master-of-arms']!,{selector:'.military-asset-short'})).toBeInTheDocument();
  expect(cardFor('Produção de Alcatrão')).toBeInTheDocument();
  expect(cardFor('Gangues de Rua')).toBeInTheDocument();
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
 it('remove todos os 18 itens civis ou indiretos da lista antiga',()=>{
  const excluded=[
   'pros-charcoal','pros-dog-kennels','pros-dog-kennels--guard-dogs',
   'pros-fur-trade','pros-horse-husbandry','pros-timber',
   'pros-annual-festivals','pros-seasonal-festivals','pros-monthly-festivals',
   'pros-bailiffs','pros-bailiffs--investigative-training','pros-magistrate',
   'pros-abbey','pros-gambling-dens','pros-port','pros-marketplace',
   'pros-slave-market','pros-slave-market--soldier-slaves'
  ];
  expect(excluded).toHaveLength(18);
  excluded.forEach(id=>expect(MILITARY_HOLDINGS).not.toContain(id));
  render(<MilitaryAssets state={makeState()} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  ['Carvoaria','Comércio de Peles','Canis','Porto','Abadia','Magistrado'].forEach(name=>
   expect(screen.queryByText(name,{selector:'small'})).not.toBeInTheDocument());
  // As melhorias de unidades continuam listadas mesmo se a posse principal for civil.
  ['Armadilheiros','Cães de Guerra','Docas Secas','Esportes Sangrentos'].forEach(name=>
   expect(cardFor(name)).toBeInTheDocument());
 });
 it('mostra requisito civil somente nos detalhes e permite comprar melhoria após obtê-lo',()=>{
  const s=makeState();s.base.wealth=30;
  const trappers=CORE_CATALOG.find(x=>x.id==='pros-fur-trade--trappers')!;
  expect(militaryPurchaseReadiness(trappers,s)).toBe('requirements');
  const {rerender}=render(<MilitaryAssets state={s} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  const card=cardFor('Armadilheiros');
  fireEvent.click(within(card).getByText('Armadilheiros'));
  expect(within(card).getByText(/Pré-requisito civil: Comércio de Peles/)).toBeVisible();
  expect(within(card).getByRole('button',{name:'Pré-requisitos pendentes'})).toBeDisabled();
  const withCivilParent={...s,holdings:[createHolding('pros-fur-trade','Comércio do Vale')]};
  expect(militaryPurchaseReadiness(trappers,withCivilParent)).toBe('ready');
  rerender(<MilitaryAssets state={withCivilParent} canEdit busy={false} onRename={async()=>true} onBuy={()=>{}}/>);
  expect(within(cardFor('Armadilheiros')).getByRole('button',{name:'Comprar'})).toBeEnabled();
  expect(screen.queryByText('Comércio de Peles',{selector:'small'})).not.toBeInTheDocument();
  expect(withCivilParent.holdings).toHaveLength(1);
 });
 it('não autoriza renomear posses civis pelo editor militar, sem afetar o patrimônio',()=>{
  const state=makeState();
  state.holdings=[createHolding('pros-charcoal','Carvoaria Histórica')];
  expect(()=>renameMilitaryHolding(state,{holdingId:'hold-test',name:'Carvoaria Editada'}))
   .toThrow('Estrutura militar indisponível');
  expect(state.holdings[0]?.name).toBe('Carvoaria Histórica');
 });

});
