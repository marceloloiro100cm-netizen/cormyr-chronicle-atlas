import type {WarBattle,WarEvent} from './types';
import type {WarHero} from './heroes';
import {resumePersonalCounterattack} from './personal-combat';

/** Capítulo 9: decisões voluntárias de mitigação, mantidas fora das fichas oficiais. */
export type PersonalMitigationChoice=Readonly<{
 kind:'none'|'wounds'|'injury';
 woundCount?:number;
}>;
export type WarPendingPersonalDamage=Readonly<{
 actorName:string;targetHeroId:string;damage:number;
 source:'personal'|'unit';cruel?:boolean;
}>;
export function reducePersonalDamage(
 hero:WarHero,damage:number,decision:PersonalMitigationChoice,
):WarHero{
 if(!Number.isInteger(damage)||damage<0)throw new Error('Dano pessoal inválido.');
 if(hero.squadId&&decision.kind!=='none')
  throw new Error('Soldados comuns não recebem ferimentos ou lesões voluntários.');
 const endurance=hero.endurance??3;
 const currentWounds=hero.wounds??0,currentInjuries=hero.injuries??0;
 if(endurance<1||!Number.isInteger(endurance))
  throw new Error('Vigor do personagem inválido.');
 let remaining=damage,wounds=currentWounds,injuries=currentInjuries,dead=false;
 if(decision.kind==='wounds'){
  const count=decision.woundCount??0;
  if(!Number.isInteger(count)||count<1||count>Math.max(0,endurance-currentWounds)||
   damage===0)throw new Error('Quantidade de ferimentos acima do limite de Vigor.');
  wounds+=count;
  remaining=Math.max(0,damage-count*endurance);
 }else if(decision.kind==='injury'){
  if(damage===0||currentInjuries>=endurance)
   throw new Error('O personagem não pode aceitar outra lesão.');
  injuries++;
  remaining=0;
  dead=injuries>=endurance;
 }else if(decision.kind!=='none'){
  throw new Error('Escolha de redução de dano inválida.');
 }else if(decision.woundCount!==undefined){
  throw new Error('A escolha sem mitigação não aceita ferimentos adicionais.');
 }
 const health=dead?0:Math.max(0,hero.health-remaining);
 return {...hero,health,wounds,injuries,active:hero.active&&health>0&&!dead,
  ...(dead?{defeatOutcome:'death' as const}:{})};
}
function log(battle:WarBattle,kind:string,message:string,target:WarHero):WarBattle{
 const event:WarEvent={seq:battle.events.length+1,round:battle.round,
  side:target.side,kind,text:message};
 return {...battle,events:[...battle.events,event]};
}
/** Ao ativar a mitigação manual, o alvo escolhe *depois* de saber o dano do golpe. */
export function queuePersonalDamage(
 battle:WarBattle,input:WarPendingPersonalDamage,
):WarBattle{
 if(input.damage<=0)return battle;
 const victim=battle.heroes.find(h=>h.id===input.targetHeroId&&h.active);
 if(!victim)throw new Error('Personagem atingido indisponível.');
 if(battle.pendingPersonalDamage)throw new Error('Resolva o dano pessoal pendente.');
 if(battle.manualMitigation&&!victim.squadId)
  return {...battle,pendingPersonalDamage:{...input}};
 return applyPersonalDamage(battle,input,{kind:'none'});
}
function applyPersonalDamage(battle:WarBattle,input:WarPendingPersonalDamage,
 choice:PersonalMitigationChoice):WarBattle{
 const hero=battle.heroes.find(h=>h.id===input.targetHeroId);
 if(!hero)throw new Error('Alvo não localizado.');
 const mitigated=reducePersonalDamage(hero,input.damage,choice);
 const updated=input.cruel&&!mitigated.active?
  {...mitigated,defeatOutcome:'death' as const}:mitigated;
 const fallen=hero.active&&!updated.active;
 const next:WarBattle={...battle,
  heroes:battle.heroes.map(h=>h.id===hero.id?updated:h),
  commanders:fallen&&hero.commanderId?battle.commanders.map(c=>
   c.id===hero.commanderId?{...c,active:false}:c):battle.commanders,
 };
 return log(next,'personal-damage',input.actorName+' causou '+input.damage+
  ' de dano potencial a '+hero.name+'; mitigação: '+choice.kind+
  (choice.kind==='wounds'?' ('+(choice.woundCount??0)+' ferimento(s))':'')+
  '. Saúde final '+updated.health+'/'+updated.maxHealth+
  (updated.defeatOutcome==='death'?' (morte)':
   !updated.active?' (derrotado)':'')+'.',hero);
}
export function resolvePendingPersonalDamage(
 battle:WarBattle,choice:PersonalMitigationChoice,
):WarBattle{
 const pending=battle.pendingPersonalDamage;
 if(!pending)throw new Error('Não há dano pessoal pendente.');
 const resolved=applyPersonalDamage(battle,pending,choice);
 return resumePersonalCounterattack({...resolved,pendingPersonalDamage:undefined});
}
