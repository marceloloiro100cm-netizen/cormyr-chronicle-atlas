import {rollDice} from './dice';
import type {WarBattle,WarUnit,WarSide} from './types';

type Damage=(battle:WarBattle,target:WarUnit,amount:number,name:string)=>WarBattle;
const event=(b:WarBattle,side:WarSide|null,kind:string,message:string):WarBattle=>({
 ...b,events:[...b.events,{seq:b.events.length+1,round:b.round,side,
  kind,text:message}],
});
/** Óleo fervente só se inflama ao entrar em contato com fogo já ativo.
 * Um único teste de 1d6 define a duração secundária; impactos repetidos
 * não multiplicam nem reiniciam o efeito.
 */
export function igniteWarOil(battle:WarBattle,targetId:string):WarBattle{
 const target=battle.units.find(u=>u.id===targetId);
 if(!target?.oilSoaked||!target.burning||target.oilIgnition||
  ['destroyed','surrendered','escaped'].includes(target.condition))return battle;
 const roll=rollDice(battle.seed,1),duration=roll.dice[0]!;
 const next:WarBattle={...battle,seed:roll.nextSeed,
  units:battle.units.map(u=>u.id===targetId?{
   ...u,oilSoaked:false,oilIgnition:{remainingRounds:duration},
  }:u)};
 return event(next,target.side,'oil-ignite',target.name+
  ' teve o óleo fervente incendiado por '+duration+
  ' rodada(s), +1 dano por rodada.');
}
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
 const logged=event(next,target.side,'wildfire-ignite',target.name+
  ' incendiou-se por '+burning.remainingRounds+' rodada(s).');
 return igniteWarOil(logged,targetId);
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
 // A ignição secundária do óleo tem seu próprio relógio e nunca
 // aumenta o dano base do Fogo Selvagem. Unidades destruídas não agem.
 for(const initial of battle.units.filter(u=>u.oilIgnition&&
  u.oilIgnition.remainingRounds>0&&
  !['destroyed','surrendered','escaped'].includes(u.condition))){
  const current=next.units.find(u=>u.id===initial.id);
  if(!current?.oilIgnition||['destroyed','surrendered','escaped'].includes(current.condition))continue;
  const remaining=current.oilIgnition.remainingRounds;
  next={...next,units:next.units.map(u=>u.id!==current.id?u:{
   ...u,oilIgnition:remaining>1?{remainingRounds:remaining-1}:undefined,
  })};
  next=event(next,current.side,'oil-tick',current.name+
   ' sofreu +1 de dano por óleo incendiado.');
  const affected=next.units.find(u=>u.id===initial.id)!;
  next=applyDamage(next,affected,1,'Óleo fervente incendiado');
 }
 return next;
}

/** Capítulo 10: uma unidade que ainda carrega potes de fogo selvagem
 * e sofre dano tem 1 chance em 6 de incendiá-los acidentalmente.
 * Consome o equipamento ANTES de aplicar o dano, evitando recursão.
 */
export function resolveCarriedWildfireRisk(
 battle:WarBattle,unitId:string,applyDamage:Damage,
):WarBattle{
 const current=battle.units.find(u=>u.id===unitId);
 if(!current||current.fieldEquipment!=='wildfire-pots'||
  current.fieldEquipmentConsumed||current.condition==='destroyed'||
  current.condition==='escaped'||current.condition==='surrendered')
  return battle;
 const die=rollDice(battle.seed,1);
 let next:WarBattle={...battle,seed:die.nextSeed};
 if(die.dice[0]!==1)return next;
 next={...next,units:next.units.map(u=>u.id===unitId?{
  ...u,fieldEquipmentConsumed:true,
 }:u)};
 next=event(next,current.side,'wildfire-accident',
  current.name+' incendiou os próprios potes de fogo selvagem (1 em 6).');
 const target=next.units.find(u=>u.id===unitId)!;
 next=applyDamage(next,target,7,'Fogo selvagem acidental');
 if(next.units.some(u=>u.id===unitId&&
  !['destroyed','escaped','surrendered'].includes(u.condition)))
  next=igniteWarUnit(next,unitId,'Fogo selvagem acidental',7,2);
 return next;
}
