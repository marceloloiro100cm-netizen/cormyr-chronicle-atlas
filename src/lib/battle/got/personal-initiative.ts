import {rollDice} from './dice';
import {rollPersonalWithFate,consumePersonalFateRoll} from './personal-fate';
import type {WarBattle,WarPersonalInitiative} from './types';

/** Iniciativa do Cap. 9: Agilidade e dados de bônus Rapidez. Ação intercalada opt-in no laboratório. */
export function beginPersonalInitiative(battle:WarBattle):WarBattle{
 if(battle.phase!=='heroes-first'&&battle.phase!=='heroes-second')
  throw new Error('A iniciativa pessoal só pode começar nas janelas de heróis.');
 if(battle.personalInitiative?.phase===battle.phase)
  throw new Error('A iniciativa desta janela já foi definida.');
 const heroes=battle.heroes.filter(h=>h.active&&!h.unitId&&!h.surrendered&&h.role==='hero');
 if(!heroes.length)throw new Error('Não há personagens disponíveis para iniciativa.');
 let seed=battle.seed;
 const entries=heroes.map(h=>{
  const roll=rollPersonalWithFate(seed,h,h.agility??3,h.quicknessBonusDice??0,h.injuries??0);
  seed=roll.nextSeed;
  return {heroId:h.id,name:h.name,total:Math.max(0,roll.total-(h.wounds??0)),
   quickness:h.quicknessBonusDice??0,roll:roll.dice,rank:h.agility??3};
 });
 entries.sort((a,b)=>b.total-a.total||b.quickness-a.quickness||a.heroId.localeCompare(b.heroId));
 // Empates após Rapidez são decididos por novo teste de Agilidade só entre empatados.
 for(let i=0;i<entries.length;){
  let end=i+1;
  while(end<entries.length&&entries[i]!.total===entries[end]!.total&&
   entries[i]!.quickness===entries[end]!.quickness)end++;
  if(end-i>1){
   const contenders=entries.slice(i,end).map(item=>{
    const reroll=rollDice(seed,item.rank);
    seed=reroll.nextSeed;
    return {...item,tieBreak:reroll.total};
   });
   contenders.sort((a,b)=>b.tieBreak-a.tieBreak||a.heroId.localeCompare(b.heroId));
   entries.splice(i,end-i,...contenders);
  }
  i=end;
 }
 const order=entries.map(e=>e.heroId);
 const pending:WarPersonalInitiative={phase:battle.phase,roundIndex:0,order,cursor:0};
 const state={...battle,seed,
  heroes:battle.heroes.map(h=>heroes.some(x=>x.id===h.id)?consumePersonalFateRoll(h):h),
  personalInitiative:seekNextActor(battle,pending)};
 return {...state,events:[...state.events,...entries.map(e=>({
  seq:state.events.length+entries.indexOf(e)+1,round:state.round,
  side:heroes.find(h=>h.id===e.heroId)!.side,kind:'personal-initiative',
  text:e.name+' obteve '+e.total+' na iniciativa pessoal.',
  roll:e.roll,total:e.total,difficulty:0,
 }))]};
}
function seekNextActor(battle:WarBattle,initiative:WarPersonalInitiative):WarPersonalInitiative{
 let round=initiative.roundIndex,offset=initiative.cursor;
 while(round<5){
  while(offset<initiative.order.length){
   const hero=battle.heroes.find(h=>h.id===initiative.order[offset]);
   if(hero?.active&&!hero.unitId&&!hero.surrendered&&hero.role==='hero'&&
    hero.usedActions<=round)return {...initiative,roundIndex:round,cursor:offset};
   offset++;
  }
  round++;offset=0;
 }
 return {...initiative,roundIndex:5,cursor:initiative.order.length};
}
export function personalTurnHeroId(battle:WarBattle):string|null{
 const plan=battle.personalInitiative;
 if(!plan||plan.phase!==battle.phase||plan.roundIndex>=5)return null;
 return plan.order[plan.cursor]??null;
}
export function assertPersonalTurn(battle:WarBattle,heroId:string):void{
 const plan=battle.personalInitiative;
 if(!plan||plan.phase!==battle.phase)return;
 if(personalTurnHeroId(battle)!==heroId)
  throw new Error('Aguarde a vez deste personagem na iniciativa pessoal.');
}
/** Após uma ação maior ou segunda menor, avança o ator e, então, a rodada pessoal. */
export function settlePersonalTurn(before:WarBattle,after:WarBattle,heroId:string):WarBattle{
 const plan=before.personalInitiative;
 if(!plan||plan.phase!==before.phase)return after;
 const previous=before.heroes.find(h=>h.id===heroId);
 const current=after.heroes.find(h=>h.id===heroId);
 if(!previous||!current)return after;
 const finished=!current.active||current.surrendered||current.unitId||
  current.usedActions>previous.usedActions;
 if(!finished)return after; // A primeira ação menor não encerra o turno.
 const next=seekNextActor(after,{...plan,cursor:plan.cursor+1});
 return {...after,personalInitiative:next};
}
