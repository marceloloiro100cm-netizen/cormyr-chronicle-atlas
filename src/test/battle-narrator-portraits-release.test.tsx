import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {BATTLE_COMMANDER_PORTRAITS,commanderPortraitUrl}
 from '@/lib/battle/v3/commander-portraits';
import {V3_COMMANDERS,commander} from '@/lib/battle/v3/commanders';
import {BATTLE_PLAYERS_ENABLED,BATTLE_MODULE_ENABLED}
 from '@/lib/battle/feature-flag';
import {BattleCommanderPortrait} from '@/components/battle/BattleCommanderPortrait';

describe('Publicação de batalha exclusiva do Narrador · retratos',()=>{
 it('correlaciona os vinte arquétipos com exatamente vinte imagens locais',()=>{
  expect(Object.keys(BATTLE_COMMANDER_PORTRAITS)).toHaveLength(20);
  expect(V3_COMMANDERS).toHaveLength(20);
  const ids=new Set(V3_COMMANDERS.map(c=>c.id));
  expect(ids.size).toBe(20);
  expect(Object.keys(BATTLE_COMMANDER_PORTRAITS).sort()).toEqual([...ids].sort());
  const files=new Set(Object.values(BATTLE_COMMANDER_PORTRAITS).map(x=>x.file));
  const drives=new Set(Object.values(BATTLE_COMMANDER_PORTRAITS).map(x=>x.driveId));
  expect(files.size).toBe(20);
  expect(drives.size).toBe(20);
  for(const id of ids){
   expect(commander(id).name).toBeTruthy();
   expect(commanderPortraitUrl(id)).toMatch(/^\/battle\/commanders\/[0-9]{2}-[a-z-]+\.webp$/);
  }
 });
 it('renderiza o retrato sem nome sobreposto e com fallback acessível',()=>{
  render(<BattleCommanderPortrait id="tillet"/>);
  const img=screen.getByRole('img',{name:'Comandante: Tillet'});
  expect(img.getAttribute('src')).toBe('/battle/commanders/01-tillet.webp');
  expect(img.getAttribute('loading')).toBe('lazy');
 });
 it('jogadores não veem o módulo nem convocações enquanto o Narrador recebe a ferramenta',()=>{
  expect(BATTLE_MODULE_ENABLED).toBe(true);
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
  const route=readFileSync('src/routes/_authenticated/jogadores.tsx','utf8');
  const hub=readFileSync('src/components/battle/BattleNarratorHub.tsx','utf8');
  expect(route).toContain("!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED?");
  expect(route).toContain("tab==='batalha'&&!data.admin&&BATTLE_MODULE_ENABLED&&BATTLE_PLAYERS_ENABLED&&<BattleV3PlayerEntry");
  expect(route).toContain("section==='batalha'&&BATTLE_MODULE_ENABLED?<BattleNarratorHub");
  expect(hub).toContain("BATTLE_PLAYERS_ENABLED&&BATTLE_V3_LIVE_ENABLED");
 });
});
