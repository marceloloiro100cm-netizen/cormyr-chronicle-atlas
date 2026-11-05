import type { BattleStack, BattleMap } from './types';
import { clamp } from './rulebook-v2';
import { livingCount, casualtyCount, stateAfterDamage } from './morale';
import { tileAt, TERRAIN } from '../geometry/terrain';

export type DamageResult=Readonly<{
  defender:BattleStack;damage:number;casualties:number;
  aliveBefore:number;aliveAfter:number;residualWoundHp:number;
  rawDamage:number;afterAttack:number;afterCover:number;afterArmor:number;
}>;
/** PTE-2.0: cada estágio aritmético usa floor; armor, terrain, shaken e guard uma vez. */
export function resolveDamage(map:BattleMap,attacker:BattleStack,defender:BattleStack,ranged:boolean):DamageResult{
  if(attacker.currentHp<=0||attacker.moraleState==='routed')throw new Error('Agressor derrotado.');
  if(defender.currentHp<=0||defender.moraleState==='routed')throw new Error('Defensor já derrotado.');
  const terrain=tileAt(map,defender.position);
  if(!terrain||terrain.terrain==='rock')throw new Error('Alvo em terreno inválido.');
  const alive=livingCount(attacker),oldAlive=livingCount(defender);
  const effectiveAttack=Math.max(0,attacker.attack-(attacker.moraleState==='shaken'?1:0));
  const effectiveDefense=clamp(defender.defense+(defender.defenseGuard?2:0)-(defender.moraleState==='shaken'?1:0),0,20);
  const rawDamage=alive*attacker.damagePerSoldier;
  const factor=clamp(10000+400*(effectiveAttack-effectiveDefense),6000,14000);
  const afterAttack=Math.floor(rawDamage*factor/10000);
  const coverBP=ranged?TERRAIN[terrain.terrain].coverBP:10000;
  const afterCover=Math.floor(afterAttack*coverBP/10000);
  const armorReductionBP=Math.min(5000,400*defender.armor);
  const afterArmor=Math.floor(afterCover*(10000-armorReductionBP)/10000);
  const damage=clamp(afterArmor,0,defender.currentHp);
  const updated=stateAfterDamage(defender,defender.currentHp-damage);
  const nowAlive=livingCount(updated);
  return {defender:updated,damage,casualties:oldAlive-nowAlive,
    aliveBefore:oldAlive,aliveAfter:nowAlive,
    residualWoundHp:nowAlive*updated.hpPerSoldier-updated.currentHp,
    rawDamage,afterAttack,afterCover,afterArmor};
}
export function stackTacticalSummary(stack:BattleStack){
  return {initialCount:stack.initialCount,alive:livingCount(stack),
    casualties:casualtyCount(stack),currentHp:stack.currentHp,
    initialHp:stack.initialCount*stack.hpPerSoldier,morale:stack.moraleState};
}
