import {describe,it,expect} from 'vitest';
import {selectUndoSnapshot} from '@/lib/house/undo';
import {linkSourceTotals} from '@/lib/house/source-link';
import {balances} from '@/lib/house/engine';
import {newHouseState,RESOURCE_KEYS} from '@/lib/house/types';

describe('lote 2 — rascunhos e dados preservados',()=>{
 const row=(action:string,id:string)=>({action,before_state:{schemaVersion:1,id}});
 it('faz três undos consecutivos sem refazer o undo anterior',()=>{
  const old=[row('purchase','third'),row('purchase','second'),row('draft','first')];
  expect(selectUndoSnapshot(old).before_state).toEqual({schemaVersion:1,id:'third'});
  expect(selectUndoSnapshot([row('undo','u1'),...old]).before_state).toEqual({schemaVersion:1,id:'second'});
  expect(selectUndoSnapshot([row('undo','u2'),row('undo','u1'),...old]).before_state).toEqual({schemaVersion:1,id:'first'});
  expect(()=>selectUndoSnapshot([row('undo','u3'),row('undo','u2'),row('undo','u1'),...old])).toThrow('Nada mais');
 });
 it('proíbe desfazer rolagens iniciais, históricas ou bônus individuais',()=>{
  for(const action of ['roll','foundation_roll','history_roll','member_bonus'])
   expect(()=>selectUndoSnapshot([row(action,'protected')])).toThrow('Rolagens auditadas');
 });
 it('não reverte importações nem envio para revisão',()=>{
  for(const action of ['import','submit'])expect(()=>selectUndoSnapshot([row(action,'protected')])).toThrow('exigem correção');
 });
 it('conciliar totais importados evita somar bônus da região duas vezes',()=>{
  const s=newHouseState('harcourt');s.identity.region='swordmark';
  s.base={defense:10,influence:15,lands:10,law:20,population:30,power:12,wealth:10};
  s.regionalApplied=true;
  s.permanent.wealth=4;
  const totals={defense:55,influence:30,lands:27,law:40,population:44,power:38,wealth:60};
  const next=linkSourceTotals(s,totals,'record:source:v1');
  expect(next.method).toBe('import');
  expect(next.regionalApplied).toBe(false);
  expect(next.importSources).toHaveLength(1);
  expect(balances(next).total).toEqual(totals);
  expect(RESOURCE_KEYS.reduce((sum,k)=>sum+balances(next).total[k],0)).toBe(294);
  expect(s.permanent.wealth).toBe(4);
  expect(s.regionalApplied).toBe(true);
  expect(()=>linkSourceTotals(next,totals,'record:again:v2')).toThrow('já vinculada');
 });
 it('recusa total importado que não cobre os investimentos já feitos',()=>{
  const s=newHouseState('house');s.holdings.push({
   id:'tower',itemId:'tower',name:'Torre',domainId:'d',status:'active',
   costs:[{resource:'defense',amount:30,mode:'allocation'}],effects:[],source:'x',ruleVersion:'1'
  });
  const totals={defense:5,influence:5,lands:5,law:5,population:5,power:5,wealth:5};
  expect(()=>linkSourceTotals(s,totals,'record:old')).toThrow('não cobrem');
 });
});
