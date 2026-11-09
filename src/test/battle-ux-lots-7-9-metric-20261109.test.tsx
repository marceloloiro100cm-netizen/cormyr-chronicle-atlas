import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BattleGotGuide} from '@/components/battle/BattleGotGuide';
import {BattleSaveScope} from '@/components/battle/BattleSaveScope';
import {feetToMetresExact,feetToDndMetres,dndMetresToFeet,formatDndMetres}
 from '@/lib/crusade/dnd-metric';
import {DND_FEET_PER_SQUARE} from '@/lib/crusade/dnd-mode';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('lote 7 — D&D em metros sem mudar o motor',()=>{
 it('mantém conversão física exata e exibe medidas de mesa simples',()=>{
  expect(feetToMetresExact(10)).toBeCloseTo(3.048,5);
  expect(DND_FEET_PER_SQUARE).toBe(10);
  expect([5,10,15,30,60].map(formatDndMetres)).toEqual([
   '1,5 m','3 m','4,5 m','9 m','18 m',
  ]);
 });
 it('converte medidas do editor de volta às velocidades legadas em pés',()=>{
  for(const feet of [0,5,10,15,30,35,60]){
   expect(dndMetresToFeet(feetToDndMetres(feet))).toBe(feet);
  }
  expect(()=>dndMetresToFeet(-1)).toThrow();
  expect(()=>feetToDndMetres(Number.POSITIVE_INFINITY)).toThrow();
 });
 it('recolhe todas as fases GOT, mas conserva sua sequência e fase atual',()=>{
  render(<BattleGotGuide phase="orders" hasHeroes={false} hasSiege={false}/>);
  const details=screen.getByText('Ver fases · 4/6').closest('details');
  expect(details).not.toBeNull();
  expect((details as HTMLDetailsElement).open).toBe(false);
  expect(screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'})
   .querySelectorAll('li')).toHaveLength(6);
 });
 it('remove General sem ativo do D&D, conservando CRZ',()=>{
  const crz=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(crz).toContain('!dndMode&&<span className="battle-unified-leader-label"');
  expect(crz).toContain("teamName(unit.side)");
  expect(crz).toContain('formatDndMetres(inspected.template.speedFt.walk)');
  expect(crz).toContain('quadrados de 3 m');
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
 });
});

describe('lotes 8–9 — histórico claro e continuidade sem alterar persistência',()=>{
 it('informa onde ficam partidas GOT, D&D, Adaptado e V3',()=>{
  const view=render(<BattleSaveScope system="got"/>);
  expect(screen.getByText('Salvo neste navegador')).toBeInTheDocument();
  view.rerender(<BattleSaveScope system="dnd"/>);
  expect(screen.getByText('Salvo na conta do Narrador')).toBeInTheDocument();
  view.rerender(<BattleSaveScope system="v3"/>);
  expect(screen.getByText('Salvo como arquivo')).toBeInTheDocument();
 });
 it('mantém modo de salvamento original, com uma interface de continuidade consistente',()=>{
  const hub=readFileSync('src/components/battle/BattleNarratorHub.tsx','utf8');
  expect(hub).toContain('Continuar batalha');
  expect(hub).toContain('<BattleSaveScope system={rulesetMode}/>');
  const got=readFileSync('src/components/battle/BattleGotGame.tsx','utf8');
  const crz=readFileSync('src/components/battle/BattleCrzLab.tsx','utf8');
  expect(got).toContain('loadLocalBattle');
  expect(crz).toContain('loadDndBattle(restoreBattleId)');
  expect(crz).toContain('crzEventLabel(recentAction,frame.stacks)');
 });
 it('garante controles de toque e menu técnico recolhível',()=>{
  const css=readFileSync('src/components/battle/battle-ux-lots-4-6.css','utf8');
  expect(css).toContain('battle-crz-utilities');
  expect(css).toContain('@media(pointer:coarse)');
  expect(css).toContain('min-height:44px');
  expect(css).toContain('prefers-reduced-motion');
 });
});
