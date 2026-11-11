import {attackableWarTargets,reachableWarCells,warCommandOdds} from './command-preview';
import type {WarBattle,WarCommander,WarOrder,WarPosition,WarSide,WarUnit} from './types';

/** Oponente automático para simulações solo. Decide UMA ordem por vez,
 * sempre legal e determinística (sem dados nem aleatoriedade própria):
 * a resolução continua sendo feita por `issueWarOrder`, com as mesmas regras
 * do livro aplicadas a qualquer comandante humano.
 */
export type WarAiDecision=Readonly<{
 commanderId:string;unitId:string;order:WarOrder;
 /** Frase curta para o registro: por que o comandante escolheu isto. */
 note:string;
}>;
const fieldable=(u:WarUnit):boolean=>!['destroyed','surrendered','escaped'].includes(u.condition);
const fighting=(u:WarUnit):boolean=>u.condition==='organized'||u.condition==='disorganized';
const gap=(a:WarPosition,b:WarPosition):number=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function activeCommander(battle:WarBattle,side:WarSide):WarCommander|null{
 const ready=battle.commanders.filter(c=>c.side===side&&c.active&&
  (battle.ordersRemaining[c.id]??0)>0&&
  !battle.heroes.some(h=>h.active&&h.commanderId===c.id&&h.unitId));
 return ready.find(c=>c.role==='commander')??ready[0]??null;
}
type Candidate={unit:WarUnit;order:WarOrder;score:number;note:string};
export function chooseWarAiOrder(battle:WarBattle,side:WarSide):WarAiDecision|null{
 if(battle.phase!=='orders'||battle.turn!==side||battle.pendingPersonalDamage)return null;
 const commander=activeCommander(battle,side);
 if(!commander)return null;
 const foes=battle.units.filter(u=>u.side!==side&&fieldable(u));
 if(!foes.length)return null;
 const nearestGap=(p:WarPosition)=>Math.min(...foes.map(f=>gap(p,f.position)));
 const candidates:Candidate[]=[];
 for(const unit of battle.units.filter(u=>u.side===side&&fieldable(u))){
  const options:Candidate[]=[];
  if(unit.condition==='routed'){
   options.push({unit,order:{kind:'revive'},score:50,note:'tenta conter a debandada'});
  }else{
   const threatened=nearestGap(unit.position)<=1;
   if(unit.condition==='disorganized')
    options.push({unit,order:{kind:'reorganize'},score:threatened?58:72,
     note:'reorganiza as fileiras antes que debandem'});
   const melee=attackableWarTargets(battle,unit.id,'melee');
   for(const t of melee)options.push({unit,order:{kind:'attack',targetId:t.unitId},
    score:80+(t.expectedDamage??0)*6+(t.odds?.success??0)*10,note:'ataca o inimigo engajado'});
   if(unit.range!=='none'&&!threatened){
    for(const t of attackableWarTargets(battle,unit.id,'ranged'))
     options.push({unit,order:{kind:'attack',targetId:t.unitId,ranged:true},
      score:70+(t.expectedDamage??0)*6+(t.odds?.success??0)*10,note:'dispara à distância'});
   }
   if(!melee.length&&!unit.naval&&unit.condition==='organized'&&unit.range==='none'){
    for(const t of attackableWarTargets(battle,unit.id,'charge'))
     options.push({unit,order:{kind:'charge',targetId:t.unitId},
      score:66-gap(unit.position,t.position),note:'carrega contra a linha inimiga'});
   }
   if(!melee.length&&fighting(unit)){
    const here=nearestGap(unit.position);
    const wanted=unit.range==='long'?5:unit.range==='short'?2:1;
    if(here>wanted){
     let best:{x:number;y:number;value:number}|null=null;
     for(const cell of reachableWarCells(battle,unit.id)){
      const d=nearestGap(cell);
      // Atiradores param na distância de tiro; os demais buscam o contato.
      const value=Math.abs(d-wanted)*10+cell.costMetres/100;
      if(d<here&&(!best||value<best.value))best={x:cell.x,y:cell.y,value};
     }
     if(best)options.push({unit,order:{kind:'move',to:{x:best.x,y:best.y}},
      score:42-best.value/10,note:'avança em direção ao inimigo'});
    }
   }
   if(unit.condition==='organized'&&unit.health*2<=unit.maxHealth&&!threatened)
    options.push({unit,order:{kind:'rally'},score:46,note:'reagrupa os feridos'});
   options.push({unit,order:{kind:'defend'},score:threatened?30:8,note:'mantém posição defensiva'});
  }
  for(const option of options){
   let score=option.score;
   // Ordens repetidas custam +3 de Dificuldade: prefira tropas ainda sem ordem.
   score-=unit.issuedThisRound*30;
   // Quem já tem ordem contínua de ataque agirá sozinho no Passo Nove.
   if(unit.activated&&unit.standing?.kind===option.order.kind&&
    ['attack','charge','defend'].includes(option.order.kind)&&unit.issuedThisRound===0)score-=28;
   // Pondera pela chance real de a tropa obedecer.
   score*=0.5+0.5*warCommandOdds(battle,commander,unit,option.order).odds.success;
   candidates.push({...option,score});
  }
 }
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.score-a.score||a.unit.id.localeCompare(b.unit.id));
 const pick=candidates[0]!;
 return {commanderId:commander.id,unitId:pick.unit.id,order:pick.order,
  note:commander.name+' '+pick.note+' ('+pick.unit.name+').'};
}
