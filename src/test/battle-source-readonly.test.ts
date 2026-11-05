import {describe,it,expect} from 'vitest';
import {newHouseState,type Unit} from '@/lib/house/types';
import {adaptOfficialUnit} from '@/lib/battle/adapters/unit-readonly';
import {makeFictionalStack} from '@/lib/battle/domain/setup';
import {tacticalProfile} from '@/lib/battle/domain/profiles-v2';
const make=()=>{
 const state=newHouseState('house-1');
 state.domains=[{id:'d',name:'Campo',terrain:'plains',features:[],notes:''}];
 const skills=Object.fromEntries(['agility','athletics','awareness','endurance','fighting','marksmanship',
  'stealth','cunning','healing','animalHandling','warfare','survival'].map(x=>[x,2])) as Unit['skills'];
 const unit:Unit={id:'u-1',name:'Infantaria Oficial',types:['infantry'],
  training:'trained',origin:'test',domainId:'d',skills,xp:0,costs:[],armor:3,
  armorPenalty:2,health:1,casualties:17,strength:100,disciplineModifier:0,
  equipment:[],situation:'Ativa',notes:''};
 state.units=[unit];
 return {state,unit};
};
const query={houseId:'house-1',unitId:'u-1',side:'attacker' as const,
 position:{q:0,r:0},primaryTypeId:'infantry',sourceVersion:4,
 capturedAt:'2026-11-05T12:00:00.000Z'};
describe('Batalha V2 — lote 9, adaptador read-only',()=>{
 it('copia efetivo 83, saúde inicial total e aviso de saúde oficial parcial',()=>{
  const {state,unit}=make(),before=structuredClone(state);
  const stack=adaptOfficialUnit(state,unit,query);
  expect(stack.initialCount).toBe(83);
  expect(stack.currentHp).toBe(830);
  expect(stack.source.officialHealth).toBe(1);
  expect(stack.source.warnings?.some(x=>x.includes('Saúde oficial parcial'))).toBe(true);
  expect(stack.armor).toBe(3);
  expect(stack.movementHex).toBe(3);
  expect(state).toEqual(before);
 });
 it('usa bônus de Defesa da ficha apenas uma vez, sem somar perfil de armadura',()=>{
  const {state,unit}=make();
  const stack=adaptOfficialUnit(state,unit,query);
  expect(stack.defense).toBe(3); // defesa ficha 2+2+2-2=4; floor((4-6)/3)=-1, base 3+1-1=3
  expect(stack.attack).toBe(4); // 3 + treino1 + floor((2-2)/2)
 });
 it('bloqueia mistos sem decisão, navios, destruídos e efetivo zero',()=>{
  const {state,unit}=make();
  unit.types=['infantry','archers'];
  expect(()=>adaptOfficialUnit(state,unit,query)).toThrow('justificativa');
  expect(adaptOfficialUnit(state,unit,{...query,profileDecisionReason:'Narrador escolhe perfil de infantaria.'}).originalTypeIds).toHaveLength(2);
  unit.types=['warships'];expect(()=>adaptOfficialUnit(state,unit,query)).toThrow();
  unit.types=['infantry'];unit.destroyed=true;expect(()=>adaptOfficialUnit(state,unit,query)).toThrow();
  unit.destroyed=false;unit.casualties=100;expect(()=>adaptOfficialUnit(state,unit,query)).toThrow();
 });
 it('não aceita outro houseId nem perfil fora da lista',()=>{
  const {state,unit}=make();
  expect(()=>adaptOfficialUnit(state,unit,{...query,houseId:'other'})).toThrow();
  expect(()=>adaptOfficialUnit(state,unit,{...query,primaryTypeId:'archers'})).toThrow();
 });
});
