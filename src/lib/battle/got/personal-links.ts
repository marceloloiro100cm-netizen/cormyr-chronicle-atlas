import type {WarBattle} from './types';
import type {WarHero} from './heroes';

/** Removes only physical restraints that require an *active* grappler.
 * A spear lodged in a body and a net remain in place after their
 * wielder is defeated; those conditions require separate removal.
 */
export function releaseBrokenPersonalGrapples(battle:WarBattle):WarBattle{
 const byId=new Map(battle.heroes.map(h=>[h.id,h]));
 function holderValid(holderId:string|undefined,victim:WarHero):boolean{
  if(!holderId||!victim.active)return false;
  const holder=byId.get(holderId);
  return Boolean(holder?.active&&!holder.surrendered&&
   holder.grapplingTargetId===victim.id&&
   victim.grabbedBy===holderId);
 }
 function victimValid(victimId:string|undefined,holder:WarHero):boolean{
  if(!victimId||!holder.active||holder.surrendered)return false;
  const victim=byId.get(victimId);
  return Boolean(victim?.active&&victim.grabbedBy===holder.id);
 }
 const heroes=battle.heroes.map(h=>{
  const held=holderValid(h.grabbedBy,h);
  const holding=victimValid(h.grapplingTargetId,h);
  const pinned=held&&h.pinnedByHero===h.grabbedBy&&
   byId.get(h.grabbedBy!)?.pinningTargetId===h.id;
  const pinning=holding&&h.pinningTargetId===h.grapplingTargetId&&
   byId.get(h.grapplingTargetId!)?.pinnedByHero===h.id;
  if(held===Boolean(h.grabbedBy)&&holding===Boolean(h.grapplingTargetId)&&
   pinned===Boolean(h.pinnedByHero)&&pinning===Boolean(h.pinningTargetId))
   return h;
  return {...h,
   ...(held?{}:{grabbedBy:undefined}),
   ...(holding?{}:{grapplingTargetId:undefined}),
   ...(pinned?{}:{pinnedByHero:undefined}),
   ...(pinning?{}:{pinningTargetId:undefined})};
 });
 return heroes.every((h,i)=>h===battle.heroes[i])?
  battle:{...battle,heroes};
}
