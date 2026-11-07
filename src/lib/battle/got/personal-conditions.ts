import type {WarBattle} from './types';

/** Grapple and pin require active participants. On defeat or surrender, release
 * stale holds so survivors cannot remain immobilized by an absent combatant.
 * Entangle and impale are physical equipment effects and intentionally remain.
 */
export function clearInactivePersonalGrapples(battle:WarBattle):WarBattle{
 const live=new Set(battle.heroes.filter(h=>h.active&&!h.surrendered).map(h=>h.id));
 const freed=new Set<string>();
 const heroes=battle.heroes.map(h=>{
  const releaseIncoming=Boolean(h.grabbedBy&&!live.has(h.grabbedBy));
  const releasePin=Boolean(h.pinnedByHero&&!live.has(h.pinnedByHero));
  const releaseOutgoing=Boolean(h.grapplingTargetId&&!live.has(h.grapplingTargetId));
  const releaseOutgoingPin=Boolean(h.pinningTargetId&&!live.has(h.pinningTargetId));
  if(!releaseIncoming&&!releasePin&&!releaseOutgoing&&!releaseOutgoingPin&&
   (h.active&&!h.surrendered||
    (!h.grabbedBy&&!h.pinnedByHero&&!h.grapplingTargetId&&!h.pinningTargetId)))
   return h;
  if(releaseIncoming||releasePin)freed.add(h.name);
  return {...h,
   ...(releaseIncoming||!h.active||h.surrendered?{grabbedBy:undefined}:{}),
   ...(releasePin||!h.active||h.surrendered?{pinnedByHero:undefined}:{}),
   ...(releaseOutgoing||!h.active||h.surrendered?{grapplingTargetId:undefined}:{}),
   ...(releaseOutgoingPin||!h.active||h.surrendered?{pinningTargetId:undefined}:{}),
  };
 });
 if(!freed.size&&heroes.every((h,i)=>h===battle.heroes[i]))return battle;
 return {...battle,heroes,
  events:[...battle.events,...[...freed].map((name,i)=>({
   seq:battle.events.length+i+1,round:battle.round,side:null,
   kind:'personal-grapple-freed',
   text:name+' ficou livre de uma contenção cujo agarrador foi derrotado ou se rendeu.',
  }))],
 };
}
