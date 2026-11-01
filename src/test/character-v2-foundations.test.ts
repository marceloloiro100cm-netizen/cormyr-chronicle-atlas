import {describe,it,expect} from 'vitest';
import {auditCharacterCatalog,CHARACTER_BENEFITS,CHARACTER_FLAWS,
 CHARACTER_TRAITS,findCharacterTrait,CHARACTER_CATALOG_VERSION} from '@/lib/character-v2/catalog';
import {readCharacterV2,restoreOriginalCharacterSource,sourceFingerprint} from '@/lib/character-v2/read-adapter';
import {CHARACTER_SKILL_IDS,CharacterV2Schema,emptyCharacterSkillRanks,
 CHARACTER_V2_PLAYER_UI_ENABLED} from '@/lib/character-v2/schema';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';

const id='00000000-0000-4000-8000-000000000011';
const record=(content:string)=>({id,houseId:'cormyr-test',playerId:'player-test',
 version:7,title:'Ficha de Aldaeric',content});

describe('Character V2 — lotes 01 e 02',()=>{
 it('cataloga 115 benefícios/variantes e 35 desvantagens, sem efeitos prematuros',()=>{
  const audit=auditCharacterCatalog();
  expect(audit.version).toBe(CHARACTER_CATALOG_VERSION);
  expect(audit.byCategory).toEqual({fortune:21,heritage:8,ability:24,martial:46,social:16,flaw:35});
  expect(audit.benefits).toBe(115);expect(audit.flaws).toBe(35);
  expect(CHARACTER_TRAITS).toHaveLength(150);
  expect(audit.duplicates).toEqual([]);expect(audit.untraceable).toEqual([]);
  expect(CHARACTER_TRAITS.every(t=>t.automation==='pending_rules'&&
    t.campaignStatus==='requires_narrator_review')).toBe(true);
  expect(CHARACTER_BENEFITS.some(t=>t.label==='Durão')).toBe(true);
  expect(CHARACTER_FLAWS.some(t=>t.parameterized)).toBe(true);
  expect(findCharacterTrait('cavaleiro de torneios')?.id).toBe('cavaleiro-de-torneio');
  expect(findCharacterTrait('Dançarino da Água III')?.tier).toBe(3);
  expect(CHARACTER_V2_PLAYER_UI_ENABLED).toBe(false);
 });
 it('modelo contém as 19 habilidades oficiais, sem Briga independente',()=>{
  expect(CHARACTER_SKILL_IDS).toHaveLength(19);
  expect(new Set(CHARACTER_SKILL_IDS).size).toBe(19);
  expect(CHARACTER_SKILL_IDS).toContain('cunning');
  expect(CHARACTER_SKILL_IDS).not.toContain('brawling');
  expect(Object.keys(emptyCharacterSkillRanks())).toHaveLength(19);
 });
 it('migra V1 apenas em memória, mantém XP/Destino e Briga em campo original',()=>{
  const v1=blankChronicleSheet();v1.name='Aldaeric Erdenor';
  v1.cunning=4;v1.skills['Luta']=5;v1.skills['Briga']=3;
  v1.specialties='Luta: lanças 2B';v1.qualities='Rápido';v1.flaws='Manco';
  v1.destiny=4;v1.spentDestiny=1;v1.xpSpent=20;
  const raw=serializeChronicleSheet(v1);
  const preview=readCharacterV2(record(raw));
  expect(preview.character).not.toBeNull();
  const ch=preview.character!;
  expect(CharacterV2Schema.safeParse(ch).success).toBe(true);
  expect(ch.skillRanks.cunning).toBe(4);
  expect(ch.skillRanks.fighting).toBe(5);
  expect(ch.skillRanks).not.toHaveProperty('brawling');
  expect(ch.source.unparsedFields['brawlingRank']).toBe('3');
  expect(ch.source.unparsedFields['destiny']).toBe('4');
  expect(ch.traits).toHaveLength(0);
  expect(ch.specialties).toHaveLength(0);
  expect(preview.warnings.some(w=>w.includes('Briga'))).toBe(true);
  expect(restoreOriginalCharacterSource(ch)).toEqual({
   id,version:7,content:raw,sourceFingerprint:sourceFingerprint(raw)
  });
  expect(readCharacterV2(record(raw)).character).toEqual(ch);
 });
 it('lê arquivo legado sem sobrescrever expressão inválida de corrida ou especialidades',()=>{
  const raw=['Nome do Personagem · Aldaeric Erdenor','Casa · Erdenor',
    'Idade · 30 anos','Corrida · 0','4m+1m /28 em corrida',
    'Graduação · Habilidade · Especialização',
    '4 · Astúcia · Lógica (2)','5 · Luta · Lanças (2B)',
    '3 · Briga ·','2 · Vigor ·'].join('\n');
  const before=raw;
  const a=readCharacterV2(record(raw));
  expect(a.character?.skillRanks.cunning).toBe(4);
  expect(a.character?.skillRanks.fighting).toBe(5);
  expect(a.character?.source.unparsedFields['corrida']).toBe('0');
  expect(a.character?.source.unparsedFields['movimento']).toBe('4m+1m /28 em corrida');
  expect(a.character?.source.unparsedFields['skill:Briga']).toBe('3');
  expect(a.character?.source.unparsedFields['specialty:Astúcia']).toBe('Lógica (2)');
  expect(a.character?.review.status).toBe('needs_review');
  expect(restoreOriginalCharacterSource(a.character!).content).toBe(before);
 });
 it('não converte documentos alheios nem aceita identidades de registro inválidas',()=>{
  expect(readCharacterV2(record('Narrativa de personagem')).character).toBeNull();
  const v1=blankChronicleSheet();v1.name='Personagem';
  const invalid=readCharacterV2({...record(serializeChronicleSheet(v1)),id:'not-uuid'});
  expect(invalid.character).toBeNull();
  expect(invalid.warnings.some(w=>w.includes('inválido'))).toBe(true);
 });
});
