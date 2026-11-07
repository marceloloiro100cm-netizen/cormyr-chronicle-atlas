import {rollDice} from './dice';
import type {WarBattle,WarUnit,WarSide} from './types';

type Damage=(battle:WarBattle,target:WarUnit,amount:number,name:string)=>WarBattle;
const event=(b:WarBattle,side:WarSide|null,kind:string,message:string):WarBattle=>({
 ...b,events:[...b.events,{seq:b.events.length+1,round:b.round,side,
  kind,text:message}],
});
/** Ignite for 2d6 subsequent battle rounds after initial wildfire damage.
 * Repeated hits never shorten an existing fire.
 */
export function igniteWarUnit(battle:WarBattle,targetId:string,source:string,
 damagePerRound=7,dieCount=2):WarBattle{
 const target=battle.units.find(u=>u.id===targetId);
 if(!target||['destroyed','escaped','surrendered'].includes(target.condition))
  return battle;
 if(dieCount<1||dieCount>2||damagePerRound<1)
  throw new Error('Parâmetros de incêndio inválidos.');
 const roll=rollDice(battle.seed,dieCount);
 const duration=roll.dice.reduce((s,n)=>s+n,0);
 const current=target.burning;
 const burning={
  remainingRounds:Math.max(duration,current?.remainingRounds??0),
  damagePerRound:Math.max(damagePerRound,current?.damagePerRound??0),
  source,
 };
 const next:WarBattle={...battle,seed:roll.nextSeed,
  units:battle.units.map(u=>u.id===targetId?{...u,burning}:u)};
 return event(next,target.side,'wildfire-ignite',target.name+
  ' incendiou-se por '+burning.remainingRounds+' rodada(s).');
}
/** Step 9/10: resolves only fires burning at the start of this round.
 * One seeded 1d6 check allows routed units to spread wildfire
 * into an adjacent unit; effects are local to the simulated battle.
 */
export function advanceWarFire(battle:WarBattle,applyDamage:Damage):WarBattle{
 let next=battle;
 const burningAtStart=battle.units.filter(u=>u.burning&&
  u.burning.remainingRounds>0&&u.condition!=='destroyed'&&
  u.condition!=='escaped'&&u.condition!=='surrendered');
 for(const initial of burningAtStart){
  const unit=next.units.find(u=>u.id===initial.id);
  if(!unit?.burning||unit.condition==='destroyed')continue;
  const status=unit.burning;
  next={...next,units:next.units.map(u=>u.id===unit.id?{
   ...u,burning:status.remainingRounds>1?{
    ...status,remainingRounds:status.remainingRounds-1,
   }:undefined,
  }:u)};
  next=event(next,unit.side,'wildfire-tick',unit.name+' sofreu '+status.damagePerRound+
   ' de dano persistente de '+status.source+'.');
  const current=next.units.find(u=>u.id===unit.id)!;
  next=applyDamage(next,current,status.damagePerRound,status.source);
  if(initial.condition!=='routed')continue;
  // Check original adjacent neighbours, once per round, to avoid chain reactions.
  for(const other of battle.units.filter(u=>u.id!==initial.id&&
   u.condition!=='destroyed'&&u.condition!=='escaped'&&
   u.condition!=='surrendered'&&!u.burning&&
   Math.max(Math.abs(u.position.x-initial.position.x),
    Math.abs(u.position.y-initial.position.y))<=1)){
   const roll=rollDice(next.seed,1);
   next={...next,seed:roll.nextSeed};
   if(roll.dice[0]!<=3){
    next=igniteWarUnit(next,other.id,initial.name+' (fogo espalhado)',3,1);
    next=event(next,other.side,'wildfire-spread',
     initial.name+' espalhou fogo a '+other.name+'.');
   }
  }
 }
 return next;
}
