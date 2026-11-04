import {describe,it,expect,vi} from 'vitest';
import {render,screen,within,fireEvent} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {HouseAssetCard} from '@/components/house/asset-card';
import {HouseAssetCatalog} from '@/components/house/asset-catalog';
import {MilitaryAssets} from '@/components/house/military-assets';
import {CORE_CATALOG} from '@/lib/house/catalog';
import {SPY_HOLDING_ID_SET} from '@/lib/espionage/spy-defense';
import {newHouseState,type HouseState,type Holding} from '@/lib/house/types';

function state():HouseState{
 const s=newHouseState('standard-cards');
 s.domains=[{id:'vale',name:'Vale do Meio',terrain:'hills',features:[],notes:''}];
 s.base.lands=35;s.base.defense=50;s.base.wealth=50;
 return s;
}
const holding=(id:string,name:string):Holding=>({
 id:'h-'+id,itemId:id,name,domainId:'vale',costs:[],effects:[],ruleVersion:'test',
 source:'test',status:'active',
});
const common={canEdit:true,busy:false,onBuy:vi.fn(),
 onCondition:vi.fn().mockResolvedValue(true)};
function renderCatalog(section:'domains'|'fortifications'|'economy'|'spy',data=state()){
 return render(<HouseAssetCatalog section={section} state={data} catalog={CORE_CATALOG}
  {...common}/>);
}
describe('Padrão reutilizável de quadros da Casa',()=>{
 it('tem o mesmo visual, semântica e expansão em todas as abas',()=>{
  const view=render(<HouseAssetCard title="Construção de teste" status="Não adquirido"
   description="Benefício breve" icon={<span>◆</span>} inactive>
   <h5>Custo e regras de compra</h5><p>10 Riqueza</p>
  </HouseAssetCard>);
  const card=screen.getByText('Construção de teste').closest('details')!;
  expect(card).toHaveClass('military-asset-card','house-asset-card','military-asset-inactive');
  expect(within(card).getByText('Não adquirido')).toBeInTheDocument();
  fireEvent.click(within(card).getByText('Construção de teste'));
  expect(within(card).getByText('Custo e regras de compra')).toBeVisible();
  view.unmount();
 });
 it('Terra: indica terreno principal existente, catálogo não adquirido, descrição e custo',()=>{
  renderCatalog('domains');
  const hills=screen.getByTestId('house-catalog-asset-hills');
  const plains=screen.getByTestId('house-catalog-asset-plains');
  expect(within(hills).getByText('Vale do Meio')).toBeInTheDocument();
  expect(within(plains).getByText('Não adquirido')).toBeInTheDocument();
  fireEvent.click(within(plains).getByText('Planície',{selector:'small'}));
  expect(within(plains).getByText('Custo e regras de compra')).toBeVisible();
  expect(within(plains).getByText(/5 Terras/)).toBeInTheDocument();
 });
 it('Fortificações: compra direta usa o mesmo fluxo validado e mostra o bônus',()=>{
  const s=state();const onBuy=vi.fn();
  render(<HouseAssetCatalog section="fortifications" state={s} catalog={CORE_CATALOG}
   canEdit busy={false} onBuy={onBuy} onCondition={common.onCondition}/>);
  const card=screen.getByTestId('house-catalog-asset-castle');
  expect(within(card).getByText('Não adquirido')).toBeInTheDocument();
  fireEvent.click(within(card).getByText('Castelo',{selector:'small'}));
  expect(within(card).getAllByText(/\+8 de Defesa às unidades situadas/).length).toBeGreaterThan(0);
  fireEvent.click(within(card).getByRole('button',{name:'Comprar'}));
  expect(onBuy).toHaveBeenCalledWith('castle');
 });
 it('Economia: mostra posse adquirida pelo nome, benefícios e navegação do catálogo',()=>{
  const s=state();s.holdings=[holding('godswood','Bosque da Família')];
  renderCatalog('economy',s);
  fireEvent.change(screen.getByLabelText('Buscar quadro'),{target:{value:'bosque sagrado'}});
  const card=screen.getByTestId('house-catalog-asset-godswood');
  expect(within(card).getByText('Bosque da Família')).toBeInTheDocument();
  fireEvent.click(within(card).getByText('Bosque Sagrado / Santuário Ancestral',{selector:'small'}));
  expect(within(card).getByText('Bônus, efeitos e habilidades')).toBeVisible();
  expect(within(card).getByText('Custo e regras de compra')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Buscar quadro'),{target:{value:'carvoaria'}});
  expect(screen.getByTestId('house-catalog-asset-pros-charcoal')).toBeInTheDocument();
  expect(screen.queryByTestId('house-catalog-asset-godswood')).not.toBeInTheDocument();
 });
 it('Economia: filtros de adquiridos e não adquiridos combinam com busca e categoria',()=>{
  const s=state();
  s.holdings=[holding('godswood','Bosque da Família'),
   {...holding('pros-charcoal','Carvoaria em obras'),status:'building'}];
  renderCatalog('economy',s);
  const acquisition=screen.getByLabelText('Aquisição');
  fireEvent.change(acquisition,{target:{value:'acquired'}});
  expect(screen.getByTestId('house-catalog-asset-godswood')).toBeInTheDocument();
  expect(screen.getByTestId('house-catalog-asset-pros-charcoal')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar quadro'),{target:{value:'carvoaria'}});
  expect(screen.getByTestId('house-catalog-asset-pros-charcoal')).toBeInTheDocument();
  expect(screen.queryByTestId('house-catalog-asset-godswood')).not.toBeInTheDocument();
  fireEvent.change(acquisition,{target:{value:'unacquired'}});
  expect(screen.queryByTestId('house-catalog-asset-pros-charcoal')).not.toBeInTheDocument();
  expect(screen.getByText('Nenhuma posse encontrada para estes filtros.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar quadro'),{target:{value:''}});
  expect(screen.queryByTestId('house-catalog-asset-godswood')).not.toBeInTheDocument();
  expect(screen.queryByTestId('house-catalog-asset-pros-charcoal')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Categoria'),{target:{value:'estate'}});
  expect(screen.queryByTestId('house-catalog-asset-godswood')).not.toBeInTheDocument();
  fireEvent.change(acquisition,{target:{value:'all'}});
  expect(screen.getByLabelText('Aquisição')).toHaveValue('all');
 });
 it('prioriza os adquiridos nas quatro abas, inclusive terrenos registrados diretamente e obras',()=>{
  const cases=[
   {section:'domains' as const, accepts:(category:string,id:string)=>
    ['terrain','feature','community'].includes(category)},
   {section:'fortifications' as const,accepts:(category:string,id:string)=>
    category==='fortification'},
   {section:'economy' as const,accepts:(category:string,id:string)=>
    ['estate','lifestyle','personage','settlement','improvement','equipment','vassal'].includes(category)},
   {section:'spy' as const,accepts:(category:string,id:string)=>
    ['estate','personage','improvement','settlement'].includes(category)&&SPY_HOLDING_ID_SET.has(id)},
  ];
  for(const {section,accepts} of cases){
   const eligible=CORE_CATALOG.filter(item=>accepts(item.category,item.id));
   expect(eligible.length).toBeGreaterThan(1);
   const purchased=eligible[eligible.length-1]!;
   const s=state();
   if(section==='domains'){
    // Main terrain, feature and community are owned by the domain even
    // without a matching entry in the holdings ledger.
    if(purchased.category==='terrain')s.domains[0]!.terrain=purchased.id;
    else if(purchased.category==='feature')s.domains[0]!.features=[purchased.id];
    else s.domains[0]!.community=purchased.id;
   }else{
    s.holdings=[{...holding(purchased.id,'Obra comprada'),status:'building'}];
   }
   const view=renderCatalog(section,s);
   const cards=screen.getAllByTestId(/^house-catalog-asset-/);
   expect(cards[0]).toHaveAttribute('data-testid','house-catalog-asset-'+purchased.id);
   expect(cards[0]).not.toHaveClass('military-asset-inactive');
   expect(cards.slice(1).some(card=>card.classList.contains('military-asset-inactive'))).toBe(true);
   view.unmount();
  }
 });
 it('não mostra filtro de aquisição em Terras ou Fortificações',()=>{
  const view=renderCatalog('domains');
  expect(screen.queryByLabelText('Aquisição')).not.toBeInTheDocument();
  view.unmount();
  renderCatalog('fortifications');
  expect(screen.queryByLabelText('Aquisição')).not.toBeInTheDocument();
 });
 it('não oferece compra quando não há saldo ou permissão; não altera estado',()=>{
  const s=state();s.base.defense=0;
  render(<HouseAssetCatalog section="fortifications" state={s} catalog={CORE_CATALOG}
   canEdit busy={false} onBuy={common.onBuy} onCondition={common.onCondition}/>);
  const card=screen.getByTestId('house-catalog-asset-castle');
  fireEvent.click(within(card).getByText('Castelo',{selector:'small'}));
  expect(within(card).getByRole('button',{name:'Sem recursos'})).toBeDisabled();
  expect(s.holdings).toHaveLength(0);
 });
 it('Exército continua utilizando o mesmo componente e classes, sem regressão',()=>{
  const view=render(<MilitaryAssets state={state()} canEdit={false} busy={false}
   onRename={async()=>true} onBuy={()=>{}}/>);
  expect(view.container.querySelectorAll('.house-asset-card').length).toBe(33);
 });
 it('o botão Comprar abre uma posse pré-selecionada nas três abas',()=>{
  const source=readFileSync('src/components/house/hub.tsx','utf8');
  expect(source).toContain('initialItemId={purchaseItemId}');
  expect(source).toContain('section="domains"');
  expect(source).toContain('section={section}');
  expect(source).toContain("section==='fortifications'||section==='economy'");
  expect(source).toContain('setPurchaseItemId(id);setBuy(true);');
 });
});
