import {describe,expect,it} from 'vitest';
import {monthFromHarptosDate,projectTemporalNotice,validateHouseTimeImpact}
 from '@/lib/calendar/house-time-impact';
import {advance} from '@/lib/house/engine';
import {newHouseState} from '@/lib/house/types';

const impact=()=>({
 calendar_version:4,base_month:1522*12,target_month:1522*12+2,
 total:3,eligible:1,ahead:1,drafts:1,invalid:0,aligned_or_historical:0,
 project_candidates:2,backdated:false,
 houses:[
  {house_id:'a',version:1,month:1522*12,status:'advance',project_candidates:2},
  {house_id:'b',version:5,month:1522*12+3,status:'ahead',project_candidates:0},
  {house_id:'draft',version:1,month:0,status:'draft',project_candidates:0},
 ],
});
describe('Hub Temporal · Lote 9 · posses, prazos e serviços',()=>{
 it('confere toda a prévia oficial e rejeita duplicidade, versões antigas e contagens incoerentes',()=>{
  expect(validateHouseTimeImpact(impact(),4,1522*12+2).eligible).toBe(1);
  expect(()=>validateHouseTimeImpact(impact(),3,1522*12+2)).toThrow();
  expect(()=>validateHouseTimeImpact({...impact(),total:2},4,1522*12+2)).toThrow();
  expect(()=>validateHouseTimeImpact({...impact(),project_candidates:1},4,1522*12+2)).toThrow();
  const input=impact();input.houses[1]!.house_id='a';
  expect(()=>validateHouseTimeImpact(input,4,1522*12+2)).toThrow();
 });
 it('converte apenas mês e ano Harptos, jamais semana de missiva',()=>{
  expect(monthFromHarptosDate({year:1522,month:11})).toBe(1522*12+11);
  expect(monthFromHarptosDate({year:1523,month:0})).toBe(1523*12);
  expect(()=>monthFromHarptosDate({year:0,month:0})).toThrow();
  expect(()=>monthFromHarptosDate({year:1522,month:12})).toThrow();
 });
 it('não declara construção concluída antes da atualização validada da Casa',()=>{
  const p={status:'building',start:1522*12,duration:2,modifier:0};
  expect(projectTemporalNotice(p,1522*12,1522*12+1)).toBe('in_progress');
  expect(projectTemporalNotice(p,1522*12,1522*12+3)).toBe('due_for_review');
  expect(projectTemporalNotice({...p,status:'completed'},1522*12+2,1522*12+3)).toBe('completed');
  expect(projectTemporalNotice({...p,status:'cancelled'},1522*12+2,1522*12+3)).toBe('cancelled');
 });
 it('reconcilia projeto dependente mesmo quando filho aparece antes do pai',()=>{
  const state=newHouseState('house','',1522*12);
  state.phase='active';state.treasury=50;
  state.projects=[
   {id:'child',holdingId:'child',name:'Torre',start:state.month,duration:2,modifier:0,status:'building',dice:[]},
   {id:'parent',holdingId:'parent',name:'Muralha',start:state.month,duration:1,modifier:0,status:'building',dice:[]},
  ];
  const bare={itemId:'tower',name:'Posse',domainId:'d',costs:[],effects:[],ruleVersion:'test',source:'test',status:'building' as const};
  state.holdings=[
   {...bare,id:'child',parentId:'parent'},
   {...bare,id:'parent'},
  ];
  const next=advance(state,state.month+3);
  expect(next.projects.map(p=>p.status)).toEqual(['completed','completed']);
  expect(next.holdings.map(h=>h.status)).toEqual(['active','active']);
  expect(next.treasury).toBe(50);
  expect(next.actions).toHaveLength(0);
  expect(next.fortunes).toHaveLength(0);
  expect(state.projects[0]?.status).toBe('building');
  expect(state.month).toBe(1522*12);
 });
});
