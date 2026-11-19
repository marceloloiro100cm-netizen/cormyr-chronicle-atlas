import {describe,expect,it} from 'vitest';
import {monthlyStep} from './firebase-house-monthly';
const state=(projects:unknown[],holdings:unknown[],month=24300)=>({month,projects,holdings}) as never;
describe('processamento mensal das Casas no Firebase',()=>{
  it('conclui obras vencidas e move a ficha para o mês oficial',()=>{
    const s=state([{holdingId:'h1',start:24299,duration:1,modifier:0,status:'building'},
      {holdingId:'h2',start:24300,duration:3,modifier:0,status:'building'}],
      [{id:'h1',status:'building'},{id:'h2',status:'building'}]);
    const r=monthlyStep(s,24301)!;
    expect(r.state.month).toBe(24301);
    expect(r.completed).toBe(1);
    expect(r.state.holdings.find((h:{id:string})=>h.id==='h1')?.status).toBe('active');
    expect(r.state.holdings.find((h:{id:string})=>h.id==='h2')?.status).toBe('building');
  });
  it('não retrocede nem salta mais de 120 meses',()=>{
    expect(monthlyStep(state([],[],24300),24299)).toBeNull();
    expect(monthlyStep(state([],[],24300),24300+121)).toBeNull();
  });
});
