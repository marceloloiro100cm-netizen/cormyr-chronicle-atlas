import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {createV3Game,v3UseCommander,v3PlayCommand} from '@/lib/battle/v3/engine';
import {v34NewGame} from '@/lib/battle/v3/synced';
import {V3_COMMANDERS} from '@/lib/battle/v3/commanders';
import {livingCount} from '@/lib/battle/domain/morale';
import {v37Enable,v37Abilities,v37Cast,v37CastSignature,v37CanCast,
 v37CanSignature,V37_RULES_VERSION,V37_ABILITIES} from '@/lib/battle/v3/tactics-v37';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'purple-dragon' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Cruzada V3.7 — energia tática original e isolamento das casas',()=>{
 it('oferece dois estratagemas diferentes para cada um dos dez comandantes',()=>{
  expect(V37_ABILITIES).toHaveLength(20);
  expect(new Set(V37_ABILITIES.map(a=>a.id)).size).toBe(20);
  for(const c of V3_COMMANDERS){
   const abilities=v37Abilities(c.id);
   expect(abilities).toHaveLength(2);
   expect(abilities.every(a=>a.cost>0&&a.cooldownRounds>=2)).toBe(true);
  }
 });
 it('habilita recursos somente por opt-in; multiplayer antigo não recebe novo estado',()=>{
  const old=createV3Game(options);
  expect(old.tactics).toBeUndefined();
  const next=v37Enable(old);
  expect(next.tactics?.rulesVersion).toBe(V37_RULES_VERSION);
  expect(next.tactics?.attacker.energy).toBe(24);
  expect(next.tactics?.defender.energy).toBe(24);
  expect(old.tactics).toBeUndefined();
  expect(()=>v37Enable(next)).toThrow();
  const remote=v34NewGame(options);
  expect(remote.tactics).toBeUndefined();
  expect(remote.battle.rulesVersion).toBe(old.battle.rulesVersion);
 });
 it('usa uma ação de comando por rodada, consome energia, aplica recarga e verifica alvos',()=>{
  const game=v37Enable(createV3Game(options));
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const ability=v37Abilities(game.commanders[active.side])[0]!;
  const allied=game.battle.stacks.find(s=>s.side===active.side)!;
  const enemy=game.battle.stacks.find(s=>s.side!==active.side)!;
  const target=ability.target==='ally'?allied:enemy;
  expect(v37CanCast(game,ability.id)).toBe(true);
  expect(()=>v37Cast(game,ability.id,ability.target==='ally'?enemy.id:allied.id))
   .toThrow(/lado incorreto/i);
  const next=v37Cast(game,ability.id,target.id);
  expect(next.tactics?.[active.side].energy).toBe(24-ability.cost);
  expect(next.tactics?.[active.side].actedRound).toBe(1);
  expect(next.log.at(-1)?.label).toContain(ability.name);
  expect(game.tactics?.[active.side].energy).toBe(24);
  expect(v37CanCast(next,ability.id)).toBe(false);
  expect(()=>v37Cast(next,ability.id,target.id)).toThrow(/já agiu/);
  let future=next;
  for(let n=0;n<40&&future.battle.round<2;n++){
   const current=future.battle.activeUnitId;
   if(!current)break;
   future=v3PlayCommand(future,{type:'END_ACTIVATION',unitId:current});
  }
  expect(future.battle.round).toBe(2);
  const acting=future.battle.stacks.find(s=>s.id===future.battle.activeUnitId)!;
  if(acting.side===active.side)expect(v37CanCast(future,ability.id)).toBe(false);
 });
 it('assinatura gasta energia e é limitada a uma por batalha conforme os talentos',()=>{
  const game=v37Enable(createV3Game(options));
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const ally=game.battle.stacks.find(s=>s.side===actor.side)!;
  expect(v37CanSignature(game)).toBe(true);
  expect(()=>v3UseCommander(game,ally.id)).toThrow(/versionado/i);
  const cast=v37CastSignature(game,ally.id);
  expect(cast.tactics?.[actor.side].energy).toBe(16);
  expect(cast.powerUses?.[actor.side]).toBe(1);
  expect(v37CanSignature(cast)).toBe(false);
  expect(game.usedPowers[actor.side]).toBe(false);
 });
 it('cura soldados vivos sem ressuscitar baixas da pilha',()=>{
  const game=v37Enable(createV3Game({...options,
   attackerCommander:'priest',defenderCommander:'priest'}));
  const actor=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const woundedHp=actor.currentHp-actor.hpPerSoldier-10;
  const patched={...game,battle:{...game.battle,
   stacks:game.battle.stacks.map(s=>s.id===actor.id?{...s,currentHp:woundedHp}:s)}};
  const before=patched.battle.stacks.find(s=>s.id===actor.id)!;
  const after=v37Cast(patched,'priest-mend',actor.id);
  const now=after.battle.stacks.find(s=>s.id===actor.id)!;
  expect(now.currentHp).toBeGreaterThan(before.currentHp);
  expect(livingCount(now)).toBe(livingCount(before));
  expect(now.currentHp).toBeLessThanOrEqual(livingCount(before)*before.hpPerSoldier);
 });
 it('na tela, exibe energia e repertório apenas nas batalhas de treinamento',()=>{
  render(<BattleV3Game/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const panel=screen.getByRole('region',{name:'Comandante na mesa de guerra'});
  expect(panel).toHaveTextContent('Energia de comando');
  expect(screen.getByLabelText('Estratagemas do comandante')).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Fila de iniciativa da Cruzada'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Barra inferior de ações de batalha'})).toBeInTheDocument();
  expect(screen.getByText(/Simulação: as fichas das casas continuam intactas/)).toBeInTheDocument();
 });
});
