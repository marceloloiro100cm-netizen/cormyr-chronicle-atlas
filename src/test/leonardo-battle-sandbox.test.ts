import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {canUseSpecialBattleSandbox} from '@/lib/battle/special-user-access';

const leonardo={id:'player-leonardo',name:'Leonardo',roster_house_id:'espiao',active:true,require_password_change:false};
const membership=[{player_id:'player-leonardo',house_id:'espiao'}];

describe('Leonardo — acesso de usuário ao simulador isolado',()=>{
 it('nega o simulador para qualquer identidade editorial ou legacy Espião',()=>{
  expect(canUseSpecialBattleSandbox(false,leonardo,membership)).toBe(false);
  expect(canUseSpecialBattleSandbox(true,leonardo,membership)).toBe(false);
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
 it('não oferece batalhas a Leonardo nem a perfis editoriais',()=>{
  const route=readFileSync('src/routes/_authenticated/jogadores.tsx','utf8');
  const flags=readFileSync('src/lib/battle/feature-flag.ts','utf8');
  expect(flags).toContain('BATTLE_PLAYERS_ENABLED=false');
  expect(route).toContain("scope.data.profile==='editor'");
  expect(route).not.toContain('<BattleLeonardoSandbox');
  expect(route).not.toContain('specialBattleAccess');
 });

});
