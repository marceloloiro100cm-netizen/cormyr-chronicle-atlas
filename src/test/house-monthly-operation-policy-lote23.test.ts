import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {newHouseState} from '@/lib/house/types';
import {houseMonthlyOperationReadiness,isMonthSensitiveHouseAction,
 MONTH_SENSITIVE_HOUSE_ACTIONS} from '@/lib/house/monthly-operation-policy';

const make=(phase:'draft'|'active'|'review'='active',month=1522*12)=>{
 const house=newHouseState('house-23');house.phase=phase;house.month=month;
 return house;
};
const official=(year:number,month:number)=>({year,month});

describe('Lote 23 · segurança temporal das operações da Casa',()=>{
 it('bloqueia todos os gastos e decisões mensais quando falta o calendário oficial',()=>{
  const result=houseMonthlyOperationReadiness(make(),null);
  expect(result).toMatchObject({allowed:false,status:'waiting'});
  expect(result.message).toContain('Data oficial indisponível');
 });
 it('bloqueia compras, recrutamento, Sorte e cerco quando a Casa está atrasada ou adiantada',()=>{
  expect(houseMonthlyOperationReadiness(make(),official(1522,2))).toMatchObject({
   allowed:false,status:'behind',
  });
  expect(houseMonthlyOperationReadiness(make(),official(1521,11))).toMatchObject({
   allowed:false,status:'ahead',
  });
  expect(houseMonthlyOperationReadiness(make(),official(1522,0))).toMatchObject({
   allowed:true,status:'aligned',
  });
 });
 it('não impede a criação original em rascunho, mas bloqueia Casa ainda em revisão',()=>{
  expect(houseMonthlyOperationReadiness(make('draft'),null)).toMatchObject({
   allowed:true,status:'draft',
  });
  expect(houseMonthlyOperationReadiness(make('review'),official(1522,0))).toMatchObject({
   allowed:false,status:'review',
  });
 });
 it('a matriz contém compras de construções, ações, recursos e operações militares',()=>{
  const actions=['purchase','fortune','alternative','convert','action',
   'spend_influence','redeem_intrigue','vassal_purchase','unit',
   'equipment','train_unit','war_hounds','broad_training','siege'];
  expect(new Set(MONTH_SENSITIVE_HOUSE_ACTIONS).size)
   .toBe(MONTH_SENSITIVE_HOUSE_ACTIONS.length);
  for(const action of actions)expect(isMonthSensitiveHouseAction(action)).toBe(true);
  for(const action of ['admin_edit','correct','sync_calendar','military_rename',
   'unit_edit','treasury_deposit','restore_legacy_effects','vassal_loyalty'])
   expect(isMonthSensitiveHouseAction(action)).toBe(false);
 });
 it('as verificações financeiras e militares são feitas novamente no servidor',()=>{
  // Source contract: backend cannot rely only on React state to approve purchases.
  const file=readFileSync(new URL('../lib/house/house.functions.ts',import.meta.url),'utf8');
  const guarded=file.indexOf("if(state.phase==='active'&&isMonthSensitiveHouseAction(data.action))");
  const rpc=file.indexOf("rpc('get_campaign_calendar')",guarded);
  const alignment=file.indexOf('requireCalendarAlignment(state,response.data',rpc);
  const unit=file.indexOf("if(data.action==='unit')");
  const equipment=file.indexOf("if(data.action==='equipment')");
  expect(guarded).toBeGreaterThan(0);
  expect(rpc).toBeGreaterThan(guarded);
  expect(alignment).toBeGreaterThan(rpc);
  expect(unit).toBeGreaterThan(alignment);
  expect(equipment).toBeGreaterThan(unit);
 });
 it('o painel impede submissões com data ausente e aplica a política nos botões militares',()=>{
  const file=readFileSync(new URL('../components/house/hub.tsx',import.meta.url),'utf8');
  expect(file).toContain('houseMonthlyOperationReadiness(query.data.state,globalCalendar.data??null)');
  expect(file).toContain('if(isMonthSensitiveHouseAction(action))');
  expect(file).toContain('canEdit={monthlyCanEdit}');
  expect(file).toContain('open={buy&&monthlyCanEdit}');
  expect(file).toContain('data-testid="house-monthly-lock"');
  expect(file.match(/disabled={!monthly.allowed\|\|busy}/g)?.length).toBeGreaterThanOrEqual(3);
 });
});
