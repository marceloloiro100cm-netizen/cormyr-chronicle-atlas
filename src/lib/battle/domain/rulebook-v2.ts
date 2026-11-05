/** Parâmetros PTE-2.0: experimentais; alterações exigem nova versão. */
export const BATTLE_RULES = Object.freeze({
  version: 'PTE-2.0' as const,
  supportedSizes: [[11,9],[15,11]] as const,
  maxStacksPerSide:5,
  maxCountPerStack:1000,
  maxRounds:20,
  maxSoldierHp:100,
  damageAttackStepBP:400,
  coverForestBP:8000,coverHillBP:9000,
  armorReductionStepBP:400,
  damageAttackFactorMinBP:6000,damageAttackFactorMaxBP:14000,
  defenderGuardBonus:2,
  movementMetresPerHex:15,
});
export function clamp(n:number,min:number,max:number):number {
  if(!Number.isFinite(n)||min>max)throw new Error('Parâmetros numéricos inválidos.');
  return Math.max(min,Math.min(max,n));
}
export function officialAvailableCount(strength:number,casualties:number):number {
  if(!Number.isSafeInteger(strength)||strength<0||!Number.isSafeInteger(casualties)||casualties<0)
    throw new Error('Efetivo/casualties inválidos.');
  return clamp(strength-casualties,0,strength);
}
export function officialMovementHex(metres:number):number {
  if(!Number.isFinite(metres)||metres<0)throw new Error('Movimento em metros inválido.');
  return clamp(Math.ceil(metres/BATTLE_RULES.movementMetresPerHex),1,6);
}
