import {degreesOfSuccess} from './dice';
import {movementSlow,terrainAt,terrainEffect,visibilityPenalty} from './terrain';
import type {WarBattle,WarEvent,WarPosition} from './types';
import type {WarHero} from './heroes';
import {queuePersonalDamage} from './personal-injuries';
import {effectivePersonalArmor} from './personal-weapons';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';

/** Capítulo 9: escala pessoal de 1 m. Não usa os quadrados de guerra de 10 m para alcance. */
export type PersonalWarAction=Readonly<{
 kind:'personal-attack'|'personal-charge'|'personal-move'|'personal-dodge'|
  'personal-recover'|'personal-pass'|'personal-end-turn'|'personal-surrender'|
  'personal-reload'|'personal-mount'|'personal-dismount'|'personal-control-mount'|
  'personal-counterattack';
 targetHeroId?:string;
 ranged?:boolean;
 vsCharge?:boolean;
 toMetres?:WarPosition;
}>;
export const personalPosition=(hero:WarHero):WarPosition=>
 hero.personalPosition??{x:hero.position.x*10+5,y:hero.position.y*10+5};
export const personalDistance=(a:WarPosition,b:WarPosition):number=>
 Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function personalMovement(hero:WarHero):number{
 if(hero.mounted&&hero.mount?.health&&hero.mount.health>0)
  return hero.mount.movement;
 const athletics=hero.athletics??3;
 const base=athletics<=1?3:4;
 return Math.max(1,base+Math.floor((hero.runningBonusDice??0)/2)-
  Math.floor((hero.bulk??0)/2));
}
export function spendPersonalAction(hero:WarHero,weight:'major'|'minor'):WarHero{
 if(hero.usedActions>=5)throw new Error('Cinco rodadas individuais já concluídas.');
 const minor=hero.minorActionsUsed??0;
 if(weight==='major'){
  if(minor!==0)throw new Error('Uma ação maior exige um turno sem ações menores prévias.');
  return {...hero,usedActions:hero.usedActions+1,minorActionsUsed:0,dodgeDefense:null,attackedThisTurn:false,counterattackReady:undefined};
 }
 if(minor>0)return {...hero,usedActions:hero.usedActions+1,minorActionsUsed:0,dodgeDefense:null,attackedThisTurn:false,counterattackReady:undefined};
 return {...hero,minorActionsUsed:1,dodgeDefense:null,counterattackReady:undefined};
}
const log=(battle:WarBattle,kind:string,text:string,hero:WarHero,details:Partial<WarEvent>={}):WarBattle=>({
 ...battle,events:[...battle.events,{
  seq:battle.events.length+1,round:battle.round,side:hero.side,kind,text,...details,
 }],
});
const changeHero=(battle:WarBattle,hero:WarHero):WarBattle=>({
 ...battle,heroes:battle.heroes.map(h=>h.id===hero.id?hero:h),
});
function moveFine(battle:WarBattle,hero:WarHero,to:WarPosition,max:number):WarHero{
 if(!Number.isInteger(to.x)||!Number.isInteger(to.y)||to.x<0||to.y<0||
  to.x>=battle.width*10||to.y>=battle.height*10)
  throw new Error('Destino pessoal fora da área de batalha.');
 let pos=personalPosition(hero);
 let cost=0,guard=0;
 while(pos.x!==to.x||pos.y!==to.y){
  if(++guard>1000)throw new Error('Caminho individual inválido.');
  const next={x:pos.x+Math.sign(to.x-pos.x),y:pos.y+Math.sign(to.y-pos.y)};
  const tile=terrainAt(battle.tiles,{x:Math.floor(next.x/10),y:Math.floor(next.y/10)});
  const effect=terrainEffect(tile);
  if(effect.blocked||effect.water&&!tile.bridge)
   throw new Error('Movimento individual bloqueado por obstáculo ou água.');
  cost+=1+movementSlow(tile,battle.visibility,battle.weather);
  if(cost>max)throw new Error('Destino além do Movimento pessoal disponível.');
  pos=next;
 }
 return {...hero,personalPosition:pos,
  position:{x:Math.floor(pos.x/10),y:Math.floor(pos.y/10)}};
}
function attackHero(
 battle:WarBattle,actor:WarHero,target:WarHero,ranged:boolean,
 options:{charge?:boolean;asReaction?:boolean;counterCharge?:boolean}={},
):WarBattle{
 const from=personalPosition(actor),to=personalPosition(target);
 const dist=personalDistance(from,to);
 const reach=actor.meleeWeapon?.reachMetres??1;
 if(!ranged&&dist>Math.max(1,reach))
  throw new Error('Ataque de Luta exige alvo adjacente ou dentro do alcance em metros.');
 const effectiveRange=(actor.rangedRange??'short')==='long'?100:10;
 if(ranged&&(actor.rangedDamage<=0||actor.rangedRange==='none'))
  throw new Error('Herói não possui arma de Pontaria disponível.');
 if(ranged&&actor.rangedWeapon?.reload&&actor.rangedLoaded===false)
  throw new Error('Esta arma precisa ser recarregada antes do próximo disparo.');
 // Contra-ataque (cap. 9, p. 216) é resolvido antes do golpe que o disparou.
 // Para mitigação manual, a reação avançada aguarda o fluxo de dano posterior.
 if(!options.asReaction&&target.counterattackReady&&!battle.manualMitigation){
  const stance=target.counterattackReady;
  const reactionDistance=personalDistance(personalPosition(target),personalPosition(actor));
  const range=stance.ranged?(target.rangedRange==='long'?100:10):
   (target.meleeWeapon?.reachMetres??1);
  const loaded=!stance.ranged||!target.rangedWeapon?.reload||target.rangedLoaded!==false;
  if(reactionDistance<=range&&loaded){
   const reactor={...target,counterattackReady:undefined};
   let defended=changeHero(battle,reactor);
   defended=attackHero(defended,reactor,actor,stance.ranged,{
    asReaction:true,counterCharge:Boolean(options.charge&&stance.vsCharge),
   });
   const survivingAttacker=defended.heroes.find(h=>h.id===actor.id);
   if(!survivingAttacker?.active)
    return log(defended,'personal-counterattack-interrupt',
     reactor.name+' interrompeu o ataque de '+actor.name+' por contra-ataque.',
     reactor);
   const survivingDefender=defended.heroes.find(h=>h.id===reactor.id);
   if(!survivingDefender?.active)return defended;
   return attackHero(defended,survivingAttacker,survivingDefender,ranged,{
    ...options,asReaction:true,
   });
  }
 }
 const rangePenalty=ranged?Math.min(15,Math.max(0,Math.ceil((dist-effectiveRange)/10))):0;
 const weapon=ranged?actor.rangedWeapon:actor.meleeWeapon;
 const availableBonus=(ranged?actor.rangedBonusDice:actor.meleeBonusDice)??0;
 const requiredBonus=weapon?.trainingBonusDice??0;
 const trainingPenalty=Math.max(0,requiredBonus-availableBonus);
 const usableBonus=Math.max(0,availableBonus-requiredBonus);
 const clumsyPenalty=actor.mounted&&weapon?.clumsy?2:0;
 const totalPenalty=(actor.injuries??0)+(options.charge?1:0)+
  (!ranged&&reach>1&&dist<3?1:0)+trainingPenalty+clumsyPenalty+
  visibilityPenalty(battle.visibility,battle.weather,ranged)+rangePenalty;
 const mountedBonus=!ranged&&actor.mounted&&actor.mount?.health&&
  actor.mount.health>0&&!target.mounted?1:0;
 const bonus=usableBonus+mountedBonus;
 const rank=ranged?actor.marksmanship:actor.fighting;
 const roll=rollPersonalWithFate(battle.seed,actor,rank,
  Math.min(15,bonus+(actor.passBonusDice??0)),Math.min(15,totalPenalty));
 const total=Math.max(0,roll.total-(actor.wounds??0));
 const difficulty=target.dodgeDefense??target.defense;
 const degrees=degreesOfSuccess(total,difficulty);
 const stationaryMountBonus=!ranged&&actor.mounted&&actor.mount?.trainedForWar&&
  actor.mount.health>0&&actor.mountMovedTurn!==actor.usedActions?2:0;
 const base=ranged?actor.rangedDamage:
  actor.meleeDamage+(options.charge?2:0)+stationaryMountBonus+
  (options.counterCharge?2:0);
 const damage=degrees?Math.max(0,base*degrees-
  effectivePersonalArmor(target.armor,ranged?actor.rangedWeapon:actor.meleeWeapon)):0;
 let next:WarBattle={...battle,seed:roll.nextSeed,
  heroes:battle.heroes.map(h=>h.id===actor.id?{
   ...consumePersonalFateRoll(h),passBonusDice:0,
   ...(ranged&&weapon?.reload?{rangedLoaded:false}:{})
  }:h),
 };
 if(damage>0)next=queuePersonalDamage(next,{actorName:actor.name,
  targetHeroId:target.id,damage,source:'personal',cruel:weapon?.cruel??false});
 const defeated=next.heroes.find(h=>h.id===target.id)?.active===false;
 next=log(next,'personal-attack',actor.name+' atacou '+target.name+
  ' ('+(ranged?'Pontaria':'Luta')+'): '+total+' vs Defesa '+difficulty+
  ', '+degrees+' grau(s), '+damage+' dano'+(defeated?' (derrotado)':'')+'.',
  actor,{roll:roll.dice,total,difficulty,degrees});
 return next;
}
export function executePersonalWarAction(
 battle:WarBattle,hero:WarHero,action:PersonalWarAction,
):WarBattle{
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('Combate pessoal só ocorre nas fases de heróis.');
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 if(!hero.active||hero.surrendered||hero.unitId||hero.usedActions>=5)
  throw new Error('Herói não pode atuar individualmente agora.');
 if(hero.role!=='hero')throw new Error('Comandante deve abdicar antes de lutar.');
 if(action.kind==='personal-end-turn'){
  if(!hero.minorActionsUsed)throw new Error('Não há ação menor pendente para encerrar.');
  return log(changeHero(battle,{...hero,minorActionsUsed:0,
   usedActions:hero.usedActions+1,attackedThisTurn:false}),'personal-end-turn',
   hero.name+' encerrou sua rodada pessoal.',hero);
 }
 if(action.kind==='personal-surrender'){
  const used=spendPersonalAction(hero,'major');
  const next=changeHero(battle,{...used,surrendered:true,active:false});
  return log({...next,commanders:hero.commanderId?
   next.commanders.map(c=>c.id===hero.commanderId?{...c,active:false}:c):
   next.commanders},'personal-surrender',hero.name+' se rendeu (destino narrativo pendente).',hero);
 }
 if(action.kind==='personal-counterattack'){
  if(battle.manualMitigation)
   throw new Error('Desative mitigação manual para testar contra-ataques antecipados neste laboratório.');
  if(action.ranged&&(hero.rangedDamage<=0||hero.rangedRange==='none'))
   throw new Error('O contra-ataque à distância exige arma de Pontaria.');
  if(action.ranged&&hero.rangedWeapon?.reload&&hero.rangedLoaded===false)
   throw new Error('Recarregue antes de preparar o contra-ataque.');
  if(action.vsCharge&&action.ranged)
   throw new Error('Preparar contra carga exige arma de Luta.');
  const used=spendPersonalAction(hero,'major');
  return log(changeHero(battle,{...used,counterattackReady:{
   ranged:Boolean(action.ranged),vsCharge:Boolean(action.vsCharge),
  }}),'personal-counterattack-ready',hero.name+
   ' preparou contra-ataque'+(action.vsCharge?' contra carga':'')+'.',hero);
 }
 if(action.kind==='personal-reload'){
  if(!hero.rangedWeapon?.reload)
   throw new Error('Arma selecionada não requer recarga.');
  if(hero.rangedLoaded!==false)
   throw new Error('A arma já está carregada.');
  const weight=hero.rangedWeapon.reload;
  const used=spendPersonalAction(hero,weight);
  return log(changeHero(battle,{...used,rangedLoaded:true}),'personal-reload',
   hero.name+' recarregou '+hero.rangedWeapon.label+' ('+
   (weight==='major'?'ação maior':'ação menor')+').',hero);
 }
 if(action.kind==='personal-mount'){
  if(!hero.mount||hero.mount.health<=0||hero.mounted)
   throw new Error('Não existe montaria viva disponível para montar.');
  const used=spendPersonalAction(hero,'minor');
  return log(changeHero(battle,{...used,mounted:true}),'personal-mount',
   hero.name+' montou '+hero.mount.name+'.',hero);
 }
 if(action.kind==='personal-dismount'){
  if(!hero.mounted)throw new Error('Personagem não está montado.');
  const used=spendPersonalAction(hero,'minor');
  return log(changeHero(battle,{...used,mounted:false,mountControlledTurn:undefined}),
   'personal-dismount',hero.name+' desmontou.',hero);
 }
 if(action.kind==='personal-control-mount'){
  if(!hero.mounted||!hero.mount||hero.mount.health<=0)
   throw new Error('Controle exige montaria viva e cavaleiro montado.');
  const weight=hero.mount.trainedForWar&&hero.mount.health===hero.mount.maxHealth?
   'minor':'major';
  const used=spendPersonalAction(hero,weight);
  return log(changeHero(battle,{...used,mountControlledTurn:hero.usedActions}),
   'personal-control-mount',hero.name+' controlou a montaria ('+
   (weight==='major'?'ação maior':'ação menor')+').',hero);
 }
 if(action.kind==='personal-move'){
  if(hero.mounted&&hero.mountControlledTurn!==hero.usedActions)
   throw new Error('Controle a montaria antes de deslocá-la.');
  if(!action.toMetres)throw new Error('Informe a posição de destino em metros.');
  const moved=moveFine(battle,hero,action.toMetres,personalMovement(hero));
  const next=spendPersonalAction(moved,'minor');
  return log(changeHero(battle,hero.mounted?{
   ...next,mountMovedTurn:hero.usedActions,
  }:next),'personal-move',
   hero.name+' moveu-se em escala de um metro para '+action.toMetres.x+
   ','+action.toMetres.y+'.',hero);
 }
 if(action.kind==='personal-dodge'){
  const used=spendPersonalAction(hero,'major');
  const roll=rollPersonalWithFate(battle.seed,hero,hero.agility??3,
   Math.min(15,(hero.shieldBonusDice??0)+(hero.passBonusDice??0)),
   Math.min(15,hero.injuries??0));
  const defense=Math.max(0,roll.total-(hero.armorPenalty??0)-(hero.wounds??0)+
   (hero.defensiveBonus??0));
  const next=changeHero({...battle,seed:roll.nextSeed},
   {...consumePersonalFateRoll(used),dodgeDefense:defense,passBonusDice:0});
  return log(next,'personal-dodge',hero.name+' esquivou e substituiu a Defesa por '+
   defense+'.',hero,{roll:roll.dice,total:defense});
 }
 if(action.kind==='personal-recover'){
  const used=spendPersonalAction(hero,'major');
  const roll=rollPersonalWithFate(battle.seed,hero,hero.endurance??3,
   hero.passBonusDice??0,hero.injuries??0);
  const total=Math.max(0,roll.total-(hero.wounds??0));
  const healed=Math.min(hero.maxHealth-hero.health,degreesOfSuccess(total,0));
  const next=changeHero({...battle,seed:roll.nextSeed},
   {...consumePersonalFateRoll(used),health:hero.health+healed,passBonusDice:0});
  return log(next,'personal-recover',hero.name+' recuperou '+healed+' de Saúde.',
   hero,{roll:roll.dice,total,difficulty:0,degrees:degreesOfSuccess(total,0)});
 }
 if(action.kind==='personal-pass'){
  const next=changeHero(battle,{...spendPersonalAction(hero,'major'),
   passBonusDice:2});
  return log(next,'personal-pass',hero.name+' passou a rodada e preparou +2B.',hero);
 }
 if(action.kind==='personal-charge'){
  const target=battle.heroes.find(h=>h.id===action.targetHeroId&&h.active&&h.side!==hero.side&&!h.unitId);
  if(!target)throw new Error('Carga pessoal exige herói inimigo ativo.');
  const origin=personalPosition(hero),end=personalPosition(target);
  if(personalDistance(origin,end)<=1)throw new Error('Carga exige aproximação até o adversário.');
  const aim={x:end.x-Math.sign(end.x-origin.x),y:end.y-Math.sign(end.y-origin.y)};
  const moved=moveFine(battle,hero,aim,personalMovement(hero)*2);
  const used=spendPersonalAction(moved,'major');
  const next=changeHero(battle,used);
  return attackHero(next,used,target,false,{charge:true});
 }
 if(action.kind==='personal-attack'){
  if(hero.attackedThisTurn)throw new Error('Somente um ataque por rodada individual.');
  const target=battle.heroes.find(h=>h.id===action.targetHeroId&&h.active&&h.side!==hero.side&&!h.unitId);
  if(!target)throw new Error('Selecione um herói inimigo ativo.');
  const spent=spendPersonalAction(hero,'minor');
  const used={...spent,attackedThisTurn:spent.usedActions===hero.usedActions};
  const next=changeHero(battle,used);
  return attackHero(next,used,target,Boolean(action.ranged));
 }
 throw new Error('Ação individual não implementada.');
}
