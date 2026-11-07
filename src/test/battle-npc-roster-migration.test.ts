import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {makeFictionalStack} from '@/lib/battle/domain/setup';
import {createV3Game} from '@/lib/battle/v3/engine';
import {previewImportedNpc,importedNpcBattleStack,isBattleTrainingCopy,
 battleTrainingSourceKey} from '@/lib/battle/adapters/imported-npc-roster';

const roster={
 source_key:'1k8vvnu2V1cD73zkeQlnqE81Z6dpUaOfK:painel:32',
 house_id:'bryarn',unit_name:'Guarnição treinada',unit_type:'garrison',
 training:'trained' as const,quantity:1,standard_unit_strength:100,
 source_status:'Compra proposta',source_row:32,
};

describe('Migração dos 483 grupos militares das Casas NPC — somente treino',()=>{
 it('reconhece as quantidades sem nivelar orçamento ou estatísticas das casas',()=>{
  const item=previewImportedNpc(roster);
  expect(item.name).toBe('Guarnição treinada');
  expect(item.strength).toBe(100);
  expect(item.training).toBe('trained');
  expect(item.sourceStatus).toBe('Compra proposta');
  expect(previewImportedNpc({...roster,unit_type:'cavalry',
   standard_unit_strength:20,training:'elite'}).strength).toBe(20);
 });
 it('cria cópia tática fictícia sem confundi-la com compra operacional',()=>{
  const copy=importedNpcBattleStack(roster,'attacker',{q:0,r:0},'garrison');
  expect(copy.name).toBe('Guarnição treinada');
  expect(copy.id).toBe('npc-roster-32');
  expect(copy.source.kind).toBe('fictional');
  expect(copy.initialCount).toBe(100);
  expect(isBattleTrainingCopy(copy)).toBe(true);
  expect(battleTrainingSourceKey(copy)).toBe('npc::npc-roster-32');
 });
 it('não permite forjar tipo diverso, navios em terra nem id ficcional livre',()=>{
  expect(()=>importedNpcBattleStack(roster,'attacker',{q:0,r:0},'cavalry'))
   .toThrow('Tipo tático');
  expect(()=>importedNpcBattleStack({...roster,unit_type:'warships',
   standard_unit_strength:5},'defender',{q:0,r:0},'warships'))
   .toThrow('navais');
  const arbitrary=makeFictionalStack({
   id:'dummy',side:'attacker',name:'Figurante',typeId:'infantry',
   training:'green',count:100,position:{q:0,r:0},
  });
  expect(isBattleTrainingCopy(arbitrary)).toBe(false);
 });
 it('Cruzada V3 aceita forças NPC documentadas sem escrever em HouseState',()=>{
  const npc=importedNpcBattleStack(roster,'attacker',{q:0,r:0},'garrison');
  const options={
   attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
   attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
   scenario:'plain-open' as const,opponent:'human' as const,
  };
  const game=createV3Game(options,[npc]);
  expect(game.battle.stacks.some(s=>s.name==='Guarnição treinada')).toBe(true);
  expect(game.battle.stacks.some(s=>s.source.kind==='house-readonly')).toBe(false);
 });
 it('a RLS e a consulta real exigem Narrador, sem lançamentos de aquisição',()=>{
  const sql=readFileSync('docs/battle/sql/0080_narrator_battle_house_rosters.sql','utf8');
  const fn=readFileSync('src/lib/battle/adapters/readonly-source.functions.ts','utf8');
  const adapter=readFileSync('src/lib/battle/adapters/imported-npc-roster.ts','utf8');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  expect(sql).toContain('public.is_campaign_admin() AND public.campaign_access_active()');
  expect(sql).toContain('REVOKE ALL');
  expect(sql).not.toContain('INSERT INTO public.noble_house_sheets');
  expect(fn).toContain('await requireNarrator(db)');
  expect(fn).toContain("sourceStatus:'scenario-roster'");
  expect(fn).toContain('readNpcRoster(db,data.houseId)');
  expect(adapter).not.toMatch(/houseOperation\(|changeUnitState\(|resolveSurvivors\(/);
 });
});
