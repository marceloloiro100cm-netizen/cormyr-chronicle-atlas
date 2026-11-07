import {describe,expect,it} from 'vitest';
import {newHouseState,type Holding,type Unit} from '@/lib/house/types';
import {unitStats} from '@/lib/house/engine';
import {auditHouseWarEffects,assessNpcWarReadiness}
 from '@/lib/battle/adapters/house-war-effects';
import {snapshotOfficialWarUnit} from '@/lib/battle/got/official-adapter';
import {adaptOfficialUnit} from '@/lib/battle/adapters/unit-readonly';
import {makeWarFortification,fortForUnit,fortDefense} from '@/lib/battle/got/fortifications';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {importedNpcBattleStack,isBattleTrainingCopy} from '@/lib/battle/adapters/imported-npc-roster';

function fixture(){
 const state=newHouseState('npc-with-verified-sheet');
 state.domains=[{id:'dominio-1',name:'Colina',terrain:'hills',features:[],notes:''}];
 const skills=Object.fromEntries(['agility','athletics','awareness','endurance',
 'fighting','marksmanship','stealth','cunning','healing','animalHandling',
 'warfare','survival'].map(key=>[key,2])) as Unit['skills'];
 const unit:Unit={id:'garrison-1',name:'Guarda da fortaleza',types:['garrison'],
  training:'trained',origin:'NPC documentado',domainId:'dominio-1',
  skills,xp:0,costs:[],armor:3,armorPenalty:2,health:6,casualties:0,
  strength:100,disciplineModifier:-3,equipment:[],situation:'Ativa',notes:'',
  atHome:true};
 const holding=(id:string,itemId:string,domainId='dominio-1'):Holding=>({
  id,itemId,domainId,name:itemId,costs:[],effects:[],ruleVersion:'book',
  source:'Ficha oficial',status:'active',
 });
 state.units=[unit];
 state.holdings=[holding('castle-1','castle'),
  holding('master-1','pros-master-of-arms','')];
 return {state,unit};
}
const gotArgs={side:'defender' as const,position:{x:9,y:2},
 version:5,typeId:'garrison'};
const pteArgs={houseId:'npc-with-verified-sheet',unitId:'garrison-1',
 side:'defender' as const,position:{q:9,r:2},sourceVersion:5,
 primaryTypeId:'garrison',capturedAt:'2026-11-07T23:00:00Z'};

describe('Identidade dos rosters NPC entre Casas distintas',()=>{
 it('mesma source_row em duas Casas não colide e replays legados continuam reconhecidos',()=>{
  const row={source_key:'linha-1',unit_name:'Infantaria NPC',unit_type:'infantry',
   training:'trained' as const,quantity:1,standard_unit_strength:100,
   source_status:'Compra proposta',source_row:1};
  const a=importedNpcBattleStack({...row,house_id:'npc-alpha'},'attacker',
   {q:0,r:0},'infantry');
  const b=importedNpcBattleStack({...row,house_id:'npc-beta'},'defender',
   {q:9,r:0},'infantry');
  expect(a.id).not.toBe(b.id);
  expect(importedNpcBattleStack({...row,house_id:'npc-alpha'},'attacker',
   {q:0,r:0},'infantry').id).toBe(a.id);
  expect(isBattleTrainingCopy(a)).toBe(true);
  expect(isBattleTrainingCopy(b)).toBe(true);
  expect(isBattleTrainingCopy({...a,id:'npc-roster-1'})).toBe(true);
 });
});

describe('Integração da guerra com fontes oficiais de Casas NPC',()=>{
 it('bloqueia multiplicadores presumidos de rosters e narrativas',()=>{
  expect(assessNpcWarReadiness({hasFullSheet:false,hasScenarioRoster:true}))
   .toMatchObject({readiness:'training-proposal',autoHouseModifiersAllowed:false});
  expect(assessNpcWarReadiness({hasFullSheet:false,hasScenarioRoster:false}))
   .toMatchObject({readiness:'unavailable',autoHouseModifiersAllowed:false});
  expect(assessNpcWarReadiness({hasFullSheet:true,hasScenarioRoster:true}))
   .toMatchObject({readiness:'full-sheet',autoHouseModifiersAllowed:true});
 });
 it('não duplamente acrescenta Castelo +8 à Defesa básica no GOT',()=>{
  const {state,unit}=fixture(),original=structuredClone(state);
  const administrative=unitStats(unit,state);
  expect(administrative.defense).toBe(12);
  const audit=auditHouseWarEffects(state,unit);
  expect(audit.deferredFortDefense).toBe(8);
  expect(audit.masterOfArmsSurvivorBonus).toBe(1);
  const got=snapshotOfficialWarUnit(state,unit,gotArgs);
  expect(got.defense).toBe(4);
  expect(got.source.warEffects?.deferredFortDefense).toBe(8);
  expect(got.source.warEffects?.masterOfArmsSurvivorBonus).toBe(1);
  const fort=makeWarFortification({id:'castle-1',name:'Castelo',side:'defender',
   kind:'castle',cells:[{x:9,y:2}],engineerBuilt:false,hoursBuilt:100});
  expect(fortDefense(fort)).toBe(8);
  expect(fortForUnit([fort],got)).not.toBeNull();
  expect(got.defense+fortDefense(fortForUnit([fort],got)!)).toBe(administrative.defense);
  expect(state).toEqual(original);
 });
 it('mantém efeitos de fortificação pendentes no Adaptado, nunca globais',()=>{
  const {state,unit}=fixture();
  const withFort=adaptOfficialUnit(state,unit,pteArgs);
  state.holdings=state.holdings.filter(h=>h.itemId!=='castle');
  const withoutFort=adaptOfficialUnit(state,unit,pteArgs);
  expect(withFort.defense).toBe(withoutFort.defense);
  expect(withFort.source.warnings?.join(' ')).toMatch(/fortificação/);
  expect(withFort.appliedEffectIds).not.toContain('castle-1');
 });
 it('Mestre de Armas ativo acrescenta +1 em sobreviventes sem lançamento oficial',()=>{
  const {state,unit}=fixture();
  const got=snapshotOfficialWarUnit(state,unit,gotArgs);
  const opponent=modelWarUnit({id:'enemy',name:'Invasores',side:'attacker',
   position:{x:1,y:2},typeId:'infantry'});
  const battle=createWarBattle({id:'npc-siege',name:'Teste de fonte NPC',seed:'npc-1',
   width:12,height:8,units:[got,opponent],commanders:modelWarCommanders({
    attacker:5,defender:5})});
  const finished={...battle,phase:'finished' as const,winner:'defender' as const};
  const a=previewWarAftermath(finished);
  const b=previewWarAftermath(finished,{masterOfArmsBonus:{[got.id]:1}});
  const soldier=a.survivors.find(u=>u.unitId===got.id)!;
  const same=b.survivors.find(u=>u.unitId===got.id)!;
  expect(soldier.masterOfArmsBonus).toBe(1);
  expect(soldier.masterOfArmsSource).toBe('official-house-sheet');
  expect(soldier.adjusted).toBe(same.adjusted);
  expect(a.appliedToHouse).toBe(false);
  expect(state.units[0]?.health).toBe(unit.health);
 });
 it('posse inativa, domínio alheio ou tropa fora de casa não concede castelo',()=>{
  const {state,unit}=fixture();
  state.holdings[0]!.status='destroyed';
  expect(auditHouseWarEffects(state,unit).deferredFortDefense).toBe(0);
  state.holdings[0]!.status='active';state.holdings[0]!.domainId='other';
  expect(auditHouseWarEffects(state,unit).deferredFortDefense).toBe(0);
  state.holdings[0]!.domainId='dominio-1';unit.atHome=false;
  expect(auditHouseWarEffects(state,unit).deferredFortDefense).toBe(0);
 });
});
