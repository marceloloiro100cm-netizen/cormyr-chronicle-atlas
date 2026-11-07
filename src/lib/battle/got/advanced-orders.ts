import {degreesOfSuccess,rollDice} from './dice';
import {fortDefense,fortForUnit,sabotageFortification} from './fortifications';
import {terrainAt,terrainEffect,movementSlow} from './terrain';
import type {WarBattle,WarOrder,WarUnit} from './types';

export const WAR_ADVANCED_ORDER_DIFFICULTY={
 'suppress':3,'probe':6,'push':3,'counter-charge':3,'sabotage':3,'ambush':3,'join':3,
 'split-attack':6,'lightning-attack':6,'trample':3,'envelop':6,'scorched-earth':3,
 'pincer':3,'hammer-anvil':6,'climb-walls':3,
} as const;
export type WarAdvancedKind=keyof typeof WAR_ADVANCED_ORDER_DIFFICULTY;

type Helpers=Readonly<{
 attack:(battle:WarBattle,attacker:WarUnit,target:WarUnit,ranged:boolean,
  options?:{charge?:boolean;penalty?:number;counterCharge?:boolean;
   testRank?:number;bonusDice?:number;damageBonus?:number})=>WarBattle;
 applyDamage:(battle:WarBattle,target:WarUnit,amount:number,attackerName:string)=>WarBattle;
}>;
const distance=(a:WarUnit['position'],b:WarUnit['position'])=>
 Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const alive=(u:WarUnit)=>u.condition==='organized'||u.condition==='disorganized';
const targetOf=(battle:WarBattle,attacker:WarUnit,order:WarOrder):WarUnit=>{
 const target=battle.units.find(u=>u.id===order.targetId);
 if(!target||target.id===attacker.id||!alive(target))
  throw new Error('Ordem avançada exige unidade-alvo válida.');
 return target;
};
const log=(battle:WarBattle,kind:string,text:string,actor:WarUnit,meta:{
 roll?:readonly number[];total?:number;difficulty?:number;degrees?:number;
}={}):WarBattle=>({...battle,events:[...battle.events,{
 seq:battle.events.length+1,round:battle.round,side:actor.side,kind,text,...meta,
}]});
const replace=(battle:WarBattle,unit:WarUnit):WarBattle=>({
 ...battle,units:battle.units.map(u=>u.id===unit.id?unit:u),
});
export function executeAdvancedWarOrder(
 battle:WarBattle,actor:WarUnit,order:WarOrder,helpers:Helpers,
):WarBattle|null{
 if(!(order.kind in WAR_ADVANCED_ORDER_DIFFICULTY))return null;
 if(!battle.advancedFormations)throw new Error('Ative as regras avançadas de Guerra.');
 if(order.kind==='split-attack'){
  const ids=order.targetIds??[],ranks=order.testRanks??[],bonuses=order.bonusRanks??[];
  const ranged=Boolean(order.ranged),rank=ranged?actor.ability.marksmanship:actor.ability.fighting;
  const available=ranged?(actor.rangedBonusDice??0):(actor.meleeBonusDice??0);
  const range=ranged?(actor.range==='long'?20:actor.range==='short'?2:0):1;
  if(ids.length<2||ids.length!==ranks.length||ids.length!==bonuses.length||
   new Set(ids).size!==ids.length||ids.some(id=>!id)||
   ranks.some(n=>!Number.isInteger(n)||n<1||n>15)||
   bonuses.some(n=>!Number.isInteger(n)||n<0||n>15)||
   ranks.reduce((sum,n)=>sum+n,0)!==rank||
   bonuses.reduce((sum,n)=>sum+n,0)>available)
   throw new Error('Ataque Dividido exige dois alvos distintos e divisão válida dos dados de teste/bônus.');
  const targets=ids.map(id=>battle.units.find(u=>u.id===id));
  if(!range||targets.some(t=>!t||!alive(t)||t.side===actor.side||
   distance(t.position,actor.position)>range||(!ranged&&distance(t.position,actor.position)===0)))
   throw new Error('Todos os alvos divididos precisam ser inimigos ativos no alcance.');
  let next=battle;
  for(let i=0;i<ids.length;i++){
   const current=next.units.find(u=>u.id===actor.id);
   const target=next.units.find(u=>u.id===ids[i]);
   if(!current||!alive(current)||!target||!alive(target))continue;
   next=helpers.attack(next,current,target,ranged,{
    testRank:ranks[i]!,bonusDice:bonuses[i]!,
   });
  }
  return log(next,'split-attack',actor.name+
   ' dividiu os dados de '+(ranged?'Pontaria':'Luta')+
   ' entre '+ids.length+' unidades.',actor);
 }
 if(order.kind==='lightning-attack'||order.kind==='trample'){
  const mounted=order.kind==='trample';
  if(mounted&&!actor.mounted)throw new Error('Atropelar exige unidade de cavalaria.');
  if(!order.to)throw new Error('Informe o destino do ataque em linha reta.');
  const dx=order.to.x-actor.position.x,dy=order.to.y-actor.position.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps<1||!Number.isInteger(dx)||!Number.isInteger(dy)||
   !(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)))
   throw new Error('Ataque Relâmpago/Atropelar exige movimento em linha reta.');
  const move=Math.max(0,(actor.naval?60:actor.mounted?80:40)-actor.bulk*10)*4;
  const dir={x:Math.sign(dx),y:Math.sign(dy)};
  let spent=0;
  const encountered:string[]=[];
  for(let step=1;step<=steps;step++){
   const p={x:actor.position.x+dir.x*step,y:actor.position.y+dir.y*step};
   if(p.x<0||p.y<0||p.x>=battle.width||p.y>=battle.height)
    throw new Error('Trajeto atravessa limite do mapa.');
   const tile=terrainAt(battle.tiles,p),effect=terrainEffect(tile);
   if(effect.blocked||(effect.water&&!actor.naval)||actor.mounted&&effect.noCavalry)
    throw new Error('Trajeto atravessa terreno proibido.');
   spent+=10*(1+movementSlow(tile,battle.visibility,battle.weather));
   if(spent>move)throw new Error('Trajeto ultrapassa deslocamento de corrida.');
   const occupying=battle.units.find(u=>u.id!==actor.id&&alive(u)&&
    u.position.x===p.x&&u.position.y===p.y);
   if(occupying?.side===actor.side)
    throw new Error('A manobra não pode atravessar unidades aliadas.');
   if(occupying){
    if(step===steps)throw new Error('A manobra não pode terminar sobre inimigo.');
    encountered.push(occupying.id);
   }
  }
  if(encountered.length===0)throw new Error('A manobra exige inimigos no trajeto.');
  let next=battle;
  const origin=actor.position;
  for(const [index,id] of encountered.entries()){
   const target=next.units.find(u=>u.id===id);
   const current=next.units.find(u=>u.id===actor.id);
   if(!target||!alive(target)||!current||!alive(current))continue;
   const attackFrom={x:target.position.x-dir.x,y:target.position.y-dir.y};
   const virtual={...current,position:attackFrom};
   const setup=replace(next,virtual);
   const damaged=helpers.attack(setup,virtual,target,false,{
    penalty:index,damageBonus:mounted?5:0,
   });
   const updated=damaged.units.find(u=>u.id===actor.id)!;
   next=replace(damaged,{...updated,position:origin});
  }
  const finalUnit=next.units.find(u=>u.id===actor.id)!;
  if(alive(finalUnit))next=replace(next,{...finalUnit,position:{...order.to}});
  return log(next,order.kind,actor.name+
   (mounted?' atropelou ':' atravessou ') +encountered.length+
   ' tropa(s) inimiga(s) em corrida.',actor);
 }
 if(order.kind==='envelop'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||distance(actor.position,target.position)!==1||
   actor.envelopingTargetId||target.envelopedBy)
   throw new Error('Envolver exige inimigo adjacente sem outro vínculo de cerco.');
  const attacked=helpers.attack(battle,actor,target,false);
  const source=attacked.units.find(u=>u.id===actor.id)!;
  const victim=attacked.units.find(u=>u.id===target.id)!;
  if(!alive(source)||!alive(victim))return attacked;
  let next=replace(attacked,{...source,envelopingTargetId:victim.id});
  next=replace(next,{...victim,envelopedBy:source.id});
  return log(next,'envelop',actor.name+' envolveu '+target.name+
   '; retiradas geram ataque livre, disparos atingem ambos.',actor);
 }
 if(order.kind==='scorched-earth'){
  if(!order.targetDomainId?.trim())
   throw new Error('Terra Arrasada requer identificação do domínio afetado.');
  const record={side:actor.side,unitId:actor.id,domainId:order.targetDomainId,
   round:battle.round,populationDelta:-1,wealthDelta:-1};
  return log({...battle,scorchedPreview:[...(battle.scorchedPreview??[]),record]},
   'scorched-earth',actor.name+' arrasou '+record.domainId+
   ': prévia de População −1, Riqueza −1 (sem modificar Casa).',actor);
 }
 if(order.kind==='hammer-anvil'){
  const target=targetOf(battle,actor,order);
  const anvil=battle.units.find(u=>u.id===order.auxiliaryUnitId&&
   u.side===actor.side&&alive(u)&&u.id!==actor.id);
  if(target.side===actor.side||distance(target.position,actor.position)!==1||
   !anvil||anvil.standing?.kind!=='ready'||anvil.standing.ready?.reaction!=='attack'||
   anvil.standing.ready?.ranged)
   throw new Error('Martelo e Bigorna exige inimigo adjacente e aliado de Prontidão para Luta.');
  const dx=Math.sign(target.position.x-actor.position.x);
  const dy=Math.sign(target.position.y-actor.position.y);
  const half=Math.floor(Math.max(0,(target.mounted?80:40)-target.bulk*10)/20);
  const dest={x:target.position.x+dx*half,y:target.position.y+dy*half};
  if(half<1||dest.x<0||dest.y<0||dest.x>=battle.width||dest.y>=battle.height||
   distance(dest,anvil.position)!==1)
   throw new Error('A Bigorna deve aguardar na posição que receberá o inimigo.');
  for(let i=1;i<=half;i++){
   const p={x:target.position.x+dx*i,y:target.position.y+dy*i};
   const tile=terrainAt(battle.tiles,p),effect=terrainEffect(tile);
   if(effect.blocked||effect.noCavalry&&target.mounted||
    effect.water&&!target.naval||movementSlow(tile,battle.visibility,battle.weather)>0||
    battle.units.some(u=>u.id!==target.id&&alive(u)&&
     u.position.x===p.x&&u.position.y===p.y))
    throw new Error('O trajeto do Martelo está bloqueado ou impedido pelo terreno.');
  }
  const a=rollDice(battle.seed,actor.ability.athletics);
  const d=rollDice(a.nextSeed,target.ability.athletics);
  const success=a.total>d.total;
  let next:WarBattle={...battle,seed:d.nextSeed};
  next=log(next,'hammer-anvil',actor.name+(success?' empurrou ':' falhou em empurrar ')+
   target.name+' ('+a.total+' vs '+d.total+').',actor,{
    roll:a.dice,total:a.total,difficulty:d.total+1,
    degrees:success?degreesOfSuccess(a.total,d.total+1):0,
   });
  if(!success)return next;
  next=replace(next,{...target,position:dest});
  const guard=next.units.find(u=>u.id===anvil.id)!;
  next=replace(next,{...guard,standing:null});
  return helpers.attack(next,next.units.find(u=>u.id===guard.id)!,
   next.units.find(u=>u.id===target.id)!,false,{
    testRank:Math.min(15,guard.ability.fighting+1),
   });
 }
 if(order.kind==='climb-walls'){
  const fort=battle.fortifications.find(f=>f.id===order.fortId&&
   f.side!==actor.side&&!f.breached);
  if(!fort)throw new Error('Escalar muralhas exige fortificação inimiga.');
  const cell=fort.cells.find(p=>distance(p,actor.position)===1);
  if(!cell)throw new Error('A unidade precisa estar adjacente à muralha.');
  const difficulty=order.wallDifficulty??12;
  if(!Number.isInteger(difficulty)||difficulty<3||difficulty>30)
   throw new Error('O Narrador deve definir dificuldade de escalada entre 3 e 30.');
  const ladder=actor.fieldEquipment==='ladders'&&!actor.fieldEquipmentConsumed;
  const tower=actor.fieldEquipment==='siege-tower'&&!actor.fieldEquipmentConsumed;
  const roll=tower?null:rollDice(battle.seed,actor.ability.athletics,
   ladder?1:0,actor.condition==='disorganized'?1:0);
  const total=roll?.total??difficulty;
  const degrees=tower?1:degreesOfSuccess(total,difficulty);
  let next:WarBattle={...battle,seed:roll?.nextSeed??battle.seed};
  if(degrees>0){
   const occupant=next.units.find(u=>u.id!==actor.id&&alive(u)&&
    u.position.x===cell.x&&u.position.y===cell.y);
   if(occupant?.side===actor.side)throw new Error('Muralha ocupada por aliado.');
   const staged={...actor,wallClimbedRound:battle.round,
    ...(ladder?{laddersDeployed:true}:{})};
   next=replace(next,staged);
   if(occupant)next=helpers.attack(next,staged,occupant,false);
   else next=replace(next,{...staged,position:cell});
  }
  return log(next,'climb-walls',actor.name+(degrees?' escalou ':' falhou em escalar ')+
   fort.name+' ('+total+' vs '+difficulty+').',actor,{
    ...(roll?{roll:roll.dice}:{}),total,difficulty,degrees,
   });
 }
 if(order.kind==='push'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||distance(actor.position,target.position)!==1)
   throw new Error('Empurrar exige unidade inimiga adjacente.');
  const roll=rollDice(battle.seed,actor.ability.fighting,actor.meleeBonusDice??0,
   actor.condition==='disorganized'?1:0);
  const difficulty=target.ability.athletics*4; // Resultado passivo de Atletismo.
  const degrees=degreesOfSuccess(roll.total,difficulty);
  let next:WarBattle={...battle,seed:roll.nextSeed};
  let position={...target.position},cost=0,metres=0;
  const dx=Math.sign(target.position.x-actor.position.x);
  const dy=Math.sign(target.position.y-actor.position.y);
  // Cada grau autoriza 10 m; terreno traiçoeiro consome os graus disponíveis.
  for(let n=0;n<degrees;n++){
   const to={x:position.x+dx,y:position.y+dy};
   if(to.x<0||to.y<0||to.x>=battle.width||to.y>=battle.height)break;
   if(next.units.some(u=>u.id!==target.id&&
    !['destroyed','surrendered','escaped'].includes(u.condition)&&
    u.position.x===to.x&&u.position.y===to.y))break;
   const tile=terrainAt(battle.tiles,to);
   const effect=terrainEffect(tile);
   if(effect.blocked||(effect.water&&!target.naval)||
    (target.mounted&&effect.noCavalry))break;
   const stepCost=1+movementSlow(tile,battle.visibility,battle.weather);
   if(cost+stepCost>degrees)break;
   cost+=stepCost;position=to;metres+=10;
  }
  if(metres>0)next=replace(next,{...target,position});
  return log(next,'push',actor.name+' tentou empurrar '+target.name+
   ' por '+metres+' m ('+degrees+' grau(s) de sucesso).',actor,{
    roll:roll.dice,total:roll.total,difficulty,degrees,
   });
 }
 if(order.kind==='probe'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||distance(actor.position,target.position)>1)
   throw new Error('Ataque exploratório exige inimigo adjacente.');
  const attacked=helpers.attack(battle,actor,target,false,{penalty:1});
  const current=attacked.units.find(u=>u.id===actor.id)!;
  return log(replace(attacked,{...current,probeDefenseRound:battle.round}),
   'probe',actor.name+' recebeu +2 Defesa até a próxima rodada.',actor);
 }
 if(order.kind==='suppress'){
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side||actor.range==='none'||
   distance(actor.position,target.position)>(actor.range==='long'?20:2))
   throw new Error('Fogo de supressão exige Pontaria e inimigo no alcance.');
  const roll=rollDice(battle.seed,actor.ability.marksmanship,actor.rangedBonusDice??0,
   actor.condition==='disorganized'?1:0);
  const fort=fortForUnit(battle.fortifications,target);
  const difficulty=target.defense+(fort?fortDefense(fort):0);
  const degrees=degreesOfSuccess(roll.total,difficulty);
  let next:WarBattle=log({...battle,seed:roll.nextSeed},'suppress',
   actor.name+' fez fogo de supressão contra '+target.name+'.',actor,{
    roll:roll.dice,total:roll.total,difficulty,degrees});
  if(degrees>0){
   const penalized={...target,suppressionPenalty:3+degrees-1,suppressionRound:battle.round};
   next=replace(next,penalized);
   if(degrees>=2){
    // No livro, dois ou mais graus causam o mesmo dano de um ataque normal.
    // A supressão nunca ganha dano extra de um terceiro ou quarto grau.
    const damage=Math.max(0,actor.rangedDamage*2-target.armor);
    if(damage>0)next=helpers.applyDamage(next,penalized,damage,actor.name);
   }
  }
  return next;
 }
 if(order.kind==='counter-charge'){
  return log(replace(battle,{...actor,counterChargeReady:true}), 'counter-charge',
   actor.name+' está preparada para responder à próxima carga da rodada.',actor);
 }
 if(order.kind==='ambush'){
  if(!actor.hidden||battle.round!==1)throw new Error('Emboscada exige unidade escondida na primeira rodada.');
  const target=targetOf(battle,actor,order);
  if(target.side===actor.side)throw new Error('Emboscada exige inimigo.');
  const ranged=Boolean(order.ranged);
  const boosted={...actor,hidden:false,
   meleeDamage:actor.meleeDamage+(ranged?0:2),
   rangedDamage:actor.rangedDamage+(ranged?2:0)};
  const attacked=helpers.attack(replace(battle,boosted),boosted,target,ranged);
  const current=attacked.units.find(u=>u.id===actor.id)!;
  return replace(attacked,{...current,meleeDamage:actor.meleeDamage,rangedDamage:actor.rangedDamage});
 }
 if(order.kind==='join'){
  const target=targetOf(battle,actor,order);
  if(target.side!==actor.side||distance(target.position,actor.position)>1||
   actor.health>=actor.maxHealth||target.health>=target.maxHealth)
   throw new Error('Junção exige unidades aliadas adjacentes e ambas feridas.');
  const lost=actor.health<=target.health?actor:target;
  const survivor=lost.id===actor.id?target:actor;
  let next=replace(battle,{...lost,health:0,condition:'destroyed',standing:null});
  next=replace(next,{...survivor,health:survivor.maxHealth,condition:'organized',standing:null});
  return log(next,'join',lost.name+' foi absorvida por '+survivor.name+
   '. A unidade absorvida conta como destruída.',actor);
 }
 if(order.kind==='sabotage'){
  if(actor.typeId!=='engineers')throw new Error('Sabotagem exige uma unidade de engenheiros.');
  const fort=battle.fortifications.find(f=>f.id===order.fortId&&f.side!==actor.side);
  if(!fort||!fort.cells.some(cell=>distance(cell,actor.position)<=1))
   throw new Error('Sabotagem exige fortificação inimiga adjacente.');
  const roll=rollDice(battle.seed,actor.ability.warfare??2,0,
   actor.condition==='disorganized'?1:0);
  const degrees=degreesOfSuccess(roll.total,12);
  let next:WarBattle={...battle,seed:roll.nextSeed};
  if(degrees>0)next={...next,fortifications:next.fortifications.map(f=>
   f.id===fort.id?sabotageFortification(f,degrees):f)};
  return log(next,'sabotage',actor.name+' sabotou '+fort.name+
   ', reduzindo a Defesa em '+degrees+'.',actor,{
   roll:roll.dice,total:roll.total,difficulty:12,degrees});
 }
 return null;
}
