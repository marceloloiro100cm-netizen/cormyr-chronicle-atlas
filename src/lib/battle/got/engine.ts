import {criticalFailure,degreesOfSuccess,rollDice,seedFromText} from './dice';
import type {WarBattle,WarCommander,WarCondition,WarEvent,WarOrder,WarOrderResult,WarPosition,WarSide,WarUnit} from './types';
import {terrainAt,terrainEffect,movementSlow,visibilityPenalty,weatherAttackModifier,terrainHighGround} from './terrain';
import type {WarTerrainTile,WarWeather,WarVisibility} from './terrain';
import {WAR_FORMATIONS,formationAllowed,formationMovement,angleAttackBonus,attackAngle} from './formations';
import {WAR_SIEGE_CATALOG,warSiegeDamage} from './siege';
import type {WarSiegeEngine} from './siege';
import {fortForUnit,fortDefense,validateWarForts,sabotageFortification} from './fortifications';
import type {WarFortification} from './fortifications';
import {executeAdvancedWarOrder,WAR_ADVANCED_ORDER_DIFFICULTY} from './advanced-orders';
import {validateWarHeroes,heroUnitDefenseBonus,heroUnitBonusDice,applyDamageToEmbeddedHeroes} from './heroes';
import type {WarHero} from './heroes';

const SIDES:readonly WarSide[]=['attacker','defender'];
const opposite=(side:WarSide):WarSide=>side==='attacker'?'defender':'attacker';
const inBounds=(battle:Pick<WarBattle,'width'|'height'>,p:WarPosition):boolean=>
 Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<battle.width&&p.y<battle.height;
const distance=(a:WarPosition,b:WarPosition):number=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const alive=(unit:WarUnit):boolean=>unit.condition==='organized'||unit.condition==='disorganized';
const onBoard=(unit:WarUnit):boolean=>!['destroyed','surrendered','escaped'].includes(unit.condition);
const log=(battle:WarBattle,kind:string,text:string,side:WarSide|null,details:Partial<WarEvent>={}):WarBattle=>({
 ...battle,events:[...battle.events,{seq:battle.events.length+1,round:battle.round,side,kind,text,...details}],
});
const replaceUnit=(battle:WarBattle,unit:WarUnit):WarBattle=>({
 ...battle,units:battle.units.map(row=>row.id===unit.id?unit:row),
});
function commandBudget(commanders:readonly WarCommander[],side:WarSide):Record<string,number>{
 return Object.fromEntries(commanders.filter(c=>c.side===side&&c.active).map(c=>[c.id,c.role==='commander'?c.warfare:1]));
}
const remaining=(battle:WarBattle,side:WarSide):number=>battle.commanders.filter(c=>c.side===side)
 .reduce((sum,c)=>sum+(battle.ordersRemaining[c.id]??0),0);
const turnAfter=(battle:WarBattle,acted:WarSide):WarSide=>{
 const other=opposite(acted);
 if(remaining(battle,other)>0)return other;
 if(remaining(battle,acted)>0)return acted;
 return battle.first;
};
function checkVictory(battle:WarBattle):WarBattle{
 const capable=(side:WarSide)=>battle.units.some(u=>u.side===side&&alive(u));
 const a=capable('attacker'),d=capable('defender');
 if(a&&d)return battle;
 return log({...battle,phase:'finished',winner:a?'attacker':d?'defender':null},'result',
  a?'Vitória do atacante.':d?'Vitória do defensor.':'Ambas as forças perderam a capacidade de combater.',null);
}
function sideInitiative(battle:WarBattle):WarBattle{
 const scores:Partial<Record<WarSide,{total:number;warfare:number;strategy:number}>>={};
 let next=battle;
 for(const side of SIDES){
  const leader=next.commanders.find(c=>c.side===side&&c.role==='commander'&&c.active);
  if(!leader){scores[side]={total:0,warfare:0,strategy:0};continue;}
  const roll=rollDice(next.seed,leader.warfare,leader.strategy);
  next={...next,seed:roll.nextSeed};
  scores[side]={total:roll.total,warfare:leader.warfare,strategy:leader.strategy};
  next=log(next,'initiative',leader.name+' testou Guerra para iniciativa: '+roll.total+'.',side,{
   roll:roll.dice,total:roll.total,difficulty:0,
  });
 }
 const a=scores.attacker!,d=scores.defender!;
 const first=a.total!==d.total?(a.total>d.total?'attacker':'defender'):
  a.warfare!==d.warfare?(a.warfare>d.warfare?'attacker':'defender'):
  a.strategy!==d.strategy?(a.strategy>d.strategy?'attacker':'defender'):'defender';
 return {...next,first,turn:first};
}
export function createWarBattle(input:{
 id:string;name:string;seed:string;width:number;height:number;
 commanders:readonly WarCommander[];units:readonly WarUnit[];
 tiles?:readonly WarTerrainTile[];weather?:WarWeather;visibility?:WarVisibility;
 advancedFormations?:boolean;siege?:readonly WarSiegeEngine[];
 fortifications?:readonly WarFortification[];heroes?:readonly WarHero[];
}):WarBattle{
 if(!input.id.trim()||!input.name.trim()||input.seed.length<1)throw new Error('Identificação do combate inválida.');
 if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<5||input.height<5||
 input.width>60||input.height>60)throw new Error('Dimensão do mapa inválida.');
 const ids=[...input.units.map(u=>u.id),...input.commanders.map(c=>c.id)];
 if(new Set(ids).size!==ids.length||input.units.length<2)throw new Error('Identificadores ou unidades inválidos.');
 const siegeIds=new Set<string>();
 const engineerCounts=new Map<string,number>();
 for(const engine of input.siege??[]){
  const profile=WAR_SIEGE_CATALOG[engine.kind];
  if(!profile||siegeIds.has(engine.id)||!engine.id.trim()||!inBounds(input,engine.position)||
   engine.health<0||engine.health>profile.maxHealth)throw new Error('Máquina de cerco inválida.');
  siegeIds.add(engine.id);
  const operator=input.units.find(u=>u.id===engine.engineerId);
  if(!operator||operator.side!==engine.side||operator.typeId!=='engineers'||!alive(operator))
   throw new Error('Uma máquina de cerco precisa de unidade de engenheiros ativa.');
  engineerCounts.set(operator.id,(engineerCounts.get(operator.id)??0)+1);
  if(engineerCounts.get(operator.id)!>4)throw new Error('Cada unidade de engenheiros opera até quatro máquinas.');
 }
 const occupied=new Set<string>();
 for(const tile of input.tiles??[]){
  if(!inBounds(input,tile)||!terrainEffect(tile))throw new Error('Terreno inválido.');
 }
 for(const u of input.units){
  if(!inBounds(input,u.position))throw new Error('Unidade fora do mapa: '+u.name);
  const key=u.position.x+':'+u.position.y;
  if(occupied.has(key))throw new Error('Duas unidades ocupam o mesmo quadrado.');
  occupied.add(key);
  if(u.maxHealth!==u.ability.endurance*3||u.health<0||u.health>u.maxHealth||u.armor<0||
   u.discipline<0||u.defense<0)throw new Error('Atributos inconsistentes com o livro: '+u.name);
 }
 validateWarForts(input.fortifications??[],input.units,input.width,input.height);
 validateWarHeroes(input.heroes??[],input.units,input.width,input.height);
 for(const side of SIDES){
  const leaders=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='commander');
  const sub=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='subcommander');
  if(leaders.length!==1||!Number.isInteger(leaders[0]!.warfare)||leaders[0]!.warfare<1||
   leaders[0]!.warfare>12||sub.length>Math.floor(input.units.filter(u=>u.side===side).length/2))
   throw new Error('Exige comandante válido e no máximo um subcomandante para cada duas unidades.');
  if(input.units.filter(u=>u.side===side).length<1)throw new Error('Cada lado precisa de unidades.');
 }
 const commanders=input.commanders.map(c=>({...c}));
 const units=input.units.map(u=>({...u,position:{...u.position},ability:{...u.ability},
  ...(input.advancedFormations?{formation:u.formation??'battle',facing:u.facing??(u.side==='attacker'?'east':'west')}:{}),
  standing:u.standing?{...u.standing}:null,issuedThisRound:0,actedThisRound:false,criticalThisRound:false}));
 const initial:WarBattle={id:input.id,name:input.name,seed:seedFromText(input.seed),schemaVersion:1,
  rulesVersion:'GOT-CH10-1',width:input.width,height:input.height,metresPerCell:10,
  round:1,phase:(input.siege?.length??0)>0?'siege':(input.heroes?.length?'heroes-first':'orders'),
  first:'defender',turn:'defender',units,commanders,
  heroes:(input.heroes??[]).map(h=>({...h,position:{...h.position},usedActions:0})),
  siege:[...(input.siege??[])],siegeCompleted:{attacker:false,defender:false},
  tiles:[...(input.tiles??[])],weather:input.weather??'clear',visibility:input.visibility??'clear',
  advancedFormations:input.advancedFormations??false,
  fortifications:(input.fortifications??[]).map(f=>({...f,cells:f.cells.map(x=>({...x}))})),
  ordersRemaining:{...commandBudget(commanders,'attacker'),...commandBudget(commanders,'defender')},
  events:[],winner:null};
 return sideInitiative(initial);
}
function movePath(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,maxCells:number):WarPosition[]{
 if(!inBounds(battle,to))throw new Error('Destino fora do campo de batalha.');
 if(unit.position.x===to.x&&unit.position.y===to.y)return [];
 const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u))
   .map(u=>u.position.x+':'+u.position.y));
 const directX=to.x-unit.position.x,directY=to.y-unit.position.y;
 if(sprint&&(directX!==0&&directY!==0))throw new Error('Corrida exige deslocamento em linha reta.');
 const key=(p:WarPosition)=>p.x+':'+p.y;
 const queue:{pos:WarPosition;path:WarPosition[];cost:number}[]=[{pos:unit.position,path:[],cost:0}];
 const seen=new Map([[key(unit.position),0]]);
 while(queue.length>0){
  queue.sort((a,b)=>a.cost-b.cost);
  const current=queue.shift()!;
  const {pos,path,cost}=current;
  if(cost>=maxCells)continue;
  for(const [dx,dy] of ([[1,0],[-1,0],[0,1],[0,-1]] as const)){
   const step={x:pos.x+dx,y:pos.y+dy},id=key(step);
   if(!inBounds(battle,step)||occupied.has(id))continue;
   const tile=terrainAt(battle.tiles,step),effect=terrainEffect(tile);
   if(effect.blocked||(effect.water&&!unit.naval)||(unit.mounted&&effect.noCavalry))continue;
   if(unit.naval&&!effect.naval&&tile.terrain!=='coast')continue;
   if(sprint&&(directX!==0&&step.y!==unit.position.y||directY!==0&&step.x!==unit.position.x))continue;
   const movement=1+movementSlow(tile,battle.visibility,battle.weather);
   const nextCost=cost+movement;
   if(nextCost>maxCells||(seen.get(id)??Infinity)<=nextCost)continue;
   const candidate=[...path,step];
   if(step.x===to.x&&step.y===to.y)return candidate;
   seen.set(id,nextCost);queue.push({pos:step,path:candidate,cost:nextCost});
  }
 }
 throw new Error('Destino inacessível no limite de movimento ou ocupado.');
}
function movementCells(unit:WarUnit,sprint:boolean):number{
 const base=Math.max(0,(unit.naval?60:unit.mounted?80:40)-unit.bulk*10);
 return Math.floor((sprint?base*4:base)/10);
}
function move(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,limit?:number):WarBattle{
 const base=movementCells(unit,sprint)*10;
 const effective=battle.advancedFormations&&unit.formation?
  formationMovement(base,unit.formation):base;
 const max=limit??Math.floor(effective/10);
 const path=movePath(battle,unit,to,sprint,max);
 const next=replaceUnit(battle,{...unit,position:path.at(-1)??unit.position});
 return triggerReadyReactions(log(next,'move',unit.name+' moveu '+path.length*10+' m'+(sprint?' em corrida':'')+'.',unit.side),unit.id,'enemy-adjacent');
}
function applyDamage(battle:WarBattle,target:WarUnit,amount:number,attackerName:string):WarBattle{
 if(amount<=0)return log(battle,'armor',target.name+' absorveu todo o dano.',target.side);
 let updated:WarUnit;
 if(target.condition==='routed'||amount>target.maxHealth*2){
  updated={...target,health:0,condition:'destroyed',standing:null};
 }else if(target.condition==='disorganized'){
  updated={...target,health:0,condition:'routed',standing:{kind:'retreat'},
   ...(battle.advancedFormations?{formation:'mob' as const}:{})};
 }else{
  const health=target.health-amount;
  if(health>0){updated={...target,health};}
  else{
   const disorganizations=target.disorganizations+1;
   updated={...target,health:0,disorganizations,
    condition:disorganizations>=target.ability.endurance?'destroyed':'disorganized',
    standing:disorganizations>=target.ability.endurance?null:target.standing};
  }
 }
 const text=attackerName+' causou '+amount+' de dano em '+target.name+'. Condição: '+updated.condition+'.';
 const withUnit=replaceUnit(battle,updated);
 const withHeroes=applyDamageToEmbeddedHeroes(withUnit,target,updated,amount);
 const resolved=log(withHeroes,'damage',text,target.side);
 return target.condition!=='routed'&&updated.condition==='routed'?triggerReadyReactions(resolved,target.id,'enemy-routed'):resolved;
}
function chooseNearest(battle:WarBattle,unit:WarUnit,ranged:boolean):WarUnit|null{
 const max=ranged?(unit.range==='long'?20:unit.range==='short'?2:0):1;
 return battle.units.filter(u=>u.side!==unit.side&&onBoard(u)&&distance(u.position,unit.position)<=max)
   .sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position)||a.id.localeCompare(b.id))[0]??null;
}
function attack(battle:WarBattle,attacker:WarUnit,target:WarUnit,ranged:boolean,
 options:{charge?:boolean;penalty?:number;counterCharge?:boolean}={}):WarBattle{
 if(!alive(attacker))throw new Error('Esta unidade não pode atacar.');
 if(!onBoard(target)||target.side===attacker.side)throw new Error('Alvo indisponível.');
 const max=ranged?(attacker.range==='long'?20:attacker.range==='short'?2:0):1;
 if(!max||distance(attacker.position,target.position)>max||(!ranged&&distance(attacker.position,target.position)===0))
  throw new Error('O alvo não está no alcance.');
 const score=ranged?attacker.ability.marksmanship:attacker.ability.fighting;
 let extraPenalty=(attacker.condition==='disorganized'?1:0)+(options.penalty??0)+(options.charge?1:0);
 let bonus=ranged?(attacker.rangedBonusDice??0):(attacker.meleeBonusDice??0);
 let testDice=heroUnitBonusDice(battle,attacker);
 let formationDefense=0;
 if(battle.advancedFormations){
  const own=WAR_FORMATIONS[attacker.formation??'battle'];
  const enemy=WAR_FORMATIONS[target.formation??'battle'];
  if(own.noAttack)throw new Error('Esta formação não permite ataques.');
  extraPenalty+=ranged?0:own.meleePenalty;
  if(!ranged){
   if(options.charge)testDice+=own.chargeBonus;
   if(target.formation==='mob')testDice+=own.meleeBonusAgainstMob;
   const ownAngle=attackAngle(target.position,attacker.position,attacker.facing??'north');
   if(ownAngle==='rear')throw new Error('Uma unidade não pode atacar pela própria retaguarda.');
   if(ownAngle==='flank')extraPenalty+=1;
   const angle=attackAngle(attacker.position,target.position,target.facing??'north');
   const closeEnemies=battle.units.filter(u=>u.side===attacker.side&&onBoard(u)&&distance(u.position,target.position)===1).length;
   const edge=angleAttackBonus(angle,closeEnemies>=2,enemy.flankImmunity);
   bonus+=edge.bonusDice;testDice+=edge.testDice;
  }
  formationDefense=ranged?enemy.rangedDefense:enemy.meleeDefense;
 }
 const attackerTile=terrainAt(battle.tiles,attacker.position);
 const targetTile=terrainAt(battle.tiles,target.position);
 bonus+=terrainHighGround(attackerTile,targetTile);
 extraPenalty+=visibilityPenalty(battle.visibility,battle.weather,ranged);
 const roll=rollDice(battle.seed,Math.max(1,score+testDice),bonus,extraPenalty);
 let next:{seed:number}&WarBattle={...battle,seed:roll.nextSeed};
 const cover=target.defendRoll!==null?terrainEffect(targetTile).cover:0;
 const fort=fortForUnit(battle.fortifications,target);
 const fortBonus=fort?fortDefense(fort):0;
 const probeBonus=target.probeDefenseRound===battle.round?2:0;
 const defense=(target.defendRoll??target.defense)+cover+formationDefense+fortBonus+probeBonus;
 const adjustedRoll=Math.max(0,roll.total+weatherAttackModifier(battle.weather));
 const degrees=degreesOfSuccess(adjustedRoll,defense);
 const baseDamage=ranged?attacker.rangedDamage:attacker.meleeDamage+(options.charge?2:0);
 const raw=baseDamage*(degrees+(options.counterCharge&&degrees>0?1:0));
 const damage=Math.max(0,raw-target.armor);
 next=log(next,'attack',attacker.name+' atacou '+target.name+' ('+(ranged?'Pontaria':'Luta')+
  '); teste '+adjustedRoll+' vs Defesa '+defense+', '+degrees+' grau(s).',attacker.side,{
   roll:roll.dice,total:adjustedRoll,difficulty:defense,degrees,
  });
 return degrees?applyDamage(next,target,damage,attacker.name):next;
}
/** A ordem Prontidão fica armada até uma condição de movimento ou debandada ocorrer.
 * Reações resolvem antes de a unidade que se move concluir sua ação (inclusive carga).
 */
function triggerReadyReactions(battle:WarBattle,subjectId:string,
 trigger:'enemy-adjacent'|'enemy-routed'):WarBattle{
 let next=battle;
 const initial=next.units.find(u=>u.id===subjectId);
 if(!initial)return next;
 const candidates=next.units.filter(u=>u.side!==initial.side&&alive(u)&&
  u.standing?.kind==='ready'&&u.standing.ready?.trigger===trigger);
 for(const candidate of candidates){
  const subject=next.units.find(u=>u.id===subjectId);
  const watcher=next.units.find(u=>u.id===candidate.id);
  if(!subject||!onBoard(subject)||!watcher||!alive(watcher))continue;
  const plan=watcher.standing?.ready;
  if(watcher.standing?.kind!=='ready'||!plan||plan.trigger!==trigger)continue;
  if(trigger==='enemy-adjacent'&&distance(watcher.position,subject.position)!==1)continue;
  if(trigger==='enemy-routed'&&subject.condition!=='routed')continue;
  const ranged=Boolean(plan.ranged);
  const max=plan.reaction==='attack'?(ranged?(watcher.range==='long'?20:watcher.range==='short'?2:0):1):Infinity;
  if(plan.reaction==='attack'&&(max===0||distance(watcher.position,subject.position)>max))continue;
  // Consumir antes da execução impede cadeias recursivas de reações.
  next=replaceUnit(next,{...watcher,standing:plan.reaction==='attack'?{kind:'attack',ranged}:null});
  try{
   const current=next.units.find(u=>u.id===watcher.id)!;
   if(plan.reaction==='attack')next=attack(next,current,subject,ranged);
   else if(plan.to)next=move(next,current,plan.to,false);
   next=log(next,'ready-trigger',watcher.name+' executou prontidão após '+
    (trigger==='enemy-routed'?'debandada':'aproximação inimiga')+'.',watcher.side);
  }catch{
   next=log(next,'ready-skip',watcher.name+
    ' não conseguiu completar a reação de prontidão.',watcher.side);
  }
 }
 return next;
}
function retreatStep(battle:WarBattle,unit:WarUnit,steps:number,rout:boolean):WarBattle{
 const foes=battle.units.filter(u=>u.side!==unit.side&&onBoard(u));
 if(!foes.length)return battle;
 const nearest=foes.sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position))[0]!;
 const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 let pos={...unit.position},escaped=false;
 for(let i=0;i<steps;i++){
  const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u)).map(u=>u.position.x+':'+u.position.y));
  const candidates=dirs.map(([dx,dy])=>({x:pos.x+dx!,y:pos.y+dy!}))
   .filter(p=>!occupied.has(p.x+':'+p.y)&&distance(p,nearest.position)>distance(pos,nearest.position))
   .sort((a,b)=>distance(b,nearest.position)-distance(a,nearest.position));
  const outside=candidates.find(p=>!inBounds(battle,p));
  if(outside){escaped=true;break;}
  const allowed=candidates.filter(p=>inBounds(battle,p));
  if(!allowed.length)break;
  pos=allowed[0]!;
 }
 const updated={...unit,position:pos,condition:escaped?'escaped' as WarCondition:unit.condition,
  standing:escaped?null:unit.standing};
 return log(replaceUnit(battle,updated),rout?'rout':'retreat',
  unit.name+(escaped?' saiu do campo.':' retirou-se até '+pos.x+','+pos.y+'.'),unit.side);
}
function perform(battle:WarBattle,unit:WarUnit,order:WarOrder,degrees:number):WarBattle{
 const advanced=executeAdvancedWarOrder(battle,unit,order,{attack,applyDamage});
 if(advanced)return advanced;
 if(order.kind==='formation'){
  if(!battle.advancedFormations)throw new Error('Formações avançadas desabilitadas.');
  if(!order.formation||!formationAllowed(order.formation,unit))throw new Error('Formação indisponível à unidade.');
  return log(replaceUnit(battle,{...unit,formation:order.formation}),'formation',unit.name+' adotou '+order.formation+'.',unit.side);
 }
 if(order.kind==='turn'||order.kind==='reverse'){
  if(!battle.advancedFormations)throw new Error('Ângulo frontal desabilitado.');
  const facing=order.kind==='turn'?order.facing:
   ({north:'south',south:'north',east:'west',west:'east'} as const)[unit.facing??'north'];
  if(!facing)throw new Error('Informe a orientação.');
  return log(replaceUnit(battle,{...unit,facing}), 'facing',unit.name+' voltou-se para '+facing+'.',unit.side);
 }
 if(order.kind==='move'){
  if(!order.to)throw new Error('Movimentação exige destino.');
  return move(battle,unit,order.to,Boolean(order.sprint));
 }
 if(order.kind==='attack'){
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo válido.');
  return attack(battle,unit,target,Boolean(order.ranged));
 }
 if(order.kind==='charge'){
  if(order.ranged)throw new Error('Carga exige Luta.');
  const target=battle.units.find(u=>u.id===order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo de carga inválido.');
  let next=battle,actor=unit;
  if(distance(actor.position,target.position)>1){
   const choices=[{x:target.position.x-1,y:target.position.y},
    {x:target.position.x+1,y:target.position.y},
    {x:target.position.x,y:target.position.y-1},{x:target.position.x,y:target.position.y+1}];
   let destination:WarPosition|null=null;
   for(const candidate of choices){
    try{movePath(battle,actor,candidate,true,movementCells(actor,true));destination=candidate;break;}catch{ /* outra posição */ }
   }
   if(!destination)throw new Error('Carga sem corredor em linha reta.');
   next=move(next,actor,destination,true);
   actor=next.units.find(u=>u.id===unit.id)!;
   if(!alive(actor))return log(next,'charge-blocked',actor.name+
    ' foi neutralizada por prontidão antes de completar a carga.',actor.side);
  }
  const guarding=next.units.find(u=>u.id===target.id)!;
  if(guarding.counterChargeReady){
   const counter=attack(next,guarding,actor,false,{counterCharge:true});
   const afterDefender=counter.units.find(u=>u.id===guarding.id)!;
   next=replaceUnit(counter,{...afterDefender,counterChargeReady:false});
   if(!alive(next.units.find(u=>u.id===actor.id)!))
    return log(next,'charge-blocked',actor.name+' não conseguiu completar a carga.',actor.side);
   actor=next.units.find(u=>u.id===actor.id)!;
  }
  return attack(next,actor,next.units.find(u=>u.id===target.id)!,false,{charge:true});
 }
 if(order.kind==='defend'){
  const roll=rollDice(battle.seed,unit.ability.agility,0,unit.condition==='disorganized'?1:0);
  return log(replaceUnit({...battle,seed:roll.nextSeed},{...unit,defendRoll:roll.total}),
   'defend',unit.name+' assumiu Defesa '+roll.total+' até o fim da rodada.',unit.side,{
    roll:roll.dice,total:roll.total,
   });
 }
 if(order.kind==='rally'){
  const health=Math.min(unit.maxHealth,unit.health+degrees);
  if(unit.condition!=='organized')throw new Error('Reagrupar não substitui Reorganizar/Reanimar.');
  return log(replaceUnit(battle,{...unit,health}), 'rally',unit.name+' recuperou '+(health-unit.health)+' de Saúde.',unit.side);
 }
 if(order.kind==='revive'){
  if(unit.condition!=='routed')throw new Error('Reanimar exige debandada.');
  return log(replaceUnit(battle,{...unit,condition:'disorganized',health:0,standing:null}),
   'revive',unit.name+' deixou de debandar; ainda precisa ser reorganizada.',unit.side);
 }
 if(order.kind==='reorganize'){
  if(unit.condition!=='disorganized')throw new Error('Reorganizar exige desorganização.');
  return log(replaceUnit(battle,{...unit,condition:'organized',health:unit.maxHealth,standing:null}),
   'reorganize',unit.name+' foi reorganizada, mantendo as penalidades de Disciplina.',unit.side);
 }
 if(order.kind==='retreat'){
  return retreatStep(battle,unit,movementCells(unit,false),false);
 }
 if(order.kind==='aggressive-retreat'){
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo de retirada agressiva.');
  const next=attack(battle,unit,target,Boolean(order.ranged),{penalty:1});
  const self=next.units.find(u=>u.id===unit.id)!;
  return retreatStep(next,self,Math.floor(movementCells(self,false)/2),false);
 }
 if(order.kind==='ready')return log(battle,'ready',unit.name+' aguardará a condição '+
  order.ready?.trigger+' para '+order.ready?.reaction+'.',unit.side);
 throw new Error('Ordem não suportada.');
}
export function issueWarOrder(battle:WarBattle,input:{
 commanderId:string;unitId:string;order:WarOrder;
}):WarOrderResult{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active);
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Não é a vez deste comandante, ou suas ordens terminaram.');
 if(battle.heroes.some(h=>h.active&&h.commanderId===commander.id&&h.unitId))
  throw new Error('Comandante dentro de unidade não pode dar ordens.');
 const unit=battle.units.find(u=>u.id===input.unitId);
 if(!unit||unit.side!==commander.side||!onBoard(unit))throw new Error('Unidade fora do comando.');
 if(!alive(unit)&&input.order.kind!=='revive')throw new Error('Uma tropa em debandada só pode ser reanimada.');
 if(input.order.kind==='revive'&&unit.condition!=='routed')throw new Error('Esta unidade não está em debandada.');
 // Rejeitar instruções incompletas ANTES de consumir o orçamento e os dados.
 if(input.order.kind==='surrender')return issueWarSurrender(battle,{commanderId:input.commanderId});
 if(input.order.kind==='move'&&!input.order.to)throw new Error('Indique o quadrado de destino.');
 if(input.order.kind==='ready'){
  const plan=input.order.ready;
  if(!plan||!['enemy-adjacent','enemy-routed'].includes(plan.trigger)||
   !['attack','move'].includes(plan.reaction))
   throw new Error('Prontidão exige condição e reação explícitas.');
  if(plan.reaction==='move'&&(!plan.to||!inBounds(battle,plan.to)))
   throw new Error('Movimento de prontidão exige um destino válido.');
  if(plan.reaction==='attack'&&plan.ranged&&unit.range==='none')
   throw new Error('Esta unidade não tem arma de Pontaria para prontidão.');
 }
 if(input.order.kind==='formation'&&(!input.order.formation||!battle.advancedFormations))throw new Error('Formação avançada indisponível ou desabilitada.');
 if(input.order.kind==='turn'&&(!input.order.facing||!battle.advancedFormations))throw new Error('Selecione uma orientação válida.');
 if(['attack','charge','aggressive-retreat','suppress','ambush','probe','push'].includes(input.order.kind)&&input.order.targetId){
  const target=battle.units.find(u=>u.id===input.order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo inimigo indisponível.');
 }
 const formationDifficulty=battle.advancedFormations&&input.order.kind==='formation'&&input.order.formation?
  WAR_FORMATIONS[input.order.formation].difficulty:input.order.kind==='turn'&&battle.advancedFormations?3:0;
 const formationDiscipline=battle.advancedFormations&&unit.formation?
  WAR_FORMATIONS[unit.formation].discipline:0;
 const advancedModifier=(WAR_ADVANCED_ORDER_DIFFICULTY as Partial<Record<WarOrder['kind'],number>>)[input.order.kind]??0;
 if(advancedModifier&&!battle.advancedFormations)
  throw new Error('Esta ordem avançada exige regras avançadas habilitadas.');
 const suppression=unit.suppressionRound===battle.round?(unit.suppressionPenalty??0):0;
 const difficulty=Math.max(0,unit.discipline+heroUnitDefenseBonus(battle,unit)+
  unit.disorganizations*3+unit.issuedThisRound*3+
  formationDifficulty+formationDiscipline+advancedModifier+suppression);
 const roll=rollDice(battle.seed,commander.warfare,0,0);
 const passed=roll.total>=difficulty;
 const critical=criticalFailure(roll.total,difficulty);
 const degrees=degreesOfSuccess(roll.total,difficulty);
 let next:WarBattle={...battle,seed:roll.nextSeed,
  ordersRemaining:{...battle.ordersRemaining,[commander.id]:battle.ordersRemaining[commander.id]!-1}};
 next=replaceUnit(next,{...unit,issuedThisRound:unit.issuedThisRound+1,actedThisRound:unit.actedThisRound||passed,
  criticalThisRound:unit.criticalThisRound||critical});
 next=log(next,'command',commander.name+' deu ordem '+input.order.kind+' a '+unit.name+
  ': '+roll.total+' vs Disciplina '+difficulty+(passed?' (sucesso).':critical?' (falha crítica).':' (falha).'),
  unit.side,{roll:roll.dice,total:roll.total,difficulty,degrees});
 if(!passed&&critical&&['retreat','aggressive-retreat'].includes(input.order.kind)){
  const affected=next.units.find(u=>u.id===unit.id)!;
  if(input.order.kind==='retreat'){
   next=replaceUnit(next,{...affected,health:0,condition:'routed',standing:{kind:'retreat'},
    ...(next.advancedFormations?{formation:'mob' as const}:{})});
   next=log(next,'critical-retreat',unit.name+' entrou em debandada após falha crítica de retirada.',unit.side);
  }else{
   const disorganizations=affected.disorganizations+1;
   const destroyed=disorganizations>=affected.ability.endurance;
   next=replaceUnit(next,{...affected,disorganizations,health:0,
    condition:destroyed?'destroyed':'disorganized',standing:destroyed?null:affected.standing});
   next=log(next,'critical-aggressive-retreat',unit.name+' ficou desorganizada após falha crítica.',unit.side);
  }
 }
 if(!passed&&!critical&&['turn','reverse'].includes(input.order.kind)&&next.advancedFormations){
  const affected=next.units.find(u=>u.id===unit.id)!;
  const facing=input.order.kind==='turn'?input.order.facing:
   ({north:'south',south:'north',east:'west',west:'east'} as const)[affected.facing??'north'];
  next=replaceUnit(next,{...affected,...(facing?{facing}:{}),exposedFacingUntilRound:next.round});
  next=log(next,'turn-failure',unit.name+' virou-se, mas permanece vulnerável ao flanco nesta rodada.',unit.side);
 }
 if(passed){
  const updated=next.units.find(u=>u.id===unit.id)!;
  const issued={...updated,standing:{...input.order},activated:true};
  next=replaceUnit(next,issued);
  // Instruções que não geram ação recorrente encerram a sua execução neste momento.
  try{next=perform(next,issued,input.order,degrees);}
  catch(e){throw e;}
  const latest=next.units.find(u=>u.id===unit.id)!;
  const continuous=(['attack','charge','defend','retreat','aggressive-retreat','ready','push'].includes(input.order.kind));
  next=replaceUnit(next,{...latest,standing:continuous&&onBoard(latest)?input.order:null});
 }
 next={...next,turn:turnAfter(next,commander.side)};
 next=checkVictory(next);
 return {battle:next,passed,critical,test:roll.total,difficulty,degrees};
}
/** Rendição: a ordem geral requer um teste para cada unidade ativa. */
/** Passo 5: uma ordem para disparar até Guerra máquinas, cada engenheiro com até quatro. */
export function fireWarSiegeVolley(battle:WarBattle,input:{
 commanderId:string;weaponIds:readonly string[];targetId:string;
}):WarBattle{
 if(battle.phase!=='siege')throw new Error('A fase de cerco não está ativa.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active&&c.role==='commander');
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Ordem de cerco indisponível.');
 if(battle.siegeCompleted[commander.side])throw new Error('Este lado já executou a fase de cerco.');
 if(!input.weaponIds.length||new Set(input.weaponIds).size!==input.weaponIds.length||
  input.weaponIds.length>commander.warfare)throw new Error('O disparo exige até Guerra máquinas distintas.');
 const target=battle.units.find(u=>u.id===input.targetId&&u.side!==commander.side&&onBoard(u));
 if(!target)throw new Error('Alvo de cerco inimigo indisponível.');
 for(const id of input.weaponIds){
  const weapon=battle.siege.find(w=>w.id===id&&w.side===commander.side&&w.health>0);
  if(!weapon)throw new Error('Máquina não pertence ao exército ativo.');
  const engineer=battle.units.find(u=>u.id===weapon.engineerId);
  if(!engineer||!alive(engineer)||engineer.typeId!=='engineers')
   throw new Error('Sem engenheiro disponível para a máquina.');
  if(weapon.lastFiredRound!==null&&battle.round-weapon.lastFiredRound<2)
   throw new Error('Máquina precisa aguardar uma rodada completa para recarregar.');
  if(distance(weapon.position,target.position)*10>WAR_SIEGE_CATALOG[weapon.kind].rangeMetres)
   throw new Error('Alvo fora do alcance de cerco.');
 }
 let next:WarBattle={...battle,ordersRemaining:{
  ...battle.ordersRemaining,[commander.id]:(battle.ordersRemaining[commander.id]??0)-1,
 }};
 for(const id of input.weaponIds){
  const weapon=next.siege.find(w=>w.id===id)!;
  const engineer=next.units.find(u=>u.id===weapon.engineerId)!;
  const profile=WAR_SIEGE_CATALOG[weapon.kind];
  const rank=engineer.ability.warfare??2;
  const roll=rollDice(next.seed,rank,0,profile.engineerPenaltyDice);
  const currentTarget=next.units.find(u=>u.id===input.targetId)!;
  const degrees=degreesOfSuccess(roll.total,currentTarget.defense);
  const payload=warSiegeDamage(weapon);
  const damage=Math.max(0,payload.base*degrees-(payload.ignoresArmor?0:currentTarget.armor));
  next={...next,seed:roll.nextSeed,siege:next.siege.map(w=>
   w.id===weapon.id?{...w,lastFiredRound:next.round}:w)};
  next=log(next,'siege',weapon.name+' disparou contra '+currentTarget.name+': Guerra '+
   roll.total+' vs Defesa '+currentTarget.defense+', '+degrees+' grau(s), '+damage+' dano.',
   commander.side,{roll:roll.dice,total:roll.total,difficulty:currentTarget.defense,degrees});
  if(degrees>0&&damage>0)next=applyDamage(next,currentTarget,damage,weapon.name);
  if(!next.units.some(u=>u.id===target.id&&onBoard(u)))break;
 }
 return completeSiegeSide(next,commander.side);
}
function completeSiegeSide(battle:WarBattle,side:WarSide):WarBattle{
 const done={...battle.siegeCompleted,[side]:true};
 return {...battle,siegeCompleted:done,
  ...(done.attacker&&done.defender?{phase:(battle.heroes.length?'heroes-first':'orders') as WarBattle['phase'],turn:battle.first}:
   {turn:opposite(side)})};
}
/** A passagem voluntária da fase de cerco não consome ordem. */
export function skipWarSiege(battle:WarBattle):WarBattle{
 if(battle.phase!=='siege'||battle.siegeCompleted[battle.turn])
  throw new Error('Não há fase de cerco para pular.');
 const side=battle.turn;
 return completeSiegeSide(log(battle,'siege-skip','Sem disparos nesta fase de cerco.',side),side);
}
export function issueWarSurrender(battle:WarBattle,input:{commanderId:string}):WarOrderResult{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active&&c.role==='commander');
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Rendição exige comandante ativo e ordem disponível.');
 let next:WarBattle={...battle,ordersRemaining:{
  ...battle.ordersRemaining,[commander.id]:(battle.ordersRemaining[commander.id]??0)-1,
 }};
 const units=next.units.filter(u=>u.side===commander.side&&alive(u));
 for(const unit of units){
  const difficulty=unit.discipline+unit.disorganizations*3+unit.issuedThisRound*3;
  const roll=rollDice(next.seed,commander.warfare);
  const passed=roll.total>=difficulty;
  const updated:WarUnit=passed?{...unit,health:0,condition:'surrendered',standing:null,issuedThisRound:unit.issuedThisRound+1}:
   {...unit,health:0,condition:'routed',standing:{kind:'retreat'},
    issuedThisRound:unit.issuedThisRound+1,
    ...(next.advancedFormations?{formation:'mob' as const}:{})};
  next=replaceUnit({...next,seed:roll.nextSeed},updated);
  next=log(next,'surrender',unit.name+(passed?' rendeu-se.':' debandou ao recusar a rendição.'),
   commander.side,{roll:roll.dice,total:roll.total,difficulty,
    degrees:degreesOfSuccess(roll.total,difficulty)});
 }
 next={...next,turn:turnAfter(next,commander.side)};
 next=checkVictory(next);
 return {battle:next,passed:units.every(u=>next.units.find(v=>v.id===u.id)?.condition==='surrendered'),
  critical:false,test:0,difficulty:0,degrees:0};
}
/** Passos seis/oito: conclui a janela de cinco rodadas dos personagens. */
export function completeWarHeroPhase(battle:WarBattle):WarBattle{
 if(battle.phase==='heroes-first')
  return log({...battle,phase:'orders',heroes:battle.heroes.map(h=>({...h,usedActions:0}))},
   'hero-phase','Passo seis concluído: ordens dos exércitos.',null);
 if(battle.phase==='heroes-second'){
  const ready:WarBattle={...battle,phase:'orders',heroSecondCompletedRound:battle.round};
  return advanceWarRound(log(ready,'hero-phase','Passo oito concluído: ordens contínuas.',null));
 }
 throw new Error('Esta não é uma fase de heróis.');
}
export function advanceWarRound(battle:WarBattle):WarBattle{
 if(battle.phase!=='orders')throw new Error('Batalha não está na fase de ordens.');
 if(battle.heroes.length>0&&battle.heroSecondCompletedRound!==battle.round)
  return log({...battle,phase:'heroes-second',
   heroes:battle.heroes.map(h=>({...h,usedActions:0}))},
   'hero-phase','Passo oito: cinco rodadas individuais dos heróis.',null);
 let next=battle;
 // Passo 9: ordens permanentes somente para unidades não comandadas durante a rodada.
 for(const side of [battle.first,opposite(battle.first)]){
  for(const base of next.units.filter(u=>u.side===side&&u.activated&&u.standing&&
   !u.actedThisRound&&!u.criticalThisRound&&alive(u))){
   const order=base.standing!;
   try{
    if(['attack','charge','aggressive-retreat'].includes(order.kind)){
     const ranged=Boolean(order.ranged);
     const target=chooseNearest(next,base,ranged);
     if(target)next=attack(next,base,target,ranged);
    }else if(order.kind==='push'){
     const target=chooseNearest(next,base,false);
     if(target){
      const pushed=executeAdvancedWarOrder(next,base,{kind:'push',targetId:target.id},
       {attack,applyDamage});
      if(pushed)next=pushed;
     }
    }else if(order.kind==='defend')next=perform(next,base,{kind:'defend'},1);
    else if(order.kind==='retreat')next=retreatStep(next,base,movementCells(base,false),false);
   }catch{
    next=log(next,'standing-skip',base.name+' não pôde executar a ordem contínua.',base.side);
   }
  }
 }
 // Uma tropa debandada corre em retirada independentemente das ordens da rodada.
 for(const unit of next.units.filter(u=>u.condition==='routed')){
  next=retreatStep(next,unit,movementCells(unit,true),true);
 }
 next=checkVictory(next);
 if(next.phase==='finished')return next;
 next={...next,round:next.round+1,
  units:next.units.map(u=>({...u,issuedThisRound:0,actedThisRound:false,
   criticalThisRound:false,defendRoll:null,counterChargeReady:false})),
  heroes:next.heroes.map(h=>({...h,usedActions:0})),
  ordersRemaining:{
   ...commandBudget(next.commanders,'attacker'),
   ...commandBudget(next.commanders,'defender'),
  },
 };
 const readyForSiege=next.siege.length>0&&next.siege.some(s=>s.health>0);
 next={...next,
  phase:readyForSiege?'siege':next.heroes.length?'heroes-first':'orders',
  ...(readyForSiege?{siegeCompleted:{attacker:false,defender:false}}:{})};
 return sideInitiative(next);
}
export function warUnitSummary(unit:WarUnit):{
 position:string;health:string;discipline:number;condition:WarCondition;
}{
 return {position:unit.position.x+','+unit.position.y,
  health:unit.health+'/'+unit.maxHealth,discipline:unit.discipline+unit.disorganizations*3,
  condition:unit.condition};
}
