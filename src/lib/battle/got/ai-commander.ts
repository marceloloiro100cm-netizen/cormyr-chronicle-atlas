import {attackableWarTargets,reachableWarCells,warCommandOdds} from './command-preview';
import {advanceWarRound,issueWarOrder} from './engine';
import {fortForUnit} from './fortifications';
import {terrainAt,terrainEffect} from './terrain';
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
 // Distância de marcha até o inimigo contornando rios, muralhas e lagos:
 // sem isto a tropa pararia diante do obstáculo em vez de buscar o portão ou a ponte.
 const march=new Map<string,number>();
 const queue:WarPosition[]=[];
 for(const foe of foes){march.set(foe.position.x+':'+foe.position.y,0);queue.push(foe.position);}
 for(let i=0;i<queue.length;i++){
  const at=queue[i]!,d=march.get(at.x+':'+at.y)!;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const x=at.x+dx,y=at.y+dy,k=x+':'+y;
   if((!dx&&!dy)||x<0||y<0||x>=battle.width||y>=battle.height||march.has(k))continue;
   if(terrainEffect(terrainAt(battle.tiles,{x,y})).blocked)continue;
   march.set(k,d+1);queue.push({x,y});
  }
 }
 const marchGap=(p:WarPosition)=>march.get(p.x+':'+p.y)??nearestGap(p)+battle.width;
 const candidates:Candidate[]=[];
 // Postura de guarnição: quem defende uma construção não abandona a posição.
 const forts=battle.fortifications.filter(f=>f.side===side&&!f.breached&&f.structuralHealth!==0);
 // Com o inimigo quase desfeito (três contra um), a guarnição sai para encerrar a batalha.
 const sortie=foes.filter(fighting).length*3<=battle.units.filter(u=>u.side===side&&fighting(u)).length;
 const holdsFort=forts.length>0&&side==='defender'&&!sortie;
 const fortCells=forts.flatMap(f=>f.cells);
 const taken=new Set(battle.units.filter(fieldable).map(u=>u.position.x+':'+u.position.y));
 for(const unit of battle.units.filter(u=>u.side===side&&fieldable(u))){
  const options:Candidate[]=[];
  const garrisoned=Boolean(fortForUnit(battle.fortifications,unit));
  const highGround=terrainEffect(terrainAt(battle.tiles,unit.position)).highGroundBonusDice>0;
  /** Atiradores em construção ou terreno alto ficam; a guarnição do defensor também. */
  const holds=!sortie&&((garrisoned&&(unit.range!=='none'||side==='defender'))||
   (unit.range!=='none'&&highGround&&side==='defender'));
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
   if(!holds&&!melee.length&&!unit.naval&&unit.condition==='organized'&&unit.range==='none'){
    for(const t of attackableWarTargets(battle,unit.id,'charge'))
     options.push({unit,order:{kind:'charge',targetId:t.unitId},
      score:66-gap(unit.position,t.position),note:'carrega contra a linha inimiga'});
   }
   if(holds){
    // Sem alvo ao alcance, a guarnição se protege atrás das muralhas.
    options.push({unit,order:{kind:'defend'},score:unit.defendRoll===null?64:34,
     note:garrisoned?'mantém a guarnição atrás das muralhas':'mantém a posição no terreno alto'});
   }else if(holdsFort&&!melee.length&&fighting(unit)&&nearestGap(unit.position)>3){
    // Tropa do defensor fora da construção: ocupa uma vaga livre ou aguarda perto dela.
    let refuge:{x:number;y:number;value:number}|null=null;
    for(const cell of reachableWarCells(battle,unit.id)){
     if(!fortCells.some(c=>c.x===cell.x&&c.y===cell.y)||taken.has(cell.x+':'+cell.y))continue;
     if(!refuge||cell.costMetres<refuge.value)refuge={x:cell.x,y:cell.y,value:cell.costMetres};
    }
    if(refuge&&unit.typeId!=='cavalry')options.push({unit,order:{kind:'move',to:{x:refuge.x,y:refuge.y}},
     score:60,note:'recolhe a tropa para dentro da fortificação'});
    else options.push({unit,order:{kind:'defend'},score:unit.defendRoll===null?44:20,
     note:'aguarda o inimigo junto à fortificação'});
   }else if(!melee.length&&fighting(unit)){
    const here=marchGap(unit.position);
    const wanted=unit.range==='long'?5:unit.range==='short'?2:1;
    if(here>wanted){
     let best:{x:number;y:number;value:number}|null=null;
     for(const cell of reachableWarCells(battle,unit.id)){
      const d=marchGap(cell);
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
   if(!holds)options.push({unit,order:{kind:'defend'},score:threatened?30:8,note:'mantém posição defensiva'});
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

export type WarAutoResolution=Readonly<{
 battle:WarBattle;
 /** Falso quando a batalha parou antes do fim (heróis, cerco ou limite de rodadas). */
 finished:boolean;orders:number;
}>;
/** Resolve a batalha inteira de uma vez: os dois lados são comandados pelo
 * oponente automático, ordem a ordem, pelas mesmas regras e dados auditáveis
 * de uma batalha jogada à mão. Só atua na fase de ordens.
 */
export function autoResolveWarBattle(battle:WarBattle,maxRounds=30):WarAutoResolution{
 let state=battle,orders=0,guard=0;
 const lastRound=battle.round+Math.max(1,Math.min(200,Math.trunc(maxRounds)));
 while(state.phase==='orders'&&!state.pendingPersonalDamage&&state.round<lastRound&&guard++<6000){
  const decision=chooseWarAiOrder(state,state.turn);
  if(!decision){state=advanceWarRound(state);continue;}
  state=issueWarOrder(state,decision).battle;
  orders++;
  if(state.phase==='orders'&&Object.values(state.ordersRemaining).every(left=>left<1))
   state=advanceWarRound(state);
 }
 return {battle:state,finished:state.phase==='finished',orders};
}
