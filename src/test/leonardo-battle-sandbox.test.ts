import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {canUseSpecialBattleSandbox} from '@/lib/battle/special-user-access';

const leonardo={id:'player-leonardo',name:'Leonardo',roster_house_id:'espiao',active:true,require_password_change:false};
const membership=[{player_id:'player-leonardo',house_id:'espiao'}];

describe('Leonardo — acesso de usuário ao simulador isolado',()=>{
 it('permite apenas o jogador ativo vinculado à identidade especial',()=>{
  expect(canUseSpecialBattleSandbox(false,leonardo,membership)).toBe(true);
  expect(canUseSpecialBattleSandbox(true,leonardo,membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(false,{...leonardo,name:'Outro'},membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(false,{...leonardo,roster_house_id:'evenhand'},membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(false,{...leonardo,active:false},membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(false,{...leonardo,require_password_change:true},membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(false,leonardo,[])).toBe(false);
  expect(canUseSpecialBattleSandbox(false,leonardo,[{player_id:'other',house_id:'espiao'}])).toBe(false);
  expect(canUseSpecialBattleSandbox(false,leonardo,[{player_id:'player-leonardo',house_id:'evenhand'}])).toBe(false);
  expect(canUseSpecialBattleSandbox(false,null,membership)).toBe(false);
 });
 it('libera três modos locais sem usar API de fichas ou gravação da campanha',()=>{
  const entry=readFileSync('src/components/battle/BattleLeonardoSandbox.tsx','utf8');
  expect(entry).toContain('BattleRulesetSelector');
  expect(entry).toContain("<GotSandbox playerSandbox");
  expect(entry).toContain('<DndSandbox mode="dnd" playerSandbox');
  expect(entry).toContain("active==='adapted'");
  expect(entry).toContain('Criar simulação');
  expect(entry).not.toMatch(/useServerFn|supabaseAdmin|saveBattleReplay|previewBattleSourceStack|BattleNarratorHub|BattleGotConvocation|BattleV3LiveArena/);
 });
 it('mantém outros jogadores fechados e só exibe o piloto após vínculo autenticado',()=>{
  const route=readFileSync('src/routes/_authenticated/jogadores.tsx','utf8');
  const flags=readFileSync('src/lib/battle/feature-flag.ts','utf8');
  expect(flags).toContain('BATTLE_PLAYERS_ENABLED=false');
  expect(route).toContain('canUseSpecialBattleSandbox');
  expect(route).toContain('specialBattleAccess');
  expect(route).toContain('<BattleLeonardoSandbox userId={data.user.id}/>');
 });
});
