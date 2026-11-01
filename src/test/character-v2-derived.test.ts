import {describe,it,expect} from 'vitest';
import {resolveCharacterDerived} from '@/lib/character-v2/derived';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';
import type {CharacterV2} from '@/lib/character-v2/schema';

function char():CharacterV2{
 const original=blankChronicleSheet();original.name='Aldaeric Erdenor';
 const result=readCharacterV2({
  id:'00000000-0000-4000-8000-000000000008',houseId:'erdenor',version:1,
  title:'Ficha de Aldaeric',content:serializeChronicleSheet(original)});
 const c=result.character!;
 return {...c,skillRanks:{
  ...c.skillRanks,cunning:4,awareness:3,status:4,will:3,endurance:5,
  agility:3,athletics:4,
 },specialties:[{id:'s1',skillId:'athletics',specialtyId:'correr',
  bonusDice:2,verified:true}]};
}
describe('Ficha V2 — lote 05: DAG de estatísticas calculadas',()=>{
 it('Aldaeric: intriga 11, compostura 9, saúde 15 e movimento 5 / corrida 20',()=>{
  const result=resolveCharacterDerived(char());
  expect(result.values.intrigueDefense).toBe(11);
  expect(result.values.maxComposure).toBe(9);
  expect(result.values.maxHealth).toBe(15);
  expect(result.values.combatDefense).toBe(10);
  expect(result.values.movement).toBe(5);
  expect(result.values.running).toBe(20);
  expect(result.nodes.intrigueDefense.lines.map(x=>x.amount)).toEqual([4,3,4]);
  expect(result.nodes.running.dependsOn).toContain('derived.movement');
  expect(result.healthCurrent).toBe(15);
 });
 it('equipamento confirmado aplica penalidade de armadura e volume sem dupla aplicação',()=>{
  const eq={verified:true,sourceId:'armor-1',armorRating:5,armorPenalty:1,
   shieldDefense:2,bulk:2,defensiveWeaponBonus:0};
  const result=resolveCharacterDerived(char(),{equipment:eq});
  expect(result.values.combatDefense).toBe(11);
  expect(result.values.armorRating).toBe(5);
  expect(result.values.movement).toBe(4);
  expect(result.values.running).toBe(14);
  expect(result.nodes.movement.lines.find(x=>x.sourceId==='armor-1:bulkMovement')?.amount).toBe(-1);
 });
 it('equipamento não homologado não concede nenhum bônus',()=>{
  const result=resolveCharacterDerived(char(),{equipment:{
   verified:false,sourceId:'legacy',armorRating:20,armorPenalty:0,
   shieldDefense:20,bulk:0,defensiveWeaponBonus:0}});
  expect(result.values.combatDefense).toBe(10);
  expect(result.warnings.some(w=>w.includes('não conferido'))).toBe(true);
 });
 it('Correr não confirmado permanece inativo, sem presumir bônus',()=>{
  const c=char();c.specialties[0]!.verified=false;
  const result=resolveCharacterDerived(c);
  expect(result.values.movement).toBe(4);
  expect(result.values.running).toBe(16);
  expect(result.warnings.join(' ')).toContain('Correr');
 });
 it('não aplica qualidades ainda pendentes de teste',()=>{
  const c=char();c.traits=[{id:'trait1',traitId:'rapido',tier:null,
   params:{},acquiredAt:null,status:'approved'}];
  const result=resolveCharacterDerived(c);
  expect(result.values.movement).toBe(5);
  expect(result.values.running).toBe(20);
 });
 it('respeita modificação aprovada, deduplica fontes e rejeita não aprovadas',()=>{
  const result=resolveCharacterDerived(char(),{modifiers:[
   {sourceId:'staff',description:'Regra teste',target:'intrigueDefense',amount:2,
    approved:true,active:true,stackKey:'staff'},
   {sourceId:'duplicate',description:'Regra duplicada',target:'intrigueDefense',amount:2,
    approved:true,active:true,stackKey:'staff'},
   {sourceId:'unknown',description:'Não aprovado',target:'intrigueDefense',amount:99,
    approved:false,active:true,stackKey:null},
  ]});
  expect(result.values.intrigueDefense).toBe(13);
  expect(result.warnings.some(w=>w.includes('duplicado'))).toBe(true);
  expect(result.warnings.some(w=>w.includes('não aprovado'))).toBe(true);
 });
 it('ajusta exibição de saúde atual para novo máximo sem reescrever snapshot',()=>{
  const c=char();c.state.healthCurrent=100;
  const result=resolveCharacterDerived(c);
  expect(result.healthCurrent).toBe(15);
  expect(c.state.healthCurrent).toBe(100);
  expect(result.warnings.some(w=>w.includes('Saúde'))).toBe(true);
  expect(()=>resolveCharacterDerived(char(),{equipment:{
   verified:true,sourceId:'fake',armorRating:-1,armorPenalty:0,
   shieldDefense:0,bulk:0,defensiveWeaponBonus:0}})).toThrow();
 });
});
