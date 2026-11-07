import {degreesOfSuccess} from './dice';
import {movementSlow,terrainAt,terrainEffect,visibilityPenalty} from './terrain';
import type {WarBattle,WarEvent,WarPosition} from './types';
import type {WarHero} from './heroes';
import {queuePersonalDamage} from './personal-injuries';
import {effectivePersonalArmor,activePersonalOffhandDefense} from './personal-weapons';
import {applyPersonalWeaponQualities} from './personal-weapon-effects';
import {applyPersonalControlHit,resolvePersonalControlAction} from './personal-control';
import type {ControlActionKind,AdvancedControlKind} from './personal-control';
import {resolveAdvancedPersonalControl,releaseAbandonedGrapplePin} from './personal-control';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import {applyPersonalMountDamage} from './personal-mounts';
import {releaseBrokenPersonalGrapples} from './personal-links';

/** Capítulo 9: escala pessoal de 1 m. Não usa os quadrados de guerra de 10 m para alcance. */
export type PersonalWarAction=Readonly<{
 kind:'personal-attack'|'personal-charge'|'personal-move'|'personal-dodge'|
  'personal-recover'|'personal-pass'|'personal-end-turn'|'personal-surrender'|
  'personal-reload'|'personal-mount'|'personal-dismount'|'personal-control-mount'|
  'personal-counterattack'|'personal-attack-mount'|'personal-trample'|
  'personal-free-mount'|'personal-stand'|'personal-aim'|
  'personal-cautious-attack'|'personal-reckless-attack'|
  'personal-release-grapple'|'personal-escape-grapple'|
  'personal-escape-entangle'|'personal-release-impale'|
  'personal-remove-impale'|'personal-split-attack'|
  'personal-dual-attack'|'personal-combined-attack'|
  'personal-pin-grapple'|'personal-escape-pin'|'personal-pin-impale'|
  'personal-heal-remove-impale';
 targetHeroId?:string;
 ranged?:boolean;
 vsCharge?:boolean;
 toMetres?:WarPosition;
 escapeUsing?:'agility'|'athletics';
 twoHandedGrip?:boolean;powerBonusDice?:number;stunHit?:boolean;
 grappleHit?:boolean;splitTargets?:readonly string[];
 splitRanks?:readonly number[];splitBonuses?:readonly number[];
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
 return hero.entangledBy?1:Math.max(1,base+Math.floor((hero.runningBonusDice??0)/2)-
  Math.floor(((hero.bulk??0)+(hero.offhandWeapon?.bulk??0)+
   (hero.meleeWeapon?.bulk??0)+(hero.rangedWeapon?.bulk??0))/2));
}
export function spendPersonalAction(hero:WarHero,weight:'major'|'minor'):WarHero{
 if(hero.usedActions>=5)throw new Error('Cinco rodadas individuais já concluídas.');
 const minor=hero.minorActionsUsed??0;
 // A Defesa transitória termina quando o herói começa seu próximo turno.
 const expired=minor===0?{cautiousDefenseBonus:0,recklessDefensePenalty:0,
  offhandDefenseSuppressed:false}:{};
 if(weight==='major'){
  if(hero.stunnedNextTurn)throw new Error('Atordoante impede ação maior neste turno.');
  if(minor!==0)throw new Error('Uma ação maior exige um turno sem ações menores prévias.');
  return {...hero,...expired,usedActions:hero.usedActions+1,minorActionsUsed:0,dodgeDefense:null,attackedThisTurn:false,counterattackReady:undefined};
 }
 if(minor>0)return {...hero,...expired,usedActions:hero.usedActions+1,minorActionsUsed:0,dodgeDefense:null,attackedThisTurn:false,counterattackReady:undefined,stunnedNextTurn:false};
 return {...hero,...expired,minorActionsUsed:1,dodgeDefense:null,counterattackReady:undefined};
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
 if(hero.grabbedBy||hero.grapplingTargetId||hero.impaledBy)
  throw new Error('Agarrado ou empalado: liberte-se antes de se mover.');
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
 options:{charge?:boolean;asReaction?:boolean;counterCharge?:boolean;
  cautious?:boolean;reckless?:boolean;
  twoHandedGrip?:boolean;powerBonusDice?:number;stunHit?:boolean;
  grappleHit?:boolean;splitRank?:number;splitBonus?:number;
  offhandDamageBonus?:number}={},
):WarBattle{
 const from=personalPosition(actor),to=personalPosition(target);
 const dist=personalDistance(from,to);
 const reach=actor.meleeWeapon?.reachMetres??1;
 const selectedWeapon=ranged?actor.rangedWeapon:actor.meleeWeapon;
 if(options.offhandDamageBonus&&(!actor.offhandWeapon?.offhandDamageBonus||
   actor.offhandWeaponBroken||actor.meleeWeapon?.twoHanded||ranged))
  throw new Error('Ataque com duas armas exige Mão Inábil disponível.');
 if(!ranged&&actor.meleeWeaponDisarmed)
  throw new Error('A arma foi desarmada por Empalar e não pode atacar.');
 if(actor.grabbedBy&&(!selectedWeapon?.grapple&&!selectedWeapon?.shortBlade||ranged))
  throw new Error('Agarrado: ataque apenas com Briga ou lâmina curta.');
 if(actor.grapplingTargetId&&(target.id!==actor.grapplingTargetId||
  !selectedWeapon?.grapple))
  throw new Error('Agarrando: ataque apenas o alvo seguro com arma de Agarrar.');
 if(actor.entanglingTargetId&&selectedWeapon?.entangle)
  throw new Error('A arma de Enredar está prendendo outro alvo.');
 if(actor.impalingTargetId&&selectedWeapon?.impale)
  throw new Error('A arma de Empalar está presa no alvo anterior.');
 if(ranged?actor.rangedWeaponBroken:actor.meleeWeaponBroken)
  throw new Error('A arma está quebrada e não pode ser utilizada.');
 if(options.stunHit&&(!selectedWeapon?.stunning||ranged))
  throw new Error('Atordoante exige arma de Luta apropriada.');
 if(!ranged&&selectedWeapon?.counterChargeOnly&&!options.counterCharge)
  throw new Error('Arma Contra Carga só pode atacar numa reação a uma carga.');
 if(options.twoHandedGrip&&(!selectedWeapon?.adaptable||ranged))
  throw new Error('Uso Adaptável exige arma de Luta apropriada.');
 const invested=options.powerBonusDice??0;
 if(!Number.isInteger(invested)||invested<0||invested>(actor.strengthBonusDice??0)||
  (invested>0&&!selectedWeapon?.powerful))
  throw new Error('Dados de Força investidos inválidos para arma Poderosa.');
 if(!ranged&&dist>Math.max(1,reach))
  throw new Error('Ataque de Luta exige alvo adjacente ou dentro do alcance em metros.');
 const effectiveRange=(actor.rangedRange??'short')==='long'?100:10;
 if(ranged&&(actor.rangedDamage<=0||actor.rangedRange==='none'))
  throw new Error('Herói não possui arma de Pontaria disponível.');
 if(ranged&&actor.rangedWeapon?.reload&&actor.rangedLoaded===false)
  throw new Error('Esta arma precisa ser recarregada antes do próximo disparo.');
 // Contra-ataque (cap. 9, p. 216) é resolvido antes do golpe que o disparou.
 // O dano da reação é decidido antes de retomar o ataque interrompido.
 if(!options.asReaction&&target.counterattackReady){
  const stance=target.counterattackReady;
  const reactionDistance=personalDistance(personalPosition(target),personalPosition(actor));
  const range=stance.ranged?(target.rangedRange==='long'?100:10):
   (target.meleeWeapon?.reachMetres??1);
  const loaded=!stance.ranged||!target.rangedWeapon?.reload||target.rangedLoaded!==false;
  if(reactionDistance<=range&&loaded&&(!stance.vsCharge||options.charge)&&
    !target.pinnedByHero&&!target.pinnedByMount&&
    (!target.grabbedBy||(!stance.ranged&&Boolean(
     target.meleeWeapon?.grapple||target.meleeWeapon?.shortBlade)))&&
    (!target.grapplingTargetId||(!stance.ranged&&
     target.grapplingTargetId===actor.id&&Boolean(target.meleeWeapon?.grapple)))){
   const reactor={...target,counterattackReady:undefined};
   let defended=changeHero(battle,reactor);
   defended=attackHero(defended,reactor,actor,stance.ranged,{
    asReaction:true,counterCharge:Boolean(options.charge&&stance.vsCharge),
   });
   if(defended.pendingPersonalDamage){
    return {...defended,pendingPersonalCounterattack:{
     attackerId:actor.id,defenderId:reactor.id,ranged,charge:Boolean(options.charge),
     cautious:Boolean(options.cautious),reckless:Boolean(options.reckless),
     ...(options.stunHit!==undefined?{stunHit:options.stunHit}:{}),
     ...(options.grappleHit!==undefined?{grappleHit:options.grappleHit}:{}),
     ...(options.splitRank!==undefined?{splitRank:options.splitRank}:{}),
     ...(options.splitBonus!==undefined?{splitBonus:options.splitBonus}:{}),
     ...(options.offhandDamageBonus!==undefined?{offhandDamageBonus:options.offhandDamageBonus}:{}),
     ...(options.twoHandedGrip!==undefined?{twoHandedGrip:options.twoHandedGrip}:{}),
     ...(options.powerBonusDice!==undefined?{powerBonusDice:options.powerBonusDice}:{}),
    }};
   }
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
 const rangePenalty=ranged?Math.min(15,Math.max(0,Math.ceil((dist-effectiveRange)/
  (actor.rangedRange==='long'?100:10)))):0;
 const weapon=ranged?actor.rangedWeapon:actor.meleeWeapon;
 const availableBonus=options.splitBonus??(
  (ranged?actor.rangedBonusDice:actor.meleeBonusDice)??0);
 const requiredBonus=weapon?.trainingBonusDice??0;
 const trainingPenalty=Math.max(0,requiredBonus-availableBonus);
 const usableBonus=Math.max(0,availableBonus-requiredBonus);
 const clumsyPenalty=actor.mounted&&weapon?.clumsy?2:0;
 const mountedOnlyPenalty=!actor.mounted&&weapon?.mountedOnly?2:0;
 const totalPenalty=(actor.injuries??0)+(options.charge?1:0)+
  (options.cautious?1:0)+
  (!actor.mounted&&weapon?.mountedOnly?2:0)+
  (actor.oneHandUnavailable&&weapon?.twoHanded?2:0)+
  (!ranged&&reach>1&&dist<3?1:0)+trainingPenalty+clumsyPenalty+mountedOnlyPenalty+
  visibilityPenalty(battle.visibility,battle.weather,ranged)+rangePenalty;
 const mountedBonus=!ranged&&actor.mounted&&actor.mount?.health&&
  actor.mount.health>0&&!target.mounted?1:0;
 const bonus=usableBonus+mountedBonus+(target.prone&&!ranged?1:0)+
  (options.splitRank&&weapon?.fast?1:0);
 const rank=Math.min(15,(options.splitRank??(ranged?actor.marksmanship:actor.fighting))+
  (options.reckless&&!ranged?1:0)+(target.pinnedByHero?1:0));
 const roll=rollPersonalWithFate(battle.seed,actor,rank,
  Math.min(15,bonus+(actor.passBonusDice??0)+(actor.aimBonusDice??0)),
  Math.min(15,totalPenalty));
 const total=Math.max(0,roll.total-(actor.wounds??0)-(actor.entangledBy?5:0));
 const difficulty=Math.max(1,(target.dodgeDefense??target.defense)+
  activePersonalOffhandDefense(target)-(target.pinnedByHero?(target.agility??3):0)+
  (target.cautiousDefenseBonus??0)-(target.recklessDefensePenalty??0)-
  (target.pinnedByMount?5:0)-(target.grabbedBy?5:0));
 const degrees=degreesOfSuccess(total,difficulty);
 const stationaryMountBonus=!ranged&&actor.mounted&&actor.mount?.trainedForWar&&
  actor.mount.health>0&&actor.mountMovedTurn!==actor.usedActions?2:0;
 const base=weapon?.noDamage?0:
  (ranged?actor.rangedDamage:
   actor.meleeDamage+(options.charge?2:0)+stationaryMountBonus+
   (options.counterCharge?2:0)+
   (!ranged&&selectedWeapon?.adaptable&&options.twoHandedGrip?1:0)+
   (options.offhandDamageBonus??0))+invested;
 const stunApplied=Boolean(options.stunHit&&selectedWeapon?.stunning&&degrees>=2);
 const damageDegrees=degrees-(stunApplied?1:0);
 const damage=damageDegrees&&base?Math.max(0,base*damageDegrees-
  effectivePersonalArmor(target.armor,ranged?actor.rangedWeapon:actor.meleeWeapon)):0;
 let next:WarBattle={...battle,seed:roll.nextSeed,
  heroes:battle.heroes.map(h=>h.id===actor.id?{
   ...consumePersonalFateRoll(h),passBonusDice:0,aimBonusDice:0,
   ...(ranged&&weapon?.reload?{rangedLoaded:false}:{})
  }:h),
 };
 if(damage>0)next=queuePersonalDamage(next,{actorName:actor.name,
  targetHeroId:target.id,damage,source:'personal',cruel:weapon?.cruel??false});
 next=applyPersonalWeaponQualities(next,{
  actorId:actor.id,targetId:target.id,weapon,ranged,degrees,stunUsed:stunApplied,
 });
 next=applyPersonalControlHit(next,{
  actorId:actor.id,targetId:target.id,weapon,degrees,total,
  ...(options.grappleHit!==undefined?{grappleHit:options.grappleHit}:{}),
 });
 const defeated=next.heroes.find(h=>h.id===target.id)?.active===false;
 next=log(next,'personal-attack',actor.name+' atacou '+target.name+
  ' ('+(ranged?'Pontaria':'Luta')+'): '+total+' vs Defesa '+difficulty+
  ', '+degrees+' grau(s), '+damage+' dano'+(stunApplied?' (Atordoante)':'')+
  (defeated?' (derrotado)':'')+'.',
  actor,{roll:roll.dice,total,difficulty,degrees});
 return next;
}
/** Uma ação maior pode atacar dois ou mais inimigos, dividindo os dados
 * de teste e os de bônus. Salva o índice antes de um golpe pendente para
 * que escolhas de dano e contra-ataques não dupliquem rolagens.
 */
export function resumePersonalSplit(battle:WarBattle):WarBattle{
 const plan=battle.pendingPersonalSplit;
 if(!plan)return battle;
 if(battle.pendingPersonalDamage||battle.pendingPersonalCounterattack)
  throw new Error('Resolva a reação pendente antes de continuar ataque dividido.');
 let next=battle;
 for(let i=plan.nextIndex;i<plan.targetIds.length;i++){
  const actor=next.heroes.find(h=>h.id===plan.actorId);
  const target=next.heroes.find(h=>h.id===plan.targetIds[i]);
  if(!actor?.active||!target?.active)continue;
  next={...next,pendingPersonalSplit:{...plan,nextIndex:i+1}};
  next=attackHero(next,actor,target,false,{
   splitRank:plan.ranks[i]!,splitBonus:plan.bonuses[i]!,
   ...(plan.offhandDamageBonus!==undefined?{offhandDamageBonus:plan.offhandDamageBonus}:{}),
  });
  if(next.pendingPersonalDamage||next.pendingPersonalCounterattack)return next;
 }
 const actor=next.heroes.find(h=>h.id===plan.actorId);
 const completed:WarBattle={...next,pendingPersonalSplit:undefined};
 return actor?log(completed,'personal-split-complete',actor.name+
  ' concluiu ataque dividido em '+plan.targetIds.length+' alvos.',actor):completed;
}
/** Retoma o golpe interrompido após a vítima decidir a mitigação.
 * Uma reação que derruba o agressor cancela o ataque original.
 */
export function resumePersonalCounterattack(battle:WarBattle):WarBattle{
 const pending=battle.pendingPersonalCounterattack;
 if(!pending)return battle;
 if(battle.pendingPersonalDamage)
  throw new Error('Resolva a mitigação da reação antes de continuar.');
 const next:WarBattle={...battle,pendingPersonalCounterattack:undefined};
 const attacker=next.heroes.find(h=>h.id===pending.attackerId);
 const defender=next.heroes.find(h=>h.id===pending.defenderId);
 if(!attacker?.active){
  return defender?log(next,'personal-counterattack-interrupt',
   defender.name+' interrompeu o ataque de '+(attacker?.name??'oponente')+
   ' por contra-ataque.',defender):next;
 }
 if(!defender?.active)return next;
 return attackHero(next,attacker,defender,pending.ranged,{
  asReaction:true,charge:pending.charge,
  cautious:Boolean(pending.cautious),reckless:Boolean(pending.reckless),
  ...(pending.stunHit!==undefined?{stunHit:pending.stunHit}:{}),
  ...(pending.grappleHit!==undefined?{grappleHit:pending.grappleHit}:{}),
  ...(pending.splitRank!==undefined?{splitRank:pending.splitRank}:{}),
  ...(pending.splitBonus!==undefined?{splitBonus:pending.splitBonus}:{}),
  ...(pending.offhandDamageBonus!==undefined?{offhandDamageBonus:pending.offhandDamageBonus}:{}),
  ...(pending.twoHandedGrip!==undefined?{twoHandedGrip:pending.twoHandedGrip}:{}),
  ...(pending.powerBonusDice!==undefined?{powerBonusDice:pending.powerBonusDice}:{}),
 });
}
/** Retoma um atropelamento a partir da próxima casa pessoal ainda não processada.
 * O percurso e a ação maior são comprometidos uma única vez. Quando o defensor
 * optar por ferimentos/lesão, a reação para antes de encontrar outro alvo.
 */
export function resumePersonalTrample(battle:WarBattle):WarBattle{
 const plan=battle.pendingPersonalTrample;
 if(!plan)return battle;
 if(battle.pendingPersonalDamage)
  throw new Error('Resolva a mitigação antes de continuar o atropelamento.');
 const rider=battle.heroes.find(h=>h.id===plan.riderId);
 if(!rider?.active){
  return {...battle,pendingPersonalTrample:undefined};
 }
 let next=battle,hits=plan.hits;
 const dir={x:Math.sign(plan.to.x-plan.from.x),
  y:Math.sign(plan.to.y-plan.from.y)};
 for(let step=plan.nextStep;step<=plan.steps;step++){
  const p={x:plan.from.x+dir.x*step,y:plan.from.y+dir.y*step};
  const target=next.heroes.find(h=>h.id!==rider.id&&h.side!==rider.side&&
   h.active&&!h.unitId&&personalPosition(h).x===p.x&&
   personalPosition(h).y===p.y);
  if(!target)continue;
  const performer=next.heroes.find(h=>h.id===rider.id)??rider;
  const roll=rollPersonalWithFate(next.seed,performer,
   performer.animalHandling??3,0,performer.injuries??0);
  const total=Math.max(0,roll.total-(performer.wounds??0));
  const difficulty=Math.max(1,(target.dodgeDefense??target.defense)+
   (target.cautiousDefenseBonus??0)-(target.recklessDefensePenalty??0)-
   (target.pinnedByMount?5:0))+
   (plan.mountTrainedForWar?0:6)+5*hits;
  const degrees=degreesOfSuccess(total,difficulty);
  const damage=degrees?Math.max(0,plan.mountAthletics*degrees-target.armor):0;
  next={...next,seed:roll.nextSeed,
   heroes:next.heroes.map(h=>h.id===rider.id?consumePersonalFateRoll(h):h)};
  if(damage)next=queuePersonalDamage(next,{actorName:plan.mountName,
   targetHeroId:target.id,damage,source:'personal'});
  next=log(next,'personal-trample',plan.mountName+' atropelou '+
   target.name+' ('+(hits+1)+'º alvo): '+total+' vs '+difficulty+
   ', '+damage+' dano.',rider,{roll:roll.dice,total,difficulty,degrees});
  hits++;
  if(next.pendingPersonalDamage)
   return {...next,pendingPersonalTrample:{...plan,nextStep:step+1,hits}};
 }
 const completed:WarBattle={...next,pendingPersonalTrample:undefined};
 return log(completed,'personal-trample-move',rider.name+' percorreu '+
  plan.steps+' m em linha reta com '+plan.mountName+
  ' e atingiu '+hits+' alvo(s).',rider);
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
 if(hero.pinnedByMount&&!['personal-free-mount','personal-surrender'].includes(action.kind))
  throw new Error('Cavaleiro preso sob a montaria precisa se libertar antes de agir.');
 if(hero.pinnedByHero&&!['personal-escape-pin','personal-surrender'].includes(action.kind))
  throw new Error('Imobilizado: só pode tentar escapar ou render-se.');
 if(hero.pinningTargetId&&!['personal-pin-grapple','personal-release-grapple'].includes(action.kind)){
  battle=releaseAbandonedGrapplePin(battle,hero.id);
  hero=battle.heroes.find(h=>h.id===hero.id)!;
 }
 if(['personal-pin-grapple','personal-escape-pin','personal-pin-impale',
   'personal-heal-remove-impale'].includes(action.kind)){
  const used=spendPersonalAction(hero,'major');
  return resolveAdvancedPersonalControl(changeHero(battle,used),used,
   action.kind as AdvancedControlKind,action.targetHeroId);
 }
 if(action.kind==='personal-release-grapple'){
  return resolvePersonalControlAction(battle,hero,action.kind);
 }
 if(['personal-escape-grapple','personal-escape-entangle',
     'personal-release-impale','personal-remove-impale'].includes(action.kind)){
  const kind=action.kind as ControlActionKind;
  const weight=kind==='personal-escape-grapple'||kind==='personal-release-impale'?
   'minor':'major';
  const spent=spendPersonalAction(hero,weight);
  return resolvePersonalControlAction(changeHero(battle,spent),spent,kind,
   action.escapeUsing??'athletics');
 }
 if(action.kind==='personal-dual-attack'){
  if(hero.attackedThisTurn)throw new Error('Somente um ataque por rodada individual.');
  const target=battle.heroes.find(h=>h.id===action.targetHeroId&&h.active&&
   h.side!==hero.side&&!h.unitId);
  if(!target)throw new Error('Selecione inimigo individual para Duas Armas.');
  if(!hero.offhandWeapon?.offhandDamageBonus||hero.offhandWeaponBroken||
   hero.meleeWeapon?.twoHanded||hero.meleeWeaponBroken)
   throw new Error('Duas Armas exige arma principal e Mão Inábil disponíveis.');
  const used={...spendPersonalAction(hero,'major'),
   attackedThisTurn:true,offhandDefenseSuppressed:true};
  return attackHero(changeHero(battle,used),used,target,false,{
   offhandDamageBonus:hero.offhandWeapon.offhandDamageBonus,
  });
 }
 if(['personal-split-attack','personal-combined-attack'].includes(action.kind)){
  if(hero.attackedThisTurn)throw new Error('Somente um ataque por rodada individual.');
  if(hero.grapplingTargetId||hero.grabbedBy||hero.impaledBy)
   throw new Error('Libere a contenção antes de dividir os ataques.');
  if(action.kind==='personal-combined-attack'&&
   (!hero.offhandWeapon?.offhandDamageBonus||hero.offhandWeaponBroken||
    hero.meleeWeapon?.twoHanded))
   throw new Error('Ataque Combinado exige arma secundária Mão Inábil.');
  if(hero.meleeWeapon?.slow||hero.meleeWeapon?.counterChargeOnly)
   throw new Error('Arma Lenta ou Contra Carga não permite Ataque Dividido.');
  if(hero.meleeWeaponBroken||hero.meleeWeaponDisarmed||hero.impalingTargetId)
   throw new Error('A arma não está disponível para Ataque Dividido.');
  const ids=action.splitTargets??[],ranks=action.splitRanks??[];
  const bonuses=action.splitBonuses??ids.map(()=>0);
  if(ids.length<2||ids.length!==ranks.length||ids.length!==bonuses.length||
   new Set(ids).size!==ids.length)
   throw new Error('Ataque Dividido exige pelo menos dois alvos distintos e alocações.');
  const allocated=ranks.reduce((s,n)=>s+n,0),allocatedBonus=bonuses.reduce((s,n)=>s+n,0);
  if(ranks.some(n=>!Number.isInteger(n)||n<1||n>15)||
   bonuses.some((n,i)=>!Number.isInteger(n)||n<0||n>ranks[i]!)||
   allocated!==hero.fighting||allocatedBonus>(hero.meleeBonusDice??0))
   throw new Error('Divida exatamente os dados de Luta e limite os dados de bônus.');
  for(const id of ids){
   const target=battle.heroes.find(h=>h.id===id&&h.active&&!h.unitId&&h.side!==hero.side);
   if(!target||personalDistance(personalPosition(hero),personalPosition(target))>
     (hero.meleeWeapon?.reachMetres??1))
    throw new Error('Todos os alvos divididos devem ser inimigos ativos no alcance.');
  }
  const used=spendPersonalAction(hero,'major');
  const paired=action.kind==='personal-combined-attack';
  const next:WarBattle={...changeHero(battle,{...used,attackedThisTurn:true,
   ...(paired?{offhandDefenseSuppressed:true}:{})}),
   pendingPersonalSplit:{actorId:hero.id,targetIds:[...ids],
    ranks:[...ranks],bonuses:[...bonuses],nextIndex:0,
    ...(paired?{offhandDamageBonus:hero.offhandWeapon!.offhandDamageBonus!}:{})}};
  return resumePersonalSplit(next);
 }
 if(action.kind==='personal-end-turn'){
  if(!hero.minorActionsUsed)throw new Error('Não há ação menor pendente para encerrar.');
  return log(changeHero(battle,{...hero,minorActionsUsed:0,
   usedActions:hero.usedActions+1,attackedThisTurn:false,stunnedNextTurn:false}),'personal-end-turn',
   hero.name+' encerrou sua rodada pessoal.',hero);
 }
 if(action.kind==='personal-surrender'){
  const used=spendPersonalAction(hero,'major');
  const next=changeHero(battle,{...used,surrendered:true,active:false});
  return log(releaseBrokenPersonalGrapples({...next,commanders:hero.commanderId?
   next.commanders.map(c=>c.id===hero.commanderId?{...c,active:false}:c):
   next.commanders}),'personal-surrender',hero.name+' se rendeu (destino narrativo pendente).',hero);
 }
 if(action.kind==='personal-aim'){
  if(hero.aimBonusDice)throw new Error('Mirar não acumula bônus em ataques consecutivos.');
  const used=spendPersonalAction(hero,'minor');
  return log(changeHero(battle,{...used,aimBonusDice:1}),
   'personal-aim',hero.name+' mirou, ganhando +1B no próximo ataque.',hero);
 }
 if(action.kind==='personal-counterattack'){
  if(action.ranged&&(hero.rangedDamage<=0||hero.rangedRange==='none'))
   throw new Error('O contra-ataque à distância exige arma de Pontaria.');
  if(action.ranged&&hero.rangedWeapon?.reload&&hero.rangedLoaded===false)
   throw new Error('Recarregue antes de preparar o contra-ataque.');
  if(action.vsCharge&&action.ranged)
   throw new Error('Preparar contra carga exige arma de Luta.');
  if(!action.ranged&&hero.meleeWeapon?.counterChargeOnly&&!action.vsCharge)
   throw new Error('Pique só pode ser preparado contra uma carga.');
  const used=spendPersonalAction(hero,'major');
  return log(changeHero(battle,{...used,counterattackReady:{
   ranged:Boolean(action.ranged),vsCharge:Boolean(action.vsCharge),
  }}),'personal-counterattack-ready',hero.name+
   ' preparou contra-ataque'+(action.vsCharge?' contra carga':'')+'.',hero);
 }
 if(action.kind==='personal-stand'){
  if(!hero.prone||hero.pinnedByMount)
   throw new Error('A ação de levantar exige personagem caído e livre.');
  const used=spendPersonalAction(hero,hero.armor>=6?'major':'minor');
  return log(changeHero(battle,{...used,prone:false}),'personal-stand',
   hero.name+' se levantou após a queda.',hero);
 }
 if(action.kind==='personal-free-mount'){
  if(!hero.pinnedByMount)throw new Error('O personagem não está preso sob a montaria.');
  const rank=action.escapeUsing==='agility'?hero.agility??3:hero.athletics??3;
  const used=spendPersonalAction(hero,'major');
  const roll=rollPersonalWithFate(battle.seed,hero,rank,0,hero.injuries??0);
  const total=Math.max(0,roll.total-(hero.wounds??0));
  const success=total>=9;
  const freed={...consumePersonalFateRoll(used),pinnedByMount:!success};
  return log(changeHero({...battle,seed:roll.nextSeed},freed),
   'personal-free-mount',hero.name+(success?' libertou-se':' falhou em se libertar')+
   ' sob a montaria: '+total+' vs 9.',hero,{
    roll:roll.dice,total,difficulty:9,degrees:degreesOfSuccess(total,9),
   });
 }
 if(action.kind==='personal-attack-mount'){
  if(hero.attackedThisTurn)
   throw new Error('Somente um ataque por rodada individual.');
  const target=battle.heroes.find(h=>h.id===action.targetHeroId&&
   h.side!==hero.side&&h.mount&&h.mount.health>0&&!h.unitId);
  if(!target)throw new Error('Selecione montaria inimiga viva.');
  const ranged=Boolean(action.ranged),dist=personalDistance(
   personalPosition(hero),personalPosition(target));
  const reach=hero.meleeWeapon?.reachMetres??1;
  if(!ranged&&dist>Math.max(1,reach))
   throw new Error('Montaria fora do alcance de Luta.');
  const range=ranged?(hero.rangedRange==='long'?100:10):reach;
  if(ranged&&(hero.rangedRange==='none'||hero.rangedDamage<=0))
   throw new Error('Arma de Pontaria indisponível.');
  if(ranged&&hero.rangedWeapon?.reload&&hero.rangedLoaded===false)
   throw new Error('Recarregue a arma antes de atacar a montaria.');
  const weapon=ranged?hero.rangedWeapon:hero.meleeWeapon;
  const bonus=(ranged?hero.rangedBonusDice:hero.meleeBonusDice)??0;
  const required=weapon?.trainingBonusDice??0;
  const penalty=Math.min(15,(hero.injuries??0)+Math.max(0,required-bonus)+
   (hero.mounted&&weapon?.clumsy?2:0)+
   (!hero.mounted&&weapon?.mountedOnly?2:0)+
   (hero.oneHandUnavailable&&weapon?.twoHanded?2:0)+
   (ranged?visibilityPenalty(battle.visibility,battle.weather,true)+
    Math.max(0,Math.ceil((dist-range)/(hero.rangedRange==='long'?100:10))):0));
  const roll=rollPersonalWithFate(battle.seed,hero,
   ranged?hero.marksmanship:hero.fighting,
   Math.min(15,Math.max(0,bonus-required)+(hero.passBonusDice??0)+
    (hero.aimBonusDice??0)),penalty);
  const total=Math.max(0,roll.total-(hero.wounds??0));
  const difficulty=target.mount!.defense;
  const degrees=degreesOfSuccess(total,difficulty);
  const damage=degrees?Math.max(0,
   (ranged?hero.rangedDamage:hero.meleeDamage)*degrees):0;
  const spent=spendPersonalAction(hero,'minor');
  const used={...consumePersonalFateRoll(spent),
   attackedThisTurn:spent.usedActions===hero.usedActions,
   passBonusDice:0,aimBonusDice:0,
   ...(ranged&&weapon?.reload?{rangedLoaded:false}:{})};
  let next=changeHero({...battle,seed:roll.nextSeed},used);
  if(damage>0)next=applyPersonalMountDamage(next,{
   riderId:target.id,damage,source:hero.name,
  });
  return log(next,'personal-attack-mount',hero.name+' atacou '+
   target.mount!.name+': '+total+' vs Defesa '+difficulty+
   ', '+degrees+' grau(s), '+damage+' dano.',hero,{
    roll:roll.dice,total,difficulty,degrees,
   });
 }
 if(action.kind==='personal-trample'){
  if(battle.pendingPersonalTrample)
   throw new Error('Já existe um atropelamento a resolver.');
  if(!hero.mounted||!hero.mount||hero.mount.health<=0)
   throw new Error('Atropelar exige montaria viva e cavaleiro montado.');
  if(!action.toMetres)throw new Error('Selecione destino de atropelamento em metros.');
  const from=personalPosition(hero),to=action.toMetres;
  const dx=to.x-from.x,dy=to.y-from.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps<1||!(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)))
   throw new Error('Atropelamento exige trajeto em linha reta.');
  if(steps>hero.mount.movement)
   throw new Error('Atropelamento excede Movimento da montaria.');
  const moved=moveFine(battle,hero,to,hero.mount.movement);
  const used=spendPersonalAction(moved,'major');
  const next:WarBattle={...changeHero(battle,{
   ...used,mountMovedTurn:hero.usedActions,
  }),pendingPersonalTrample:{
   riderId:hero.id,from,to,steps,nextStep:1,hits:0,
   mountName:hero.mount.name,mountAthletics:hero.mount.athletics,
   mountTrainedForWar:hero.mount.trainedForWar,
  }};
  return resumePersonalTrample(next);
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
  // O controle difícil ocupa o turno inteiro: movimento pode ocorrer junto
  // à ação maior, em vez de ser impossibilitado pelo orçamento de ações.
  const moving=weight==='major'&&action.toMetres?
   moveFine(battle,hero,action.toMetres,hero.mount.movement):hero;
  const used=spendPersonalAction(moving,weight);
  return log(changeHero(battle,{
   ...used,mountControlledTurn:hero.usedActions,
   ...(moving!==hero?{mountMovedTurn:hero.usedActions}:{})
  }),'personal-control-mount',hero.name+' controlou a montaria ('+
   (weight==='major'?'ação maior':'ação menor')+')'+
   (moving!==hero?' e deslocou-se durante o controle.':'.'),hero);
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
  return attackHero(next,used,target,false,{charge:true,
   ...(action.stunHit!==undefined?{stunHit:action.stunHit}:{}),
   ...(action.twoHandedGrip!==undefined?{twoHandedGrip:action.twoHandedGrip}:{}),
   ...(action.powerBonusDice!==undefined?{powerBonusDice:action.powerBonusDice}:{})});
 }
 if(['personal-attack','personal-cautious-attack','personal-reckless-attack'].includes(action.kind)){
  if(hero.attackedThisTurn)throw new Error('Somente um ataque por rodada individual.');
  const target=battle.heroes.find(h=>h.id===action.targetHeroId&&h.active&&h.side!==hero.side&&!h.unitId);
  if(!target)throw new Error('Selecione um herói inimigo ativo.');
  if(action.kind==='personal-reckless-attack'&&action.ranged)
   throw new Error('Ataque Imprudente exige Luta corpo a corpo.');
  const spent=spendPersonalAction(hero,
   action.kind==='personal-reckless-attack'?'major':'minor');
  const used={...spent,attackedThisTurn:spent.usedActions===hero.usedActions,
   ...(action.kind==='personal-cautious-attack'?{cautiousDefenseBonus:3}:{}),
   ...(action.kind==='personal-reckless-attack'?{recklessDefensePenalty:5}:{})};
  const next=changeHero(battle,used);
  return attackHero(next,used,target,Boolean(action.ranged),{
   cautious:action.kind==='personal-cautious-attack',
   reckless:action.kind==='personal-reckless-attack',
   ...(action.twoHandedGrip!==undefined?{twoHandedGrip:action.twoHandedGrip}:{}),
   ...(action.powerBonusDice!==undefined?{powerBonusDice:action.powerBonusDice}:{}),
   ...(action.stunHit!==undefined?{stunHit:action.stunHit}:{}),
   ...(action.grappleHit!==undefined?{grappleHit:action.grappleHit}:{}),
  });
 }
 throw new Error('Ação individual não implementada.');
}
