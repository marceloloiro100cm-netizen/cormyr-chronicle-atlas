import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const source=(file:string)=>readFileSync(file,'utf8');
const css=source('src/components/battle/battle-legibility.css');

describe('Cormyr: legibilidade consistente no Módulo de batalha',()=>{
 it('aplica estilo apenas ao módulo e não altera tokens ou o motor tático',()=>{
  expect(css).toContain('.battle-module');
  expect(css).not.toContain('body{');
  expect(css).not.toContain(':root{');
  expect(css).not.toContain('svg text');
  expect(css).toContain('--battle-legibility-ink:#f7ecda');
  expect(css).toContain('--battle-legibility-control:#263137');
  expect(css).toContain('button[class~="bg-background"]');
  expect(css).toContain('button:disabled');
  expect(css).toContain('opacity:1!important');
 });
 it('carrega os estilos para Narrador, jogador e as arenas V3 e CRZ',()=>{
  for(const file of [
   'src/components/battle/BattleNarratorHub.tsx',
   'src/components/battle/BattleV3PlayerEntry.tsx',
   'src/components/battle/BattleV3Game.tsx',
   'src/components/battle/BattleCrzLab.tsx',
  ])expect(source(file)).toContain("import './battle-legibility.css';");
 });
 it('preserva os tamanhos de leitura e a responsividade',()=>{
  expect(css).toContain('font-size:16px');
  expect(css).toContain('font-size:17px');
  expect(css).toContain('font-size:15px');
  expect(css).toContain('@media(max-width:720px)');
  expect(css).toContain('.crusade-v4-turn-card strong');
  expect(css).toContain('.crz-turn-card strong');
  expect(css).toContain('.battle-home-actions button');
 });
 it('mantém regras, perfis, segurança e dados fora do escopo do patch',()=>{
  expect(css).not.toMatch(/https?:\/\//);
  expect(css).not.toMatch(/supabase|service_role|cookie|localStorage/i);
  const narrator=source('src/components/battle/BattleNarratorHub.tsx');
  expect(narrator).toContain("setView('crusade')");
  expect(narrator).toContain("setView('crz')");
 });
});
