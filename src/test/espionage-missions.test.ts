import {describe,it,expect} from 'vitest';
import {createSpyMissionDraft,playerSpyMissionPreview} from '@/lib/espionage/missions';
import {resolveSpyDifficulty,visibleSpyDifficulty} from '@/lib/espionage/difficulty.server';
import type {SpyAsset} from '@/lib/espionage/contracts';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const agent:SpyAsset={id:ids[0]!,ownerHouseId:'evenhand',kind:'network_cell',label:'Célula',
 sourceHoldingId:ids[1]!,sourceRef:'base:'+ids[1]+':0',currentLocationId:ids[2]!,
 status:'available',rulesVersion:'CCA-ESP-MVP-001:v1',version:1};
const draft=()=>createSpyMissionDraft({id:ids[1]!,ownerHouseId:'evenhand',asset:agent,
 existingOperations:[],targetType:'house',targetId:'house-target',kind:'military',
 requestedFields:['house_army','house_troop_movements'],calendarVersion:1});
describe('Espionagem · Lote 6 missões e dificuldade',()=>{
 it('valida alvo, campos e agente sem duplicar missão',()=>{
  const result=draft();expect(result.classification).toBe('secret');
  expect(result.operation.status).toBe('draft');
  expect(playerSpyMissionPreview(result.operation).successChancePercent).toBe(null);
  expect(()=>createSpyMissionDraft({id:ids[1]!,ownerHouseId:'evenhand',asset:agent,
   existingOperations:[{...result.operation,status:'planned'}],targetType:'house',targetId:'house-target',
   kind:'military',requestedFields:['house_army'],calendarVersion:1})).toThrow('andamento');
  expect(()=>createSpyMissionDraft({id:ids[1]!,ownerHouseId:'evenhand',asset:agent,
   existingOperations:[],targetType:'region',targetId:'horselands',kind:'military',
   requestedFields:['regional_roads'],calendarVersion:1})).toThrow('incompatível');
 });
 it('nega dificuldade sem Lei, fonte ou regra, e não informa Lei privada ao jogador',()=>{
  const operation=draft().operation;
  const unknown={targetId:'house-target',law:null,kind:'unresolved' as const,sourceVersion:null,sourceRef:null};
  expect(resolveSpyDifficulty({mission:operation,law:unknown,rules:null,security:[]}).status).toBe('pending_narrator_rule');
  const rules={id:ids[0]!,version:1,approvedByNarratorId:'gm',source:'Decisão de campanha 1522',
   baseByMission:{military:12},lawRanges:[{min:0,max:100000,modifier:1}],
   stacking:'highest' as const};
  expect(resolveSpyDifficulty({mission:operation,law:unknown,rules,security:[]}).status).toBe('pending_law_source');
  const law={targetId:'house-target',law:43,kind:'player_house_total' as const,sourceVersion:2,sourceRef:'sheet:target:v2'};
  const result=resolveSpyDifficulty({mission:operation,law,rules,security:[]});
  expect(result.status).toBe('resolved');
  expect(visibleSpyDifficulty(result).successChancePercent).toBe(null);
  expect(JSON.stringify(visibleSpyDifficulty(result))).not.toContain('43');
  expect(JSON.stringify(playerSpyMissionPreview(operation))).not.toContain('43');
 });
 it('não acumula contramedidas sem a aprovação de sua política',()=>{
  const operation=draft().operation;
  const law={targetId:'house-target',law:50,kind:'npc_approved_sheet' as const,sourceVersion:3,sourceRef:'npc-sheet:3'};
  const rules={id:ids[0]!,version:1,approvedByNarratorId:'gm',source:'Tabela explícita da campanha',
   baseByMission:{military:8},lawRanges:[{min:0,max:100000,modifier:3}],stacking:'narrator_review' as const};
  const security=ids.slice(0,2).map((id,i)=>({sourceHoldingId:id,sourceId:'guard-'+i,appliedToArea:true,
   appliesToMission:true,modifier:3,description:'Teste de Astúcia da área'}));
  expect(resolveSpyDifficulty({mission:operation,law,rules,security}).status).toBe('pending_countermeasure_review');
  const resolved=resolveSpyDifficulty({mission:operation,law,rules:{...rules,stacking:'highest'},security});
  expect(resolved.status).toBe('resolved');
  if(resolved.status==='resolved')expect(resolved.value).toBe(14);
 });
});