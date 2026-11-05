import {describe,it,expect} from 'vitest';
import {UNIT_TYPES} from '@/lib/house/engine';
import {BATTLE_PROFILES,LAND_PROFILES,tacticalProfile,TRAINING_BONUS} from '@/lib/battle/domain/profiles-v2';
import {officialAvailableCount,officialMovementHex} from '@/lib/battle/domain/rulebook-v2';
import {makeFictionalStack,makeBattleSetup,parseBattleDraftJson,serializeBattleDraft} from '@/lib/battle/domain/setup';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
describe('Batalha V2 — lote 1, perfis e isolamento',()=>{
 it('espelha os 17 IDs oficiais, sem permitir navio em terra',()=>{
   expect(BATTLE_PROFILES.map(p=>p.id).sort()).toEqual(UNIT_TYPES.map(t=>t.id).sort());
   expect(LAND_PROFILES).toHaveLength(16);
   expect(()=>tacticalProfile('warships')).toThrow(/Navios/);
 });
 it('preserva tropas existentes e faz conversão experimental explícita',()=>{
   expect(officialAvailableCount(100,17)).toBe(83);
   expect(officialAvailableCount(100,1000)).toBe(0);
   expect(officialMovementHex(40)).toBe(3);
   expect(TRAINING_BONUS.elite).toBe(3);
 });
 it('bloqueia entradas negativas, frações, unidades navais e efetivos excessivos',()=>{
   expect(()=>officialAvailableCount(-10,2)).toThrow();
   expect(()=>officialAvailableCount(10,2.5)).toThrow();
   expect(()=>makeFictionalStack({id:'x',side:'attacker',name:'Navio',typeId:'warships',training:'green',count:5,position:{q:0,r:0}})).toThrow();
   expect(()=>makeFictionalStack({id:'x',side:'attacker',name:'Invalida',typeId:'infantry',training:'green',count:1001,position:{q:0,r:0}})).toThrow();
 });
 it('cria snapshots fictícios e valida JSON de ida e volta',()=>{
   const map=createScenario('plain-open');
   const a=makeFictionalStack({id:'a',side:'attacker',name:'A',typeId:'infantry',training:'green',count:100,position:map.deployment.attacker[0]!});
   const b=makeFictionalStack({id:'b',side:'defender',name:'B',typeId:'cavalry',training:'trained',count:20,position:map.deployment.defender[0]!});
   expect(b.currentHp).toBe(500);
   const state=makeBattleSetup({id:'battle',name:'Teste',seed:'seed-1',map,controls:{attacker:'human',defender:'human'},stacks:[a,b]});
   expect(state.phase).toBe('ready');
   const draft={id:state.id,name:state.name,schemaVersion:2 as const,rulesVersion:'PTE-2.0' as const,seed:state.seed,map,controls:state.controls,stacks:[a,b]};
   expect(parseBattleDraftJson(serializeBattleDraft(draft)).stacks).toHaveLength(2);
   expect(()=>parseBattleDraftJson(serializeBattleDraft(draft).replace('"initialCount":100','"initialCount":101'))).toThrow();
 });
});
