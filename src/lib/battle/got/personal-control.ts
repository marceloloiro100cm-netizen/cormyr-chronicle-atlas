import {degreesOfSuccess} from './dice';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import type {WarBattle,WarEvent} from './types';
import type {WarHero} from './heroes';
import type {WarPersonalWeapon} from './personal-weapons';
import {queuePersonalDamage} from './personal-injuries';

/** Chapter 9 personal control conditions. Operates only on individuals, not armies. */
const replace=(battle:WarBattle,hero:WarHero):WarBattle=>({
 ...battle,heroes:battle.heroes.map(h=>h.id===hero.id?hero:h),
});
function record(battle:WarBattle,hero:WarHero,kind:string,text:string,
 meta:Partial<WarEvent>={}):WarBattle{
 return {...battle,events:[...battle.events,{
  seq:battle.events.length+1,round:battle.round,side:hero.side,kind,text,...meta,
 }]};
}
function pair(battle:WarBattle,a:WarHero,b:WarHero):WarBattle{
 return replace(replace(battle,a),b);
}
/** Grapple: hit must also exceed passive Athletics; entangle: any hit.
 * Impale: 3+ degrees followed by Athletics 9. Failure disarms attacker.
 */
export function applyPersonalControlHit(
 battle:WarBattle,input:{actorId:string;targetId:string;
  weapon:WarPersonalWeapon|undefined;degrees:number;total:number;
  grappleHit?:boolean},
):WarBattle{
 const actor=battle.heroes.find(h=>h.id===input.actorId);
 const target=battle.heroes.find(h=>h.id===input.targetId);
 if(!actor||!target||input.degrees===0||!target.active||!input.weapon)return battle;
 const weapon=input.weapon;
 if(weapon.grapple&&input.grappleHit&&input.total>=(target.athletics??3)*4){
  if(actor.grapplingTargetId||target.grabbedBy||actor.grabbedBy) return battle;
  const next=pair(battle,{...actor,grapplingTargetId:target.id},
   {...target,grabbedBy:actor.id});
  return record(next,actor,'personal-grapple',actor.name+' agarrou '+target.name+'.');
 }
 if(weapon.entangle&&!target.entangledBy){
  const next=pair(battle,{...actor,entanglingTargetId:target.id},
   {...target,entangledBy:actor.id});
  return record(next,actor,'personal-entangle',actor.name+' enredou '+target.name+'.');
 }
 if(weapon.impale&&input.degrees>=3&&!actor.impalingTargetId){
  const roll=rollPersonalWithFate(battle.seed,actor,actor.athletics??3,
   0,actor.injuries??0);
  const total=Math.max(0,roll.total-(actor.wounds??0)-
   (actor.entangledBy?5:0));
  const stuck=total>=9;
  let next:WarBattle={...battle,seed:roll.nextSeed};
  next=pair(next,{
   ...consumePersonalFateRoll(actor),
   ...(stuck?{impalingTargetId:target.id}:{meleeWeaponDisarmed:true}),
  },stuck?{...target,impaledBy:actor.id}:target);
  return record(next,actor,'personal-impale',actor.name+
   (stuck?' empalou e imobilizou ':' perdeu a arma presa em ')+
   target.name+' ('+total+' vs 9).',{roll:roll.dice,total,difficulty:9,
    degrees:degreesOfSuccess(total,9)});
 }
 return battle;
}
export type ControlActionKind='personal-release-grapple'|
 'personal-escape-grapple'|'personal-escape-entangle'|
 'personal-release-impale'|'personal-remove-impale';

/** Called after the action budget is spent for major/minor actions.
 * Free release is explicitly costless under the book.
 */
export function resolvePersonalControlAction(
 battle:WarBattle,actor:WarHero,kind:ControlActionKind,
 escapeUsing:'agility'|'athletics'='athletics',
):WarBattle{
 if(kind==='personal-release-grapple'){
  if(!actor.grapplingTargetId)throw new Error('Não há oponente agarrado para soltar.');
  const target=battle.heroes.find(h=>h.id===actor.grapplingTargetId);
  if(!target)throw new Error('Oponente agarrado não localizado.');
  const next=pair(battle,{...actor,grapplingTargetId:undefined},
   {...target,grabbedBy:undefined});
  return record(next,actor,'personal-grapple-release',actor.name+' soltou '+target.name+'.');
 }
 if(kind==='personal-escape-grapple'){
  const holder=battle.heroes.find(h=>h.id===actor.grabbedBy&&h.active);
  if(!holder)throw new Error('O personagem não está agarrado por oponente ativo.');
  const roll=rollPersonalWithFate(battle.seed,actor,actor.fighting,
   0,actor.injuries??0);
  const opposing=rollPersonalWithFate(roll.nextSeed,holder,holder.fighting,
   0,holder.injuries??0);
  const total=Math.max(0,roll.total-(actor.wounds??0)-
   (actor.entangledBy?5:0));
  const holderTotal=Math.max(0,opposing.total-(holder.wounds??0)-
   (holder.entangledBy?5:0));
  const success=total>holderTotal;
  let next:WarBattle={...battle,seed:opposing.nextSeed};
  next=pair(next,{
   ...consumePersonalFateRoll(actor),
   ...(success?{grabbedBy:undefined}:{}),
  },{
   ...consumePersonalFateRoll(holder),
   ...(success?{grapplingTargetId:undefined}:{}),
  });
  return record(next,actor,'personal-grapple-escape',actor.name+
   (success?' escapou de ':' não escapou de ')+holder.name+
   ' ('+total+' contra '+holderTotal+').',{roll:roll.dice,total,
    difficulty:holderTotal+1,degrees:success?degreesOfSuccess(total,holderTotal+1):0});
 }
 if(kind==='personal-escape-entangle'){
  const holder=battle.heroes.find(h=>h.id===actor.entangledBy);
  if(!holder)throw new Error('O personagem não está enredado.');
  const rank=escapeUsing==='agility'?(actor.agility??3):(actor.athletics??3);
  const roll=rollPersonalWithFate(battle.seed,actor,rank,0,actor.injuries??0);
  const total=Math.max(0,roll.total-(actor.wounds??0)-5);
  const success=total>=9;
  let next:WarBattle={...battle,seed:roll.nextSeed};
  next=pair(next,{
   ...consumePersonalFateRoll(actor),
   ...(success?{entangledBy:undefined}:{}),
  },success?{...holder,entanglingTargetId:undefined}:holder);
  return record(next,actor,'personal-entangle-escape',actor.name+
   (success?' libertou-se da rede de ':' permaneceu enredado por ')+
   holder.name+' ('+total+' vs 9).',{roll:roll.dice,total,difficulty:9,
    degrees:degreesOfSuccess(total,9)});
 }
 if(kind==='personal-release-impale'){
  if(!actor.impalingTargetId)throw new Error('O personagem não empalou oponente.');
  const victim=battle.heroes.find(h=>h.id===actor.impalingTargetId);
  if(!victim)throw new Error('Vítima empalada não localizada.');
  const roll=rollPersonalWithFate(battle.seed,actor,actor.athletics??3,
   0,actor.injuries??0);
  const difficulty=3+victim.armor,total=Math.max(0,roll.total-
   (actor.wounds??0)-(actor.entangledBy?5:0));
  const degrees=degreesOfSuccess(total,difficulty);
  let next:WarBattle={...battle,seed:roll.nextSeed};
  next=replace(next,consumePersonalFateRoll(actor));
  if(degrees){
   next=pair(next,{...consumePersonalFateRoll(actor),impalingTargetId:undefined},
    {...victim,impaledBy:undefined});
   if(degrees>1){
    const damage=actor.meleeDamage*(degrees-1);
    next=queuePersonalDamage(next,{actorName:actor.name,
     targetHeroId:victim.id,damage,source:'personal'});
   }
  }
  return record(next,actor,'personal-impale-release',actor.name+
   (degrees?' libertou a arma empalada':' não conseguiu libertar a arma')+
   ' ('+total+' vs '+difficulty+').',{roll:roll.dice,total,difficulty,degrees});
 }
 if(kind==='personal-remove-impale'){
  const holder=battle.heroes.find(h=>h.id===actor.impaledBy);
  if(!holder)throw new Error('O personagem não está empalado.');
  const roll=rollPersonalWithFate(battle.seed,actor,actor.athletics??3,
   0,actor.injuries??0);
  const total=Math.max(0,roll.total-(actor.wounds??0));
  const success=total>=9;
  const maxWounds=actor.endurance??3;
  const wounds=(actor.wounds??0),injuries=(actor.injuries??0);
  const willInjure=success&&wounds>=maxWounds;
  const dead=willInjure&&injuries+1>=maxWounds;
  const freed:WarHero={...consumePersonalFateRoll(actor),
   ...(success?{impaledBy:undefined,
    wounds:wounds+(willInjure?0:1),injuries:injuries+(willInjure?1:0),
    ...(dead?{active:false,health:0,defeatOutcome:'death' as const}:{})}:{})};
  let next:WarBattle={...battle,seed:roll.nextSeed};
  next=pair(next,freed,success?{...holder,impalingTargetId:undefined}:holder);
  return record(next,actor,'personal-impale-remove',actor.name+
   (success?' removeu a arma; sofreu 1 ferimento/lesão':' falhou em remover a arma')+
   ' ('+total+' vs 9).',{roll:roll.dice,total,difficulty:9,
    degrees:degreesOfSuccess(total,9)});
 }
 throw new Error('Ação de contenção não suportada.');
}
