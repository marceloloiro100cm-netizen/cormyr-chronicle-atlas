import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {newHouseState} from './types';
import {balances} from './engine';
import {calculateFirebaseHouseEconomy,verifiedEconomicState}
  from './firebase-economic-readonly';
import {FirebaseHouseBalances}
  from '@/components/houses/FirebaseHouseBalances';

afterEach(cleanup);
function fixture(){
  const s=newHouseState('house-a','Helmlands',35);
  s.phase='active';
  for(const r of ['defense','influence','lands','law','population','power','wealth'] as const)
    s.base[r]=60;
  s.domains.push({id:'domain-a',name:'Terras da Ponte',
    terrain:'plains',features:[],notes:''});
  return s;
}
describe('Firebase economic balances use canonical rules',()=>{
  it('matches the original engine for complete state with allocation',()=>{
    const s=fixture();
    s.holdings.push({
      id:'mine-1',itemId:'pros-basic-mine',name:'Mina',
      domainId:'domain-a',source:'Guerra dos Tronos',
      costs:[{resource:'wealth',mode:'allocation',amount:5}],
      effects:[],ruleVersion:'test',status:'active',
    });
    const result=calculateFirebaseHouseEconomy(s);
    expect(result).not.toBeNull();
    expect(result!.balances).toEqual(balances(s));
    expect(result!.balances.available.wealth).toBe(55);
    expect(result!.balances.allocated.wealth).toBe(5);
  });
  it('never invents missing numbers or incomplete collection fields',()=>{
    const s=fixture();
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
  it('rejects abnormal resources and preserves original snapshots',()=>{
    const s=fixture(),original=structuredClone(s);
    calculateFirebaseHouseEconomy(s);
    expect(s).toEqual(original);
    expect(calculateFirebaseHouseEconomy({...s,permanent:{
      ...s.permanent,defense:1e300,
    }})).toBeNull();
  });
  it('renders canonical amounts but no second construction or purchasing form',()=>{
    const s=fixture();
    const {container}=render(<FirebaseHouseBalances
      houseName="Evenhand" state={s}/>);
    expect(screen.getByText('Balanço consolidado dos recursos')).toBeInTheDocument();
    expect(screen.getByText('Total, alocação e saldo disponível · Evenhand')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(container.querySelector('button,form,input,select,a')).toBeNull();
    expect(container.textContent).not.toContain('Simular custos');
  });
  it('malformed snapshot fails closed and hostile House name is escaped',()=>{
    const s=fixture();
    const {container,rerender}=render(<FirebaseHouseBalances
      houseName="Evenhand" state={{...s,units:null}}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Apuração indisponível');
    rerender(<FirebaseHouseBalances houseName="<img src=x onerror=alert(1)>"
      state={s}/>);
    expect(screen.getByText('Total, alocação e saldo disponível · <img src=x onerror=alert(1)>'))
      .toBeInTheDocument();
    expect(container.querySelector('img,script')).toBeNull();
  });
  it('negative resource availability is shown rather than silently corrected',()=>{
    const s=fixture();
    s.base.wealth=0;
    s.holdings.push({
      id:'large-1',itemId:'pros-basic-mine',name:'Mina',
      domainId:'domain-a',source:'Guerra dos Tronos',
      costs:[{resource:'wealth',mode:'allocation',amount:8}],
      effects:[],ruleVersion:'test',status:'active',
    });
    render(<FirebaseHouseBalances houseName="Evenhand" state={s}/>);
    expect(screen.getByRole('status')).toHaveTextContent('saldo disponível negativo');
    expect(calculateFirebaseHouseEconomy(s)?.balances.available.wealth).toBe(-8);
  });
});
