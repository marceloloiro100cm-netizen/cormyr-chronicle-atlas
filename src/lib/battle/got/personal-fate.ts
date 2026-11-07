import type {WarBattle} from './types';
import type {WarHero} from './heroes';

/** Destino do capítulo 5: pontos gastos voltam apenas em marcos narrativos.
 * Pontos queimados são consumidos permanentemente. Nada altera a ficha oficial.
 */
export type WarFateAction=Readonly<{
 heroId:string;
 kind:'spend-bonus'|'spend-reduce-penalty'|'burn-clear-damage'|
  'burn-choose-defeat'|'burn-avoid-death';
 outcome?:'unconscious'|'captured'|'death';
}>;
export function fateAvailable(hero:WarHero):number{
 return hero.fateAvailable??0;
}
export function applyWarFate(battle:WarBattle,action:WarFateAction):WarBattle{
 const hero=battle.heroes.find(h=>h.id===action.heroId);
 if(!hero||hero.squadId)throw new Error('Destino é reservado a personagens importantes.');
 if(!Number.isInteger(fateAvailable(hero))||fateAvailable(hero)<1)
  throw new Error('O personagem não possui Pontos de Destino disponíveis.');
 if(battle.pendingPersonalDamage)
  throw new Error('Resolva o dano pendente antes de usar Destino.');
 const burn=action.kind.startsWith('burn-');
 if(action.kind==='burn-choose-defeat'&&(!action.outcome||hero.active))
  throw new Error('Escolha consequência apenas para personagem derrotado.');
 if(action.kind==='burn-avoid-death'&&hero.defeatOutcome!=='death')
  throw new Error('Evitar morte exige consequência fatal.');
 if(action.kind==='burn-clear-damage'&&hero.defeatOutcome==='death')
  throw new Error('Use Evitar morte certa para personagem morto.');
 if(action.kind!=='burn-choose-defeat'&&action.outcome)
  throw new Error('Consequência só pode ser escolhida após derrota.');
 if(!['spend-bonus','spend-reduce-penalty','burn-clear-damage',
  'burn-choose-defeat','burn-avoid-death'].includes(action.kind))
  throw new Error('Efeito de Destino não implementado.');
 const updated:WarHero={...hero,fateAvailable:fateAvailable(hero)-1,
  fateSpent:(hero.fateSpent??0)+(burn?0:1),
  fateBurned:(hero.fateBurned??0)+(burn?1:0),
  ...(action.kind==='spend-bonus'?{fateBonusDice:(hero.fateBonusDice??0)+1}:{}),
  ...(action.kind==='spend-reduce-penalty'?{fatePenaltyReduction:(hero.fatePenaltyReduction??0)+1}:{}),
  ...(action.kind==='burn-clear-damage'?{
   health:hero.maxHealth,wounds:0,active:true,
   defeatOutcome:undefined,
  }:{}),
  ...(action.kind==='burn-choose-defeat'?{
   defeatOutcome:action.outcome,active:false,
  }:{}),
  ...(action.kind==='burn-avoid-death'?{
   defeatOutcome:'escaped',active:false,removedFromStory:true,
  }:{}),
 };
 return {...battle,heroes:battle.heroes.map(h=>h.id===hero.id?updated:h),
  events:[...battle.events,{
   seq:battle.events.length+1,round:battle.round,side:hero.side,
   kind:'hero-fate',text:hero.name+' '+(burn?'queimou':'gastou')+
    ' um Ponto de Destino para '+action.kind+
    (action.outcome?' ('+action.outcome+')':'')+'.',
  }],
 };
}
/** Recarregar pontos apenas por decisão explícita do Narrador após objetivo narrativo. */
export function restoreSpentFate(battle:WarBattle,heroId:string):WarBattle{
 if(battle.phase!=='finished')throw new Error('Recarga narrativa só ocorre após o confronto.');
 const hero=battle.heroes.find(h=>h.id===heroId);
 if(!hero||hero.squadId)throw new Error('Personagem importante não encontrado.');
 const spent=hero.fateSpent??0;
 if(spent===0)return battle;
 return {...battle,heroes:battle.heroes.map(h=>h.id===heroId?{
  ...h,fateAvailable:(h.fateAvailable??0)+spent,fateSpent:0,
 }:h),events:[...battle.events,{
  seq:battle.events.length+1,round:battle.round,side:hero.side,
  kind:'hero-fate-restored',text:hero.name+' recuperou '+spent+
   ' Ponto(s) de Destino gastos por confirmação narrativa local.',
 }]};
}
