import {describe,it,expect} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {V3_COMMANDERS} from '@/lib/battle/v3/commanders';
import {createV3Game,v3CanUseCommander,v3UseCommander} from '@/lib/battle/v3/engine';
import {v3NewCommanderProgress,v3CommanderTalents,v3CommanderLevel,
 v3AwardCommanderXp,v3ChooseCommanderTalent,v3TrainingReward,
 v3CommanderPowerLimit,v3ProgressValid} from '@/lib/battle/v3/commander-progression';
import {BattleV3Game} from '@/components/battle/BattleV3Game';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'knight' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Cruzada V3.2 — academia original de comandantes',()=>{
 it('oferece quatro talentos originais por cada um dos dez estilos',()=>{
  expect(V3_COMMANDERS).toHaveLength(10);
  const ids=V3_COMMANDERS.flatMap(c=>v3CommanderTalents(c.id).map(t=>t.id));
  expect(ids).toHaveLength(40);
  expect(new Set(ids).size).toBe(40);
  for(const c of V3_COMMANDERS)
   expect(v3CommanderTalents(c.id).map(t=>t.minLevel)).toEqual([2,3,4,5]);
 });
 it('concede níveis com pontos limitados sem editar fichas de campanha',()=>{
  const initial=v3NewCommanderProgress();
  expect(v3CommanderLevel(initial.xp)).toBe(1);
  expect(()=>v3ChooseCommanderTalent('tillet',initial,'tillet:battlecraft')).toThrow();
  const gained=v3AwardCommanderXp(initial,120);
  expect(v3CommanderLevel(gained.xp)).toBe(2);
  const trained=v3ChooseCommanderTalent('tillet',gained,'tillet:battlecraft');
  expect(trained.selectedTalents).toEqual(['tillet:battlecraft']);
  expect(initial.selectedTalents).toEqual([]);
  expect(()=>v3ChooseCommanderTalent('tillet',trained,'tillet:battlecraft')).toThrow();
  expect(()=>v3ChooseCommanderTalent('noble',trained,'tillet:fortitude')).toThrow();
  expect(()=>v3ChooseCommanderTalent('tillet',trained,'tillet:fortitude')).toThrow();
  expect(()=>v3AwardCommanderXp(initial,1000)).toThrow();
  expect(v3TrainingReward('attacker','attacker',4))
   .toBeGreaterThan(v3TrainingReward('attacker','defender',4));
 });
 it('aplica bônus da especialidade só ao snapshot V3 e preserva PTE-2.0',()=>{
  const progress=v3ChooseCommanderTalent('tillet',
   v3AwardCommanderXp(v3NewCommanderProgress(),120),'tillet:battlecraft');
  const base=createV3Game(options);
  const trained=createV3Game({...options,progressions:{
   attacker:progress,defender:v3NewCommanderProgress(),
  }});
  const old=base.battle.stacks.find(s=>s.side==='attacker'&&s.primaryTypeId==='infantry')!;
  const modified=trained.battle.stacks.find(s=>s.id===old.id)!;
  expect(modified.attack).toBe(old.attack+1);
  const archer=base.battle.stacks.find(s=>s.side==='attacker'&&s.primaryTypeId==='archers')!;
  expect(trained.battle.stacks.find(s=>s.id===archer.id)?.attack).toBe(archer.attack);
  expect(modified.source.kind).toBe('fictional');
  expect(trained.battle.rulesVersion).toBe('PTE-2.0');
  expect(base.powerUses).toEqual({attacker:0,defender:0});
 });
 it('libera exatamente duas cargas da habilidade assinatura, sem duplicar o poder padrão',()=>{
  let xp=v3NewCommanderProgress();
  for(let i=0;i<3;i++)xp=v3AwardCommanderXp(xp,250);
  expect(v3CommanderLevel(xp.xp)).toBe(5);
  const improved=v3ChooseCommanderTalent('tillet',xp,'tillet:signature');
  expect(v3ProgressValid('tillet',improved)).toBe(true);
  expect(v3CommanderPowerLimit('tillet',improved)).toBe(2);
  const bad={...improved,selectedTalents:['tillet:signature','noble:signature'] as const};
  expect(v3ProgressValid('tillet',bad)).toBe(false);
  const game=createV3Game({...options,progressions:{
   attacker:improved,defender:v3NewCommanderProgress(),
  }});
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const side=active.side;
  const ally=game.battle.stacks.find(s=>s.side===side)!;
  expect(v3CanUseCommander(game)).toBe(true);
  const once=v3UseCommander(game,ally.id);
  expect(once.powerUses?.[side]).toBe(1);
  expect(v3CanUseCommander(once)).toBe(true);
  const twice=v3UseCommander(once,ally.id);
  expect(twice.powerUses?.[side]).toBe(2);
  expect(v3CanUseCommander(twice)).toBe(false);
  expect(()=>v3UseCommander(twice,ally.id)).toThrow();
 });
 it('mostra a academia e o estado inicial dos talentos no preparo da Cruzada',()=>{
  render(<BattleV3Game/>);
  const academy=within(screen.getByRole('region',{name:'Treinamento Capitã Elira Thal'}));
  expect(academy.getByText(/Academia de comando · Nível 1/)).toBeInTheDocument();
  expect(academy.getAllByRole('button',{name:'Bloqueado'})).toHaveLength(4);
  expect(screen.getByRole('button',{name:'Batalhar'})).toBeInTheDocument();
 });
});
