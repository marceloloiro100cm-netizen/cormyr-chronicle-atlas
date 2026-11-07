import {criticalFailure,degreesOfSuccess,rollDice,seedFromText} from './dice';
import type {WarBattle,WarCommander,WarCondition,WarEvent,WarOrder,WarOrderResult,WarPosition,WarSide,WarUnit} from './types';

const SIDES:readonly WarSide[]=['attacker','defender'];
const opposite=(side:WarSide):WarSide=>side==='attacker'?'defender':'attacker';
const inBounds=(battle:Pick<WarBattle,'width'|'height'>,p:WarPosition):boolean=>
 Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<battle.width&&p.y<battle.height;
const distance=(a:WarPosition,b:WarPosition):number=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const alive=(unit:WarUnit):boolean=>unit.condition==='organized'||unit.condition==='disorganized';
const onBoard=(unit:WarUnit):boolean=>!['destroyed','surrendered','escaped'].includes(unit.condition);
const log=(battle:WarBattle,kind:string,text:string,side:WarSide|null,details:Partial<WarEvent>={}):WarBattle=>({
 ...battle,events:[...battle.events,{seq:battle.events.length+1,round:battle.round,side,kind,text,...details}],
});
const replaceUnit=(battle:WarBattle,unit:WarUnit):WarBattle=>({
 ...battle,units:battle.units.map(row=>row.id===unit.id?unit:row),
});
function commandBudget(commanders:readonly WarCommander[],side:WarSide):Record<string,number>{
 return Object.fromEntries(commanders.filter(c=>c.side===side&&c.active).map(c=>[c.id,c.role==='commander'?c.warfare:1]));
}
const remaining=(battle:WarBattle,side:WarSide):number=>battle.commanders.filter(c=>c.side===side)
 .reduce((sum,c)=>sum+(battle.ordersRemaining[c.id]??0),0);
const turnAfter=(battle:WarBattle,acted:WarSide):WarSide=>{
 const other=opposite(acted);
 if(remaining(battle,other)>0)return other;
 if(remaining(battle,acted)>0)return acted;
 return battle.first;
};
function checkVictory(battle:WarBattle):WarBattle{
 const capable=(side:WarSide)=>battle.units.some(u=>u.side===side&&alive(u));
 const a=capable('attacker'),d=capable('defender');
 if(a&&d)return battle;
 return log({...battle,phase:'finished',winner:a?'attacker':d?'defender':null},'result',
  a?'Vitória do atacante.':d?'Vitória do defensor.':'Ambas as forças perderam a capacidade de combater.',null);
}
function sideInitiative(battle:WarBattle):WarBattle{
 const scores:Partial<Record<WarSide,{total:number;warfare:number;strategy:number}>>={};
 let next=battle;
 for(const side of SIDES){
  const leader=next.commanders.find(c=>c.side===side&&c.role==='commander'&&c.active);
  if(!leader){scores[side]={total:0,warfare:0,strategy:0};continue;}
  const roll=rollDice(next.seed,leader.warfare,leader.strategy);
  next={...next,seed:roll.nextSeed};
  scores[side]={total:roll.total,warfare:leader.warfare,strategy:leader.strategy};
  next=log(next,'initiative',leader.name+' testou Guerra para iniciativa: '+roll.total+'.',side,{
   roll:roll.dice,total:roll.total,difficulty:0,
  });
 }
 const a=scores.attacker!,d=scores.defender!;
 const first=a.total!==d.total?(a.total>d.total?'attacker':'defender'):
  a.warfare!==d.warfare?(a.warfare>d.warfare?'attacker':'defender'):
  a.strategy!==d.strategy?(a.strategy>d.strategy?'attacker':'defender'):'defender';
 return {...next,first,turn:first};
}
export function createWarBattle(input:{
 id:string;name:string;seed:string;width:number;height:number;
 commanders:readonly WarCommander[];units:readonly WarUnit[];
}):WarBattle{
 if(!input.id.trim()||!input.name.trim()||input.seed.length<1)throw new Error('Identificação do combate inválida.');
 if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<5||input.height<5||
 input.width>60||input.height>60)throw new Error('Dimensão do mapa inválida.');
 const ids=[...input.units.map(u=>u.id),...input.commanders.map(c=>c.id)];
 if(new Set(ids).size!==ids.length||input.units.length<2)throw new Error('Identificadores ou unidades inválidos.');
 const occupied=new Set<string>();
 for(const u of input.units){
  if(!inBounds(input,u.position))throw new Error('Unidade fora do mapa: '+u.name);
  const key=u.position.x+':'+u.position.y;
  if(occupied.has(key))throw new Error('Duas unidades ocupam o mesmo quadrado.');
  occupied.add(key);
  if(u.maxHealth!==u.ability.endurance*3||u.health<0||u.health>u.maxHealth||u.armor<0||
   u.discipline<0||u.defense<0)throw new Error('Atributos inconsistentes com o livro: '+u.name);
 }
 for(const side of SIDES){
  const leaders=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='commander');
  const sub=input.commanders.filter(c=>c.side===side&&c.active&&c.role==='subcommander');
  if(leaders.length!==1||!Number.isInteger(leaders[0]!.warfare)||leaders[0]!.warfare<1||
   leaders[0]!.warfare>12||sub.length>Math.floor(input.units.filter(u=>u.side===side).length/2))
   throw new Error('Exige comandante válido e no máximo um subcomandante para cada duas unidades.');
  if(input.units.filter(u=>u.side===side).length<1)throw new Error('Cada lado precisa de unidades.');
 }
 const commanders=input.commanders.map(c=>({...c}));
 const units=input.units.map(u=>({...u,position:{...u.position},ability:{...u.ability},
  standing:u.standing?{...u.standing}:null,issuedThisRound:0,actedThisRound:false,criticalThisRound:false}));
 const initial:WarBattle={id:input.id,name:input.name,seed:seedFromText(input.seed),schemaVersion:1,
  rulesVersion:'GOT-CH10-1',width:input.width,height:input.height,metresPerCell:10,
  round:1,phase:'orders',first:'defender',turn:'defender',units,commanders,
  ordersRemaining:{...commandBudget(commanders,'attacker'),...commandBudget(commanders,'defender')},
  events:[],winner:null};
 return sideInitiative(initial);
}
function movePath(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,maxCells:number):WarPosition[]{
 if(!inBounds(battle,to))throw new Error('Destino fora do campo de batalha.');
 if(unit.position.x===to.x&&unit.position.y===to.y)return [];
 const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u))
   .map(u=>u.position.x+':'+u.position.y));
 const directX=to.x-unit.position.x,directY=to.y-unit.position.y;
 if(sprint&&(directX!==0&&directY!==0))throw new Error('Corrida exige deslocamento em linha reta.');
 const key=(p:WarPosition)=>p.x+':'+p.y;
 const queue:[WarPosition,WarPosition[]][]=[[unit.position,[]]];
 const seen=new Set([key(unit.position)]);
 for(let i=0;i<queue.length;i++){
  const [pos,path]=queue[i]!;
  if(path.length>=maxCells)continue;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const step={x:pos.x+dx,y:pos.y+dy},id=key(step);
   if(!inBounds(battle,step)||seen.has(id)||occupied.has(id))continue;
   if(sprint&&(directX!==0&&step.y!==unit.position.y||directY!==0&&step.x!==unit.position.x))continue;
   const candidate=[...path,step];
   if(step.x===to.x&&step.y===to.y)return candidate;
   seen.add(id);queue.push([step,candidate]);
  }
 }
 throw new Error('Destino inacessível no limite de movimento ou ocupado.');
}
function movementCells(unit:WarUnit,sprint:boolean):number{
 const base=Math.max(0,(unit.naval?60:unit.mounted?80:40)-unit.bulk*10);
 return Math.floor((sprint?base*4:base)/10);
}
function move(battle:WarBattle,unit:WarUnit,to:WarPosition,sprint:boolean,limit?:number):WarBattle{
 const max=limit??movementCells(unit,sprint);
 const path=movePath(battle,unit,to,sprint,max);
 const next=replaceUnit(battle,{...unit,position:path.at(-1)??unit.position});
 return log(next,'move',unit.name+' moveu '+path.length*10+' m'+(sprint?' em corrida':'')+'.',unit.side);
}
function applyDamage(battle:WarBattle,target:WarUnit,amount:number,attackerName:string):WarBattle{
 if(amount<=0)return log(battle,'armor',target.name+' absorveu todo o dano.',target.side);
 let updated:WarUnit;
 if(target.condition==='routed'||amount>target.maxHealth*2){
  updated={...target,health:0,condition:'destroyed',standing:null};
 }else if(target.condition==='disorganized'){
  updated={...target,health:0,condition:'routed',standing:{kind:'retreat'}};
 }else{
  const health=target.health-amount;
  if(health>0){updated={...target,health};}
  else{
   const disorganizations=target.disorganizations+1;
   updated={...target,health:0,disorganizations,
    condition:disorganizations>=target.ability.endurance?'destroyed':'disorganized',
    standing:disorganizations>=target.ability.endurance?null:target.standing};
  }
 }
 const text=attackerName+' causou '+amount+' de dano em '+target.name+'. Condição: '+updated.condition+'.';
 return log(replaceUnit(battle,updated),'damage',text,target.side);
}
function chooseNearest(battle:WarBattle,unit:WarUnit,ranged:boolean):WarUnit|null{
 const max=ranged?(unit.range==='long'?20:unit.range==='short'?2:0):1;
 return battle.units.filter(u=>u.side!==unit.side&&onBoard(u)&&distance(u.position,unit.position)<=max)
   .sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position)||a.id.localeCompare(b.id))[0]??null;
}
function attack(battle:WarBattle,attacker:WarUnit,target:WarUnit,ranged:boolean,
 options:{charge?:boolean;penalty?:number}={}):WarBattle{
 if(!alive(attacker))throw new Error('Esta unidade não pode atacar.');
 if(!onBoard(target)||target.side===attacker.side)throw new Error('Alvo indisponível.');
 const max=ranged?(attacker.range==='long'?20:attacker.range==='short'?2:0):1;
 if(!max||distance(attacker.position,target.position)>max||(!ranged&&distance(attacker.position,target.position)===0))
  throw new Error('O alvo não está no alcance.');
 const score=ranged?attacker.ability.marksmanship:attacker.ability.fighting;
 const extraPenalty=(attacker.condition==='disorganized'?1:0)+(options.penalty??0)+(options.charge?1:0);
 const roll=rollDice(battle.seed,score,0,extraPenalty);
 let next:{seed:number}&WarBattle={...battle,seed:roll.nextSeed};
 const defense=target.defendRoll??target.defense;
 const degrees=degreesOfSuccess(roll.total,defense);
 const baseDamage=ranged?attacker.rangedDamage:attacker.meleeDamage+(options.charge?2:0);
 const raw=baseDamage*degrees;
 const damage=Math.max(0,raw-target.armor);
 next=log(next,'attack',attacker.name+' atacou '+target.name+' ('+(ranged?'Pontaria':'Luta')+
  '); teste '+roll.total+' vs Defesa '+defense+', '+degrees+' grau(s).',attacker.side,{
   roll:roll.dice,total:roll.total,difficulty:defense,degrees,
  });
 return degrees?applyDamage(next,target,damage,attacker.name):next;
}
function retreatStep(battle:WarBattle,unit:WarUnit,steps:number,rout:boolean):WarBattle{
 const foes=battle.units.filter(u=>u.side!==unit.side&&onBoard(u));
 if(!foes.length)return battle;
 const nearest=foes.sort((a,b)=>distance(a.position,unit.position)-distance(b.position,unit.position))[0]!;
 const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 let pos={...unit.position},escaped=false;
 for(let i=0;i<steps;i++){
  const occupied=new Set(battle.units.filter(u=>u.id!==unit.id&&onBoard(u)).map(u=>u.position.x+':'+u.position.y));
  const candidates=dirs.map(([dx,dy])=>({x:pos.x+dx!,y:pos.y+dy!}))
   .filter(p=>!occupied.has(p.x+':'+p.y)&&distance(p,nearest.position)>distance(pos,nearest.position))
   .sort((a,b)=>distance(b,nearest.position)-distance(a,nearest.position));
  const outside=candidates.find(p=>!inBounds(battle,p));
  if(outside){escaped=true;break;}
  const allowed=candidates.filter(p=>inBounds(battle,p));
  if(!allowed.length)break;
  pos=allowed[0]!;
 }
 const updated={...unit,position:pos,condition:escaped?'escaped' as WarCondition:unit.condition,
  standing:escaped?null:unit.standing};
 return log(replaceUnit(battle,updated),rout?'rout':'retreat',
  unit.name+(escaped?' saiu do campo.':' retirou-se até '+pos.x+','+pos.y+'.'),unit.side);
}
function perform(battle:WarBattle,unit:WarUnit,order:WarOrder,degrees:number):WarBattle{
 if(order.kind==='move'){
  if(!order.to)throw new Error('Movimentação exige destino.');
  return move(battle,unit,order.to,Boolean(order.sprint));
 }
 if(order.kind==='attack'){
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo válido.');
  return attack(battle,unit,target,Boolean(order.ranged));
 }
 if(order.kind==='charge'){
  if(order.ranged)throw new Error('Carga exige Luta.');
  const target=battle.units.find(u=>u.id===order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo de carga inválido.');
  let next=battle,actor=unit;
  if(distance(actor.position,target.position)>1){
   const choices=[{x:target.position.x-1,y:target.position.y},
    {x:target.position.x+1,y:target.position.y},
    {x:target.position.x,y:target.position.y-1},{x:target.position.x,y:target.position.y+1}];
   let destination:WarPosition|null=null;
   for(const candidate of choices){
    try{movePath(battle,actor,candidate,true,movementCells(actor,true));destination=candidate;break;}catch{ /* outra posição */ }
   }
   if(!destination)throw new Error('Carga sem corredor em linha reta.');
   next=move(next,actor,destination,true);
   actor=next.units.find(u=>u.id===unit.id)!;
  }
  return attack(next,actor,target,false,{charge:true});
 }
 if(order.kind==='defend'){
  const roll=rollDice(battle.seed,unit.ability.agility,0,unit.condition==='disorganized'?1:0);
  return log(replaceUnit({...battle,seed:roll.nextSeed},{...unit,defendRoll:roll.total}),
   'defend',unit.name+' assumiu Defesa '+roll.total+' até o fim da rodada.',unit.side,{
    roll:roll.dice,total:roll.total,
   });
 }
 if(order.kind==='rally'){
  const health=Math.min(unit.maxHealth,unit.health+degrees);
  if(unit.condition!=='organized')throw new Error('Reagrupar não substitui Reorganizar/Reanimar.');
  return log(replaceUnit(battle,{...unit,health}), 'rally',unit.name+' recuperou '+(health-unit.health)+' de Saúde.',unit.side);
 }
 if(order.kind==='revive'){
  if(unit.condition!=='routed')throw new Error('Reanimar exige debandada.');
  return log(replaceUnit(battle,{...unit,condition:'disorganized',health:0,standing:null}),
   'revive',unit.name+' deixou de debandar; ainda precisa ser reorganizada.',unit.side);
 }
 if(order.kind==='reorganize'){
  if(unit.condition!=='disorganized')throw new Error('Reorganizar exige desorganização.');
  return log(replaceUnit(battle,{...unit,condition:'organized',health:unit.maxHealth,standing:null}),
   'reorganize',unit.name+' foi reorganizada, mantendo as penalidades de Disciplina.',unit.side);
 }
 if(order.kind==='retreat'){
  return retreatStep(battle,unit,movementCells(unit,false),false);
 }
 if(order.kind==='aggressive-retreat'){
  const target=battle.units.find(u=>u.id===order.targetId)??chooseNearest(battle,unit,Boolean(order.ranged));
  if(!target)throw new Error('Selecione um alvo de retirada agressiva.');
  const next=attack(battle,unit,target,Boolean(order.ranged),{penalty:1});
  const self=next.units.find(u=>u.id===unit.id)!;
  return retreatStep(next,self,Math.floor(movementCells(self,false)/2),false);
 }
 if(order.kind==='ready')return log(battle,'ready',unit.name+' ficou em prontidão.',unit.side);
 throw new Error('Ordem não suportada.');
}
export function issueWarOrder(battle:WarBattle,input:{
 commanderId:string;unitId:string;order:WarOrder;
}):WarOrderResult{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 const commander=battle.commanders.find(c=>c.id===input.commanderId&&c.active);
 if(!commander||commander.side!==battle.turn||(battle.ordersRemaining[commander.id]??0)<1)
  throw new Error('Não é a vez deste comandante, ou suas ordens terminaram.');
 const unit=battle.units.find(u=>u.id===input.unitId);
 if(!unit||unit.side!==commander.side||!onBoard(unit))throw new Error('Unidade fora do comando.');
 if(!alive(unit)&&input.order.kind!=='revive')throw new Error('Uma tropa em debandada só pode ser reanimada.');
 if(input.order.kind==='revive'&&unit.condition!=='routed')throw new Error('Esta unidade não está em debandada.');
 // Rejeitar instruções incompletas ANTES de consumir o orçamento e os dados.
 if(input.order.kind==='move'&&!input.order.to)throw new Error('Indique o quadrado de destino.');
 if(['attack','charge','aggressive-retreat'].includes(input.order.kind)&&input.order.targetId){
  const target=battle.units.find(u=>u.id===input.order.targetId);
  if(!target||target.side===unit.side||!onBoard(target))throw new Error('Alvo inimigo indisponível.');
 }
 const difficulty=unit.discipline+unit.disorganizations*3+
  unit.issuedThisRound*3;
 const roll=rollDice(battle.seed,commander.warfare,0,0);
 const passed=roll.total>=difficulty;
 const critical=criticalFailure(roll.total,difficulty);
 const degrees=degreesOfSuccess(roll.total,difficulty);
 let next:WarBattle={...battle,seed:roll.nextSeed,
  ordersRemaining:{...battle.ordersRemaining,[commander.id]:battle.ordersRemaining[commander.id]!-1}};
 next=replaceUnit(next,{...unit,issuedThisRound:unit.issuedThisRound+1,actedThisRound:passed,
  criticalThisRound:critical});
 next=log(next,'command',commander.name+' deu ordem '+input.order.kind+' a '+unit.name+
  ': '+roll.total+' vs Disciplina '+difficulty+(passed?' (sucesso).':critical?' (falha crítica).':' (falha).'),
  unit.side,{roll:roll.dice,total:roll.total,difficulty,degrees});
 if(passed){
  const updated=next.units.find(u=>u.id===unit.id)!;
  const issued={...updated,standing:{...input.order},activated:true};
  next=replaceUnit(next,issued);
  // Instruções que não geram ação recorrente encerram a sua execução neste momento.
  try{next=perform(next,issued,input.order,degrees);}
  catch(e){throw e;}
  const latest=next.units.find(u=>u.id===unit.id)!;
  const continuous=(['attack','charge','defend','retreat','aggressive-retreat','ready'].includes(input.order.kind));
  next=replaceUnit(next,{...latest,standing:continuous&&onBoard(latest)?input.order:null});
 }
 next={...next,turn:turnAfter(next,commander.side)};
 next=checkVictory(next);
 return {battle:next,passed,critical,test:roll.total,difficulty,degrees};
}
export function advanceWarRound(battle:WarBattle):WarBattle{
 if(battle.phase!=='orders')throw new Error('Batalha encerrada.');
 let next=battle;
 // Passo 9: ordens permanentes somente para unidades não comandadas durante a rodada.
 for(const side of [battle.first,opposite(battle.first)]){
  for(const base of next.units.filter(u=>u.side===side&&u.activated&&u.standing&&
   u.issuedThisRound===0&&!u.criticalThisRound&&alive(u))){
   const order=base.standing!;
   try{
    if(['attack','charge','aggressive-retreat'].includes(order.kind)){
     const ranged=Boolean(order.ranged);
     const target=chooseNearest(next,base,ranged);
     if(target)next=attack(next,base,target,ranged);
    }else if(order.kind==='defend')next=perform(next,base,{kind:'defend'},1);
    else if(order.kind==='retreat')next=retreatStep(next,base,movementCells(base,false),false);
   }catch{
    next=log(next,'standing-skip',base.name+' não pôde executar a ordem contínua.',base.side);
   }
  }
 }
 // Uma tropa debandada corre em retirada independentemente das ordens da rodada.
 for(const unit of next.units.filter(u=>u.condition==='routed')){
  next=retreatStep(next,unit,movementCells(unit,true),true);
 }
 next=checkVictory(next);
 if(next.phase==='finished')return next;
 next={...next,round:next.round+1,
  units:next.units.map(u=>({...u,issuedThisRound:0,actedThisRound:false,
   criticalThisRound:false,defendRoll:null})),
  ordersRemaining:{
   ...commandBudget(next.commanders,'attacker'),
   ...commandBudget(next.commanders,'defender'),
  },
 };
 return sideInitiative(next);
}
export function warUnitSummary(unit:WarUnit):{
 position:string;health:string;discipline:number;condition:WarCondition;
}{
 return {position:unit.position.x+','+unit.position.y,
  health:unit.health+'/'+unit.maxHealth,discipline:unit.discipline+unit.disorganizations*3,
  condition:unit.condition};
}
