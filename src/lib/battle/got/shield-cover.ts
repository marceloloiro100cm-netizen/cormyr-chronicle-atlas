import {attackAngle} from './formations';
import type {WarBattle,WarUnit} from './types';

/** Proteção digital opcional de um aliado imediatamente atrás da Parede de Escudos.
 * A unidade protetora deve estar viva, no mesmo lado, adjacente ao protegido e
 * orientada para o atacante. Não acumula vários escudos, não protege flanco/
 * retaguarda, e só se aplica a ataques de Pontaria em formações avançadas.
 * Não altera saves nem a Defesa base das fichas.
 */
export function warShieldWallAllyCover(
 battle:Pick<WarBattle,'advancedFormations'|'units'>,
 attacker:WarUnit,target:WarUnit,ranged:boolean,
):number{
 if(!ranged||!battle.advancedFormations||attacker.side===target.side)return 0;
 for(const wall of battle.units){
  if(wall.side!==target.side||wall.id===target.id||
    wall.formation!=='shield-wall'||
    !['organized','disorganized'].includes(wall.condition))continue;
  const distance=Math.max(Math.abs(wall.position.x-target.position.x),
   Math.abs(wall.position.y-target.position.y));
  if(distance!==1)continue;
  const facing=wall.facing??(wall.side==='attacker'?'east':'west');
  if(attackAngle(attacker.position,wall.position,facing)!=='front')continue;
  if(attackAngle(target.position,wall.position,facing)!=='rear')continue;
  return 5;
 }
 return 0;
}
