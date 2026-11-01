import {describe,it,expect} from 'vitest';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';
import {reviewCharacterEquipment,buildCharacterResolvedReport,type VerifiedGear} from '@/lib/character-v2/equipment-report';
import {evaluateCharacterRoll,prepareCharacterRollDice} from '@/lib/character-v2/rolls';
import {exportCharacterV2ReportPdf} from '@/lib/character-v2/pdf';
import type {CharacterV2} from '@/lib/character-v2/schema';
import {reviewCharacterMigration,assertCharacterV2ReleaseAuthorized} from '@/lib/character-v2/migration-review';

const ID='00000000-0000-4000-8000-000000000788';
const char=():CharacterV2=>{
 const old=blankChronicleSheet();old.name='Aldaeric Erdenor';
 const c=readCharacterV2({id:ID,houseId:'erdenor',version:8,
  title:'Ficha',content:serializeChronicleSheet(old)}).character!;
 return {...c,review:{status:'approved',warnings:[]},
  skillRanks:{...c.skillRanks,cunning:4,agility:3,athletics:3,awareness:3,status:4,
   fighting:4,marksmanship:3,endurance:4},
  specialties:[{id:'sp1',skillId:'fighting',specialtyId:'lancas',bonusDice:2,verified:true}],
 };
};
const shield:VerifiedGear={
 id:'steel-shield',name:'Escudo verificado',kind:'shield',
 source:'Tabela de equipamento revisada pelo Narrador',
 rulesVersion:'test-book-1',narratorVerified:true,
 armorRating:0,armorPenalty:0,shieldDefense:2,defensiveWeaponBonus:0,
 bulk:1,damage:null,properties:[],
};
const sword:VerifiedGear={
 id:'sword-1',name:'Arma verificada',kind:'weapon',
 source:'Tabela de equipamento revisada pelo Narrador',
 rulesVersion:'test-book-1',narratorVerified:true,
 armorRating:0,armorPenalty:0,shieldDefense:0,defensiveWeaponBonus:0,
 bulk:0,damage:{skill:'fighting',multiplier:1,modifier:1},properties:[],
};
describe('Ficha V2 lote 10 — equipamento e rolagens',()=>{
 it('atribui apenas equipamento homologado com origens de bônus',()=>{
  const c=char();c.equipment.push(
   {itemId:'steel-shield',quantity:1,equipped:true,params:{}},
   {itemId:'sword-1',quantity:1,equipped:true,params:{}})
  const gear=reviewCharacterEquipment(c,[shield,sword]);
  expect(gear.snapshot).toMatchObject({verified:true,shieldDefense:2,bulk:1});
  expect(gear.damages).toEqual([expect.objectContaining({id:'sword-1',value:5})]);
  const report=buildCharacterResolvedReport(c,[shield,sword]);
  expect(report.stats.combatDefense).toBe(11);
  expect(report.stats.intrigueDefense).toBe(11);
  expect(report.breakdown.find(x=>x.key==='combatDefense')?.lines.some(x=>x.sourceId.includes('shieldDefense'))).toBe(true);
  expect(JSON.stringify(report)).not.toContain('originalContent');
 });
 it('item desconhecido ou duas armaduras bloqueia o snapshot completo',()=>{
  const c=char();c.equipment=[{itemId:'missing',quantity:1,equipped:true,params:{}}];
  const result=reviewCharacterEquipment(c,[shield]);
  expect(result.snapshot.verified).toBe(false);
  expect(result.pending).toHaveLength(1);
  c.equipment=[
   {itemId:'a',quantity:1,equipped:true,params:{}},
   {itemId:'b',quantity:1,equipped:true,params:{}}];
  const armor={...shield,kind:'armor' as const};
  expect(reviewCharacterEquipment(c,[{...armor,id:'a'},{...armor,id:'b'}]).snapshot.verified).toBe(false);
  expect(()=>reviewCharacterEquipment(c,[shield,shield])).toThrow('duplicado');
 });
 it('D e B são rollados separadamente e só os melhores D compõem o total',()=>{
  const c=char();
  const context={activity:'combat' as const,skillId:'fighting' as const,specialtyId:'lancas'};
  expect(prepareCharacterRollDice(c,context)).toMatchObject({testDice:4,bonusDice:2,expectedRolls:6});
  const r=evaluateCharacterRoll(c,{context,dice:[1,2,3,4,5,6],difficulty:18});
  expect(r.kept).toEqual([6,5,4,3]);
  expect(r.total).toBe(18);expect(r.success).toBe(true);
  expect(()=>evaluateCharacterRoll(c,{context,dice:[1,2,3],difficulty:10})).toThrow();
 });
 it('não aceita dado inventado, rerrolagem sem qualidade, nem rerrolagem obrigatória pendente',()=>{
  const c=char();
  const context={activity:'combat' as const,skillId:'agility' as const};
  expect(()=>evaluateCharacterRoll(c,{context,dice:[6,2,1],difficulty:5,rerolls:[{index:0,newFace:1}]})).toThrow();
  c.traits.push({id:'t1',traitId:'agil',tier:null,params:{},acquiredAt:null,status:'approved'});
  const r=evaluateCharacterRoll(c,{context,dice:[1,2,3],difficulty:10,rerolls:[{index:0,newFace:6}]});
  expect(r.rolled).toEqual([6,2,3]);expect(r.total).toBe(11);
  c.traits.push({id:'t2',traitId:'desastrado',tier:null,params:{},acquiredAt:null,status:'approved'});
  expect(()=>evaluateCharacterRoll(c,{context,dice:[6,2,3],difficulty:10})).toThrow('obrigatória');
 });
 it('gera PDF do mesmo report sem reproduzir fonte privada nem alterar a ficha',()=>{
  const c=char(),before=structuredClone(c);
  const report=buildCharacterResolvedReport(c);
  const pdf=exportCharacterV2ReportPdf(report);
  expect(pdf.byteLength).toBeGreaterThan(200);
  expect(String.fromCharCode(...pdf.slice(0,4))).toBe('%PDF');
  expect(c).toEqual(before);
 });
});
describe('Ficha V2 lotes 11 e 12 — migração segura',()=>{
 it('não presume identidade pelo nome e preserva integralmente fonte/versão',()=>{
  const s=blankChronicleSheet();s.name='Aldaeric Erdenor';s.cunning=4;
  const raw=serializeChronicleSheet(s);
  const source={id:ID,houseId:'erdenor',version:8,title:'Ficha',content:raw};
  const unrelated=reviewCharacterMigration(source,{id:'00000000-0000-4000-8000-000000000799',
   houseId:'outra',reviewStatus:'reviewed',confidence:'confirmed',
   sourceLinkRecordId:ID,sourceLinkCanonicalId:'00000000-0000-4000-8000-000000000799'});
  expect(unrelated.blockers.some(x=>x.includes('Casa'))).toBe(true);
  const initial=reviewCharacterMigration(source,null);
  expect(initial.original).toBe(raw);
  expect(initial.sourceVersion).toBe(8);
  expect(initial.canStageDraft).toBe(false);
  expect(initial.canReleaseToPlayers).toBe(false);
  expect(JSON.stringify(initial.derived)).not.toContain('originalContent');
  const linked=reviewCharacterMigration(source,{
   id:'00000000-0000-4000-8000-000000000700',houseId:'erdenor',
   reviewStatus:'reviewed',confidence:'confirmed',sourceLinkRecordId:ID,
   sourceLinkCanonicalId:'00000000-0000-4000-8000-000000000700'});
  expect(linked.blockers.some(x=>x.includes('conciliação'))).toBe(true);
 });
 it('gate de publicação bloqueia qualquer ativação prematura',()=>{
  expect(()=>assertCharacterV2ReleaseAuthorized()).toThrow('bloqueada');
 });
});
