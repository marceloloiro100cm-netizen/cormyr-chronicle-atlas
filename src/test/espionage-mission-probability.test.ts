import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spyDiceSuccessPercent,spyMissionOdds,spyTestDifficulty} from '@/lib/espionage/spy-mission-probability';

describe('Espionagem · chance matemática demonstrativa de missão',()=>{
 it('converte a Lei/defesa estratégica à escala de dificuldade d6 em passos de 3',()=>{
  expect([0,19,20,39,40,59,60,79,80,99,100,105]
   .map(spyTestDifficulty)).toEqual([6,6,9,9,12,12,15,15,18,18,21,21]);
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
 it('Law 30 gera teste 9 com chance de 74,1%, mas não inventa habilidade do agente',()=>{
  expect(spyMissionOdds(30)).toMatchObject({
   houseDefense:30,testDifficulty:9,successPercent:74.1,
   testDice:3,provisional:true,
  });
 });
 it('recusa dados e resistências inválidas',()=>{
  expect(()=>spyMissionOdds(-1)).toThrow();
  expect(()=>spyMissionOdds(Number.NaN)).toThrow();
  expect(()=>spyDiceSuccessPercent(0,9)).toThrow();
  expect(()=>spyDiceSuccessPercent(8,9)).toThrow();
 });
 it('um alvo mais defendido não pode ganhar maior chance de sucesso',()=>{
  const chances=[...Array(101)].map((_,n)=>spyMissionOdds(n).successPercent);
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
