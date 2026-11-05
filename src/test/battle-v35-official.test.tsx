import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {newHouseState,type Unit} from '@/lib/house/types';
import {createV3Game} from '@/lib/battle/v3/engine';
import {v35OfficialSources,v35ManualOutcome,v35ApplyManualLosses,
 V35_POLICY_VERSION} from '@/lib/battle/v3/official-adjudication';
import type {BattleState,BattleStack} from '@/lib/battle/domain/types';

const text=(p:string)=>readFileSync(resolve(p),'utf8');
function fixture(){
 const base=createV3Game({attackerHouseId:'evenhand-model',
  defenderHouseId:'ashkar-model',attackerCommander:'tillet',
  defenderCommander:'knight',scenario:'plain-open',opponent:'human'}).battle;
 const stackA=base.stacks.find(s=>s.side==='attacker')!;
 const stackB=base.stacks.find(s=>s.side==='defender')!;
 const toOfficial=(stack:BattleStack,houseId:string):BattleStack=>({
  ...stack,source:{kind:'house-readonly',houseId,unitId:stack.id,
   sourceVersion:4,sourceCapturedAt:'2026-11-05T00:00:00.000Z',
   officialHealth:5,officialMaxHealth:5,warnings:[]},
 });
 const a=toOfficial(stackA,'house-official-a');
 const b=toOfficial(stackB,'house-official-b');
 const initial={...base,phase:'ready' as const,stacks:[a,b]} as BattleState;
 const final={...base,phase:'completed' as const,stacks:[
  {...a,currentHp:(a.initialCount-10)*a.hpPerSoldier},
  {...b,currentHp:(b.initialCount-3)*b.hpPerSoldier},
 ]} as BattleState;
 const units=[
  {id:a.id,name:a.name,strength:a.initialCount,casualties:0,destroyed:false,
   training:'trained',notes:'Registro original'} as Unit,
  {id:b.id,name:b.name,strength:b.initialCount,casualties:0,destroyed:false,
   training:'trained',notes:'Registro original'} as Unit,
 ];
 const houseA=newHouseState('house-official-a');
 const houseB=newHouseState('house-official-b');
 houseA.units=[units[0]!];houseB.units=[units[1]!];
 return {initial,final,a,b,houseA,houseB};
}
describe('Cruzada V3.5 — aplicação oficial exclusivamente manual',()=>{
 it('recusa qualquer origem de treinamento fictício e exige duas casas oficiais',()=>{
  const base=createV3Game({attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
   attackerCommander:'tillet',defenderCommander:'knight',scenario:'plain-open',opponent:'human'}).battle;
  expect(()=>v35OfficialSources({...base,phase:'ready'},{...base,phase:'completed'})).toThrow(/fictício/i);
  const {initial,final}=fixture();
  const sources=v35OfficialSources(initial,final);
  expect(sources).toHaveLength(2);
  expect(new Set(sources.map(s=>s.houseId)).size).toBe(2);
  expect(sources.map(s=>s.tacticalCasualties).sort((a,b)=>a-b)).toEqual([3,10]);
 });
 it('valida plano completo, justificativas, limites e hash de revisão',()=>{
  const {initial,final,a,b}=fixture();
  const decisions=[
   {stackId:a.id,losses:5,note:'Cinco baixas homologadas pelo Narrador'},
   {stackId:b.id,losses:2,note:'Duas baixas homologadas pelo Narrador'},
  ];
  const result=v35ManualOutcome(initial,final,decisions);
  expect(result.policyVersion).toBe(V35_POLICY_VERSION);
  expect(result.planHash).toMatch(/^[a-f0-9]{64}$/);
  expect(v35ManualOutcome(initial,final,[...decisions].reverse()).planHash).toBe(result.planHash);
  expect(()=>v35ManualOutcome(initial,final,[decisions[0]!])).toThrow();
  expect(()=>v35ManualOutcome(initial,final,[{...decisions[0]!,losses:11},decisions[1]!]))
   .toThrow(/excedem/i);
  expect(()=>v35ManualOutcome(initial,final,[decisions[0]!,decisions[0]!])).toThrow();
  expect(()=>v35ManualOutcome(initial,final,[{...decisions[0]!,note:'ruim'},decisions[1]!])).toThrow();
 });
 it('muda somente as baixas decididas, sem converter treino em XP, Poder ou tabelas de sobreviventes',()=>{
  const {initial,final,a,b,houseA,houseB}=fixture();
  const plan=v35ManualOutcome(initial,final,[
   {stackId:a.id,losses:5,note:'Perdas confirmadas em conselho de guerra'},
   {stackId:b.id,losses:2,note:'Perdas confirmadas em conselho de guerra'},
  ]);
  const before=[{houseId:houseA.houseId,version:4,state:houseA},
   {houseId:houseB.houseId,version:4,state:houseB}];
  const updated=v35ApplyManualLosses(before,plan,'12345678-1234-4234-8234-123456789012');
  expect(updated[0]!.state.units[0]!.casualties).toBe(5);
  expect(updated[1]!.state.units[0]!.casualties).toBe(2);
  expect(before[0]!.state.units[0]!.casualties).toBe(0);
  expect(updated[0]!.state.permanent).toEqual(before[0]!.state.permanent);
  expect(updated[0]!.state.treasury).toBe(before[0]!.state.treasury);
  expect(updated[0]!.state.units[0]!.training).toBe('trained');
  expect(updated[0]!.state.units[0]!.notes).toContain('Batalha oficial');
  expect(()=>v35ApplyManualLosses([{...before[0]!,version:5},before[1]!],
   plan,'12345678-1234-4234-8234-123456789012')).toThrow(/versão/i);
 });
 it('usa RPC único multi-casa, aprovação prévia e chaves de idempotência',()=>{
  const sql=text('docs/battle/sql/0079_battle_v35_adjudication.sql');
  const server=text('src/lib/battle/v3/official.functions.ts');
  const ui=text('src/components/battle/BattleV35Admin.tsx');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('ORDER BY house_id FOR UPDATE');
  expect(sql).toContain('UPDATE public.noble_house_sheets SET state=p_after_a,version=version+1');
  expect(sql).toContain('UPDATE public.noble_house_sheets SET state=p_after_b,version=version+1');
  expect(sql).toContain("v.status<>'approved'");
  expect(sql).toContain('v.apply_id=p_operation');
  expect(sql).toContain('TO service_role');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(server).toContain("process.env['ENABLE_BATTLE_V35_APPLY']!=='true'");
  expect(server).toContain('await narrator(db)');
  expect(server).toContain('verifyReplay(');
  expect(server).toContain('v35ManualOutcome');
  expect(server).toContain('v35ApplyManualLosses');
  expect(server).not.toContain('resolveSurvivors(');
  expect(ui).toContain('APROVAR BAIXAS');
  expect(ui).toContain('APLICAR NAS CASAS');
  expect(ui).toContain('BATTLE_V35_APPLY_UI_ENABLED');
 });
});
