import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {v34NewGame,v34Act,v34Replay,v34ActionSchema,V34_RULES_VERSION,
 type V34Receipt} from '@/lib/battle/v3/synced';
import {battleHash} from '@/lib/battle/domain/replay';
import {getLegalActions} from '@/lib/battle/domain/turns';

const initial=()=>v34NewGame({
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet',defenderCommander:'knight',
 scenario:'plain-open',opponent:'human',
});
const read=(p:string)=>readFileSync(resolve(p),'utf8');
describe('Cruzada V3.4 — duas contas, comandos e replay',()=>{
 it('gera um estado inicial imutável e sintético para os dois lados',()=>{
  expect(V34_RULES_VERSION).toBe('CCA-V34-SYNC-1');
  const game=initial();
  expect(game.battle.controls).toEqual({attacker:'human',defender:'human'});
  expect(game.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
  expect(game.battle.rulesVersion).toBe('PTE-2.0');
  expect(battleHash(initial())).toBe(battleHash(game));
 });
 it('obriga o lado correto e recusa fechamento manual remoto',()=>{
  const game=initial(),unit=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const other=unit.side==='attacker'?'defender':'attacker';
  expect(()=>v34Act(game,other,{kind:'order',command:{
   type:'END_ACTIVATION',unitId:unit.id,
  }})).toThrow(/vez/i);
  expect(()=>v34Act(game,unit.side,{kind:'order',command:{
   type:'MANUAL_FINISH',reason:'Encerrar por narrador',winnerSide:'attacker',
  }})).toThrow();
  expect(v34ActionSchema.safeParse({kind:'power',targetId:'x',admin:true}).success).toBe(false);
 });
 it('verifica SHA-256 de cada comando e rejeita alteração do histórico',()=>{
  const game=initial();
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const cmd=getLegalActions(game.battle).find(s=>s.type==='END_ACTIVATION')!;
  const action={kind:'order' as const,command:cmd};
  const next=v34Act(game,active.side,action);
  const entry:V34Receipt={seq:1,side:active.side,actorId:'player-a',
   commandId:'id-a',action,prevHash:battleHash(game),stateHash:battleHash(next)};
  expect(battleHash(v34Replay(game,[entry],entry.stateHash))).toBe(entry.stateHash);
  expect(()=>v34Replay(game,[{...entry,seq:2}],entry.stateHash)).toThrow(/Integridade/i);
  expect(()=>v34Replay(game,[{...entry,stateHash:'b'.repeat(64)}])).toThrow(/diverge/i);
  expect(()=>v34Replay(game,[{...entry,side:active.side==='attacker'?'defender':'attacker'}]))
   .toThrow();
 });
 it('somente service_role escreve; membro lê mediante RLS e revogação dinâmica',()=>{
  const sql=read('docs/battle/sql/0078_battle_v34_synced_sessions.sql');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  expect(sql).toContain('battle_v34_can_control');
  expect(sql).toContain('public.in_campaign_house(attacker_house_id,false)');
  expect(sql).toContain('public.in_campaign_house(defender_house_id,false)');
  expect(sql).toContain('GRANT SELECT ON TABLE');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.battle_v34_commit_step');
  expect(sql).toContain('TO service_role;');
  expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).* TO authenticated/);
  expect(sql).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM)\\s+public\\.noble_house_sheets/i);
  expect(sql).not.toContain('public.house_operation');
 });
 it('backend revalida acesso e cadeira antes de gravar; produção bloqueada por flag',()=>{
  const server=read('src/lib/battle/v3/synced.functions.ts');
  const client=read('src/lib/battle/feature-flag.ts');
  expect(server).toContain("process.env['ENABLE_BATTLE_V34_SYNC']!=='true'");
  expect(client).toContain("VITE_ENABLE_BATTLE_V34_SYNC']==='true'");
  expect(server).toContain('requireSupabaseAuth');
  expect(server).toContain('await member(db,house)');
  expect(server).toContain('await access(db)');
  expect(server).toContain('v34Replay(original,receipts,session.current_hash)');
  expect(server).toContain("rpc('battle_v34_commit_step'");
  expect(server).not.toContain('changeUnitState(');
  expect(server).not.toContain('houseOperation(');
 });
});
