import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {newHouseState} from './types';
import {balances,quote} from './engine';
import {CORE_CATALOG} from './catalog';
import {
  calculateFirebaseHouseEconomy,previewFirebaseHouseConstruction,
  verifiedEconomicState,ECONOMY_QUOTE_ITEMS,
} from './firebase-economic-readonly';
import {FirebaseHouseEconomyPlanner}
  from '@/components/houses/FirebaseHouseEconomyPlanner';

afterEach(cleanup);
function readyState(){
  const s=newHouseState('house-a','Helmlands',35);
  s.phase='active';
  for(const r of ['defense','influence','lands','law','population','power','wealth'] as const)
    s.base[r]=60;
  s.domains.push({
    id:'domain-a',name:'Terras da Ponte',terrain:'plains',
    features:[],notes:'',
  });
  return s;
}
describe('Firebase economic preview uses original GoT rules',()=>{
  it('canonical balance matches the motor original for complete state',()=>{
    const s=readyState();
    s.holdings.push({
      id:'mine-1',itemId:'pros-basic-mine',name:'Mina',
      domainId:'domain-a',source:'Guerra dos Tronos',
      costs:[{resource:'wealth',mode:'allocation',amount:5}],
      effects:[],ruleVersion:'test',status:'active',
    });
    const expected=balances(s);
    const view=calculateFirebaseHouseEconomy(s);
    expect(view).not.toBeNull();
    expect(view!.balances).toEqual(expected);
    expect(view!.balances.available.wealth).toBe(55);
    expect(view!.balances.allocated.wealth).toBe(5);
    expect(view!.domains[0]?.name).toBe('Terras da Ponte');
  });
  it('construction quote equals the canonical quotation engine',()=>{
    const s=readyState();
    const tower=CORE_CATALOG.find(i=>i.id==='tower')!;
    const canonical=quote(tower,s,'domain-a');
    const preview=previewFirebaseHouseConstruction(s,'tower','domain-a');
    expect(preview).not.toBeNull();
    expect(preview!.costs).toEqual(canonical.costs);
    expect(preview!.errors).toEqual(canonical.errors);
    expect(preview!.before).toEqual(canonical.before);
    expect(preview!.after).toEqual(canonical.after);
    expect(preview!.available).toBe(canonical.errors.length===0);
    expect(ECONOMY_QUOTE_ITEMS.some(i=>i.id==='tower')).toBe(true);
  });
  it('denies incomplete snapshots rather than replacing missing resources with 0',()=>{
    const s=readyState();
    expect(verifiedEconomicState({})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,importSources:undefined})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,base:{...s.base,wealth:undefined}})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,holdings:[{id:'x',status:'active'}]})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,units:[{destroyed:false}]})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,mailConsequences:[
      {active:true,changes:{wealth:Infinity}},
    ]})).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,creationHistory:{
      applied:false,events:[{changes:{wealth:'fake'}}],
    }})).toBeNull();
  });
  it('damaged domains and impossible numbers do not produce construction prices',()=>{
    const s=readyState();
    expect(previewFirebaseHouseConstruction(s,'tower','foreign-domain')).toBeNull();
    expect(previewFirebaseHouseConstruction(s,'other-item','domain-a')).toBeNull();
    expect(previewFirebaseHouseConstruction({
      ...s,domains:[{...s.domains[0],features:'broken'}],
    },'tower','domain-a')).toBeNull();
    expect(calculateFirebaseHouseEconomy({...s,permanent:{
      ...s.permanent,defense:1e300,
    }})).toBeNull();
  });
  it('does not alter original holdings, resources, units or projects',()=>{
    const s=readyState(),before=structuredClone(s);
    calculateFirebaseHouseEconomy(s);
    previewFirebaseHouseConstruction(s,'tower','domain-a');
    expect(s).toEqual(before);
  });
  it('renders balances, allows quotes, and provides no purchase actions',()=>{
    const s=readyState();
    const {container}=render(<FirebaseHouseEconomyPlanner
      houseName="Evenhand" state={s}/>);
    expect(screen.getByText('Balanço completo · Evenhand')).toBeInTheDocument();
    expect(screen.getByText('Simular custo de uma construção')).toBeInTheDocument();
    const [domainSelect,itemSelect]=container.querySelectorAll('select');
    expect(domainSelect).toBeTruthy();
    expect(itemSelect).toBeTruthy();
    fireEvent.change(itemSelect!,{target:{value:'castle'}});
    expect(screen.getByText('Castelo',{selector:'h4'})).toBeInTheDocument();
    expect(container.querySelector('button,form,a,input')).toBeNull();
    expect(container.textContent).not.toContain('Comprar');
  });
  it('shows malformed snapshot status and neutralizes injected domain names',()=>{
    const s=readyState();
    const {container,rerender}=render(<FirebaseHouseEconomyPlanner
      houseName="Evenhand" state={{...s,units:null}}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Apuração indisponível');
    rerender(<FirebaseHouseEconomyPlanner houseName="Evenhand"
      state={{...s,domains:[{...s.domains[0],name:'<img src=x onerror=alert(1)>'}]}}/>);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img,script')).toBeNull();
  });
});
