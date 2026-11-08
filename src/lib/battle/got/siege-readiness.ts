import type {WarBattle,WarPosition,WarSide} from './types';
import {WAR_SIEGE_CATALOG,warSiegeDistanceMetres,warSiegeReloadRemaining} from './siege';
import {canSeeWarTarget} from './line-of-sight';
import {terrainAt,terrainEffect} from './terrain';

export type WarSiegeReadiness=Readonly<{
 weaponId:string;weaponName:string;engineerId:string;engineerName:string|null;
 ammo:string;rangeMetres:number;distanceMetres:number|null;
 reloadRemaining:number;remainingHealth:number;available:boolean;
 blockers:readonly string[];
}>;

/** Auditoria local da prontidão das armas. Não reserva ordem, dispara ou
 * consome munição. A autoridade para executar permanece fireWarSiegeVolley.
 * Apenas coordenadas de quadrado são transportadas entre tela e motor.
 */
export function previewWarSiegeReadiness(
 battle:WarBattle,side:WarSide,target:WarPosition|null,
 options?:{targetHidden?:boolean},
):readonly WarSiegeReadiness[]{
 return battle.siege.filter(w=>w.side===side).map(weapon=>{
  const profile=WAR_SIEGE_CATALOG[weapon.kind];
  const operator=battle.units.find(u=>u.id===weapon.engineerId);
  const reloadRemaining=warSiegeReloadRemaining(weapon,battle.round);
  const distanceMetres=target?warSiegeDistanceMetres(weapon,target):null;
  const blockers:string[]=[];
  if(weapon.health<1)blockers.push('Máquina destruída.');
  // Tabela 10-3: montanhas proíbem artilharia atacante. Defensores
  // só podem utilizá-la nesta zona se possuírem fortificação.
  const square=terrainEffect(terrainAt(battle.tiles,weapon.position));
  const defendedFort=battle.fortifications.some(f=>f.side===side&&
   !f.breached&&f.structuralHealth!==0);
  if(square.noSiege&&(side==='attacker'||!defendedFort))
   blockers.push('Terreno proíbe armas de cerco nesta posição.');
  if(!operator||operator.side!==side||operator.typeId!=='engineers'||
   !['organized','disorganized'].includes(operator.condition))
   blockers.push('Unidade de engenheiros indisponível.');
  if(reloadRemaining>0)blockers.push('Recarga pendente: '+reloadRemaining+' rodada(s).');
  if(!target)blockers.push('Escolha o alvo.');
  else{
   if(distanceMetres!>profile.rangeMetres)
    blockers.push('Alvo fora do alcance ('+distanceMetres+' / '+profile.rangeMetres+' m).');
   if(battle.strictLineOfSight&&weapon.kind==='scorpion'&&
    !canSeeWarTarget(weapon.position,target,battle.tiles))
    blockers.push('Escorpião sem linha de visão.');
  }
  if(options?.targetHidden)blockers.push('A tropa alvo permanece oculta.');
  if(battle.siegeCompleted[side])blockers.push('Fase de cerco deste exército concluída.');
  return {weaponId:weapon.id,weaponName:weapon.name,engineerId:weapon.engineerId,
   engineerName:operator?.name??null,ammo:weapon.ammo,
   rangeMetres:profile.rangeMetres,distanceMetres,reloadRemaining,
   remainingHealth:weapon.health,available:blockers.length===0,blockers};
 });
}
