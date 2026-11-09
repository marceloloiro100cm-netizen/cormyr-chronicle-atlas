import {describe,expect,it} from 'vitest';
import {DND_MONSTER_CSV_EXAMPLE,DND_MONSTER_CSV_HEADERS,parseDndMonsterTable}
 from '@/lib/crusade/dnd-import';
import {DND_PROVISIONAL_FLY_SPEED_FT,dndCormyrCreature,parseDndCustomMonster}
 from '@/lib/crusade/dnd-cormyr-300';
import {formatDndMetres} from '@/lib/crusade/dnd-metric';
import {crzRangeHexFromMetres} from '@/lib/crusade/convert';

const metricWithRange=DND_MONSTER_CSV_EXAMPLE.replace(
 ';;;;6;defender',';+4;1d6+1;24;6;defender');

describe('Importação métrica canônica de criaturas do Cormyr',()=>{
 it('novo modelo de tabela é em metros',()=>{
  expect(DND_MONSTER_CSV_HEADERS).toContain('speedM');
  expect(DND_MONSTER_CSV_HEADERS).toContain('rangeM');
  const result=parseDndMonsterTable(DND_MONSTER_CSV_EXAMPLE);
  expect(result.creatures[0]!.speedFt.walk).toBe(40); // campo do motor legado
 });
 it('alcances métricos e legados geram fichas e movimentos equivalentes',()=>{
  const legacy=metricWithRange
   .replace('speedM','speedFt').replace('rangeM','rangeFt')
   .replace(';2;12;+4;',';2;40;+4;')
   .replace(';24;6;defender',';80;6;defender');
  const fresh=parseDndMonsterTable(metricWithRange).creatures[0]!;
  const old=parseDndMonsterTable(legacy).creatures[0]!;
  expect(fresh.speedFt.walk).toBe(old.speedFt.walk);
  expect(fresh.attacks.find(a=>a.kind==='ranged')?.rangeFt?.normal)
   .toBe(old.attacks.find(a=>a.kind==='ranged')?.rangeFt?.normal);
  expect(fresh.attacks.find(a=>a.kind==='ranged')?.rangeFt?.normal).toBe(80);
 });
 it('permite voos em metros, sem tocar fichas históricas',()=>{
  const [head,values]=DND_MONSTER_CSV_EXAMPLE.split('\n');
  const row=Object.fromEntries(head!.split(';').map((k,i)=>[k,values!.split(';')[i]]));
  const imported=parseDndMonsterTable(JSON.stringify({monsters:[{...row,flyM:18}]}));
  expect(imported.creatures[0]!.speedFt.fly).toBe(60);
  expect(imported.creatures[0]!.flags.flying).toBe(true);
 });
 it('recusa ambiguidades e velocidades fora de passos de 1,5 m',()=>{
  const dual=DND_MONSTER_CSV_EXAMPLE.replace(
   'speedM','speedM;speedFt').replace(';2;12;',';2;12;40;');
  expect(()=>parseDndMonsterTable(dual)).toThrow(/apenas deslocamento/);
  const invalid=DND_MONSTER_CSV_EXAMPLE.replace(';2;12;',';2;12,5;');
  expect(()=>parseDndMonsterTable(invalid)).toThrow(/incrementos de 1,5 m/);
 });
 it('aviso de voo provisório usa metros, e não pés',()=>{
  const provisional=parseDndCustomMonster({
   id:'voador-teste',name:'Voador',group:'Dragões',source:'Teste autorizado',
   challenge_rating:1,hp:10,ac:12,size:'M',speed_ft:0,
   melee:{name:'Garras',bonus:2,damage:'1d4+1'},ranged:null,
  });
  const flyer=dndCormyrCreature(provisional);
  expect(flyer.warnings.join(' ')).toContain(formatDndMetres(DND_PROVISIONAL_FLY_SPEED_FT));
  expect(flyer.warnings.join(' ')).not.toMatch(/\bpés\b/i);
 });
 it('faixas métricas respeitam pontos limítrofes',()=>{
  expect(crzRangeHexFromMetres(9)).toBe(2);
  expect(crzRangeHexFromMetres(9.01)).toBe(3);
  expect(crzRangeHexFromMetres(24)).toBe(3);
  expect(crzRangeHexFromMetres(24.01)).toBe(4);
 });
});
