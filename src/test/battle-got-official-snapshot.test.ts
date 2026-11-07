import {describe,it,expect} from 'vitest';
import {newHouseState,type Unit} from '@/lib/house/types';
import {snapshotOfficialWarUnit} from '@/lib/battle/got/official-adapter';
import {adaptOfficialUnit} from '@/lib/battle/adapters/unit-readonly';

function make(){
 const state=newHouseState('house-got');
 state.domains=[{id:'d',name:'Planície',terrain:'plains',features:[],notes:''}];
 const skills=Object.fromEntries(['agility','athletics','awareness','endurance',
  'fighting','marksmanship','stealth','cunning','healing','animalHandling',
  'warfare','survival'].map(x=>[x,2])) as Unit['skills'];
 const unit:Unit={id:'unit-real',name:'Guarnição Real',types:['infantry'],
  training:'trained',origin:'test',domainId:'d',skills,xp:0,costs:[],armor:3,
  armorPenalty:2,health:1,casualties:17,strength:100,disciplineModifier:0,
  equipment:[],situation:'Ativa',notes:''};
 state.units=[unit];
 return {state,unit};
}
const args={side:'attacker' as const,position:{x:1,y:2},typeId:'infantry',version:4};
describe('Guerra dos Tronos — importar ficha militar sem conversão PTE',()=>{
 it('preserva saúde, defesa, armor, guerra e origem da unidade',()=>{
  const {state,unit}=make(),before=structuredClone(state);
  const snapshot=snapshotOfficialWarUnit(state,unit,args);
  expect(snapshot.health).toBe(1);
  expect(snapshot.maxHealth).toBe(6);
  expect(snapshot.defense).toBe(4);
  expect(snapshot.armor).toBe(3);
  expect(snapshot.discipline).toBe(6);
  expect(snapshot.meleeDamage).toBe(4);
  expect(snapshot.ability.warfare).toBe(2);
  expect(snapshot.source).toMatchObject({kind:'house-readonly',houseId:'house-got',unitId:'unit-real',version:4});
  expect(state).toEqual(before);
 });
 it('difere explicitamente dos pontos de vida abstratos do Adaptado',()=>{
  const {state,unit}=make();
  const got=snapshotOfficialWarUnit(state,unit,args);
  const pte=adaptOfficialUnit(state,unit,{
   houseId:state.houseId,unitId:unit.id,side:'attacker',position:{q:0,r:0},
   primaryTypeId:'infantry',sourceVersion:4,capturedAt:'2026-11-07',
  });
  expect(got.health).toBe(1);
  expect(pte.currentHp).toBe(830);
  expect(got.maxHealth).toBe(6);
 });
 it('recusa unidades destruídas, sem efetivo e equipamento não cadastrado',()=>{
  const {state,unit}=make();
  unit.destroyed=true;expect(()=>snapshotOfficialWarUnit(state,unit,args)).toThrow();
  unit.destroyed=false;unit.casualties=100;
  expect(()=>snapshotOfficialWarUnit(state,unit,args)).toThrow();
  unit.casualties=17;
  expect(()=>snapshotOfficialWarUnit(state,unit,{...args,typeId:'archers'})).toThrow(/equipamento/i);
 });
 it('exige uma decisão explícita para equipamento de alcance variável',()=>{
  const {state,unit}=make();
  unit.types=['special'];unit.equipmentTypeId='special';unit.armor=2;unit.armorPenalty=1;
  expect(()=>snapshotOfficialWarUnit(state,unit,{...args,typeId:'special'})).toThrow(/variável/i);
  const valid=snapshotOfficialWarUnit(state,unit,{...args,typeId:'special',rangeOverride:'long'});
  expect(valid.range).toBe('long');
 });
});
