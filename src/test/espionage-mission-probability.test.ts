import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyDiceSuccessPercent,spyMissionOdds,spyTestDifficulty} from '@/lib/espionage/spy-mission-probability';

describe('Espionagem · chance matemática demonstrativa de missão',()=>{
 it('recebe a dificuldade já convertida, inclusive DC acima de 21, sem novo cálculo',()=>{
  expect([6,9,12,21,24,27,30,36,48,51].map(spyTestDifficulty))
   .toEqual([6,9,12,21,24,27,30,36,48,51]);
  expect(()=>spyTestDifficulty(0)).toThrow();
 });
 it('enumera exatamente os 216 resultados equiprováveis de 3D6',()=>{
  expect(spyDiceSuccessPercent(3,6)).toBe(95.4);
  expect(spyDiceSuccessPercent(3,9)).toBe(74.1);
  expect(spyDiceSuccessPercent(3,12)).toBe(37.5);
  expect(spyDiceSuccessPercent(3,15)).toBe(9.3);
  expect(spyDiceSuccessPercent(3,18)).toBe(0.5);
  expect(spyDiceSuccessPercent(3,21)).toBe(0);
 });
 it('reconhece que um resultado igual à dificuldade é sucesso e respeita dados 1D6',()=>{
  expect(spyDiceSuccessPercent(1,3)).toBe(66.7);
  expect(spyDiceSuccessPercent(1,6)).toBe(16.7);
  expect(spyDiceSuccessPercent(1,7)).toBe(0);
 });
 it('Lei 30 já convertida em DC 6 gera chance correta com 3D6',()=>{
  expect(spyMissionOdds(6)).toMatchObject({
   houseDefense:6,testDifficulty:6,successPercent:95.4,
   testDice:3,provisional:true,
  });
  expect(spyMissionOdds(24,6)).toMatchObject({
   houseDefense:24,testDifficulty:24,testDice:6,
  });
 });
 it('recusa dados e resistências inválidas',()=>{
  expect(()=>spyMissionOdds(-1)).toThrow();
  expect(()=>spyMissionOdds(Number.NaN)).toThrow();
  expect(()=>spyDiceSuccessPercent(0,9)).toThrow();
  expect(()=>spyDiceSuccessPercent(8,9)).toThrow();
 });
 it('um alvo mais defendido não pode ganhar maior chance de sucesso',()=>{
  const chances=Array.from({length:95},(_,n)=>spyMissionOdds(n+6).successPercent);
  for(let i=1;i<chances.length;i++)expect(chances[i]).toBeLessThanOrEqual(chances[i-1]!);
 });
 it('consulta somente uma Casa com JWT e jamais transmite fichas integrais ao browser',()=>{
  const sql=readFileSync(resolve('docs/espionage/sql/0088_spy_player_mission_preview_2026_11_03.sql'),'utf8');
  expect(sql).toContain('public.campaign_access_active()');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain('a.owner_house_id=p_house');
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.spy_player_mission_preview");
  const server=readFileSync(resolve('src/lib/espionage/spy-mission-preview.functions.ts'),'utf8');
  expect(server).toContain('requireSupabaseAuth');
  expect(server).not.toContain('return source.data;');
 });
});
