import {criticalFailure,degreesOfSuccess,rollDice} from './dice';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import type {WarBattle,WarEvent} from './types';
import type {WarHero} from './heroes';

/** Capítulo 9, Recuperação. O relógio da campanha NÃO é atualizado por estes testes. */
export type RecoveryActivity='rest'|'light'|'strenuous';
export type RecoveryInterval='daily-wound'|'weekly-injury';
export type PersonalRecoveryInput=Readonly<{
 heroId:string;interval:RecoveryInterval;activity:RecoveryActivity;
 healer?:Readonly<{rank:number;bonusDice?:number;injuries?:number;wounds?:number;hours:number}>;
}>;
export function recoveryDifficulty(interval:RecoveryInterval,activity:RecoveryActivity):number{
 if(interval==='daily-wound')return {rest:6,light:9,strenuous:12}[activity];
 if(interval==='weekly-injury')return {rest:9,light:15,strenuous:21}[activity];
 throw new Error('Intervalo de recuperação inválido.');
}
export type PersonalRecoveryResult=Readonly<{
 hero:WarHero;seed:number;roll:readonly number[];total:number;
 difficulty:number;degrees:number;critical:boolean;
}>;
export function rollPersonalRecovery(hero:WarHero,seed:number,
 input:Omit<PersonalRecoveryInput,'heroId'>):PersonalRecoveryResult{
 if(hero.squadId)throw new Error('Soldados comuns não usam recuperação de heróis.');
 if(hero.defeatOutcome==='death'||hero.removedFromStory)
  throw new Error('Personagem morto ou fora da história não pode realizar recuperação.');
 const endurance=hero.endurance??3;
 if(!Number.isInteger(endurance)||endurance<1||endurance>15)
  throw new Error('Vigor inválido.');
 if(!['rest','light','strenuous'].includes(input.activity))
  throw new Error('Atividade inválida.');
 if(input.interval==='daily-wound'&&(hero.wounds??0)<1)
  throw new Error('Personagem não possui ferimentos a recuperar.');
 if(input.interval==='weekly-injury'&&(hero.injuries??0)<1)
  throw new Error('Personagem não possui lesões a recuperar.');
 const difficulty=recoveryDifficulty(input.interval,input.activity);
 const healer=input.healer;
 if(healer&&(!Number.isInteger(healer.rank)||healer.rank<1||healer.rank>15||
   !Number.isFinite(healer.hours)||healer.hours<4))
  throw new Error('Tratamento exige curandeiro válido e quatro horas diárias.');
 const rank=healer?.rank??endurance;
 const penalty=healer?(healer.injuries??0):(hero.injuries??0);
 const bonus=healer?.bonusDice??0;
 const roll=healer?rollDice(seed,rank,bonus,penalty):
  rollPersonalWithFate(seed,hero,rank,0,penalty);
 const total=Math.max(0,roll.total-(healer?(healer.wounds??0):(hero.wounds??0)));
 const degrees=degreesOfSuccess(total,difficulty);
 const critical=criticalFailure(total,difficulty);
 let wounds=hero.wounds??0,injuries=hero.injuries??0;
 if(degrees){
  if(input.interval==='daily-wound')wounds=Math.max(0,wounds-degrees);
  else injuries=Math.max(0,injuries-1-Math.floor((degrees-1)/2));
 }else if(critical&&!healer){
  if(input.interval==='daily-wound'){
   if(wounds<endurance)wounds++;
   else injuries++;
  }else injuries++;
 }
 const dead=injuries>=endurance;
 return {hero:{...(healer?hero:consumePersonalFateRoll(hero)),wounds,injuries,
   ...(dead?{health:0,active:false,defeatOutcome:'death' as const}:{})},
  seed:roll.nextSeed,roll:roll.dice,total,difficulty,degrees,critical};
}
/** Apenas laboratório de encerramento: simula avanço de um dia/semana já decorrido.
 * Não grava calendário nem mexe em dados oficiais das Casas.
 */
export function resolveLabRecovery(battle:WarBattle,input:PersonalRecoveryInput):WarBattle{
 if(battle.phase!=='finished'||battle.pendingPersonalDamage)
  throw new Error('A recuperação de longo prazo exige combate encerrado.');
 const hero=battle.heroes.find(h=>h.id===input.heroId);
 if(!hero)throw new Error('Personagem não encontrado.');
 const result=rollPersonalRecovery(hero,battle.seed,input);
 const event:WarEvent={
  seq:battle.events.length+1,round:battle.round,side:hero.side,
  kind:'hero-recovery',text:hero.name+' realizou recuperação '+
   input.interval+' / '+input.activity+' ('+
   (input.healer?'tratamento de curandeiro':'teste de Vigor')+
   '): '+result.total+' vs '+result.difficulty+
   ', '+result.degrees+' grau(s). Ferimentos '+(result.hero.wounds??0)+
   ', lesões '+(result.hero.injuries??0)+'.',
  roll:result.roll,total:result.total,difficulty:result.difficulty,
  degrees:result.degrees,
 };
 return {...battle,seed:result.seed,
  heroes:battle.heroes.map(h=>h.id===hero.id?result.hero:h),
  events:[...battle.events,event]};
}
export function restoreOrdinaryDamageAfterBattle(battle:WarBattle):WarBattle{
 if(battle.phase!=='finished')
  throw new Error('A Saúde comum só pode ser restaurada no final do combate.');
 return {...battle,heroes:battle.heroes.map(h=>h.active?{...h,health:h.maxHealth}:h),
  events:[...battle.events,{seq:battle.events.length+1,round:battle.round,
   side:null,kind:'hero-normal-damage-restored',
   text:'Dano comum restaurado nos sobreviventes; ferimentos e lesões permanecem.'}]};
}
