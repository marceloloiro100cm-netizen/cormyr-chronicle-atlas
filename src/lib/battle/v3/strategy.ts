import type {Side} from '../domain/types';

/** Tabuleiro estratégico ABSTRATO. Nunca representa posições oficiais de Cormyr. */
export const V3_STRATEGY_RULE_VERSION='V3-STRATEGY-1' as const;
export type V3StrategyNodeId='camp'|'crossroads'|'grove'|'bridge'|'watch'|'market'|'fort';
export type V3StrategyNode=Readonly<{
 id:V3StrategyNodeId;name:string;x:number;y:number;
 kind:'base'|'road'|'forest'|'objective'|'trade';
 supply:boolean;recruit:boolean;
}>;
export const V3_STRATEGY_NODES:readonly V3StrategyNode[]=[
 {id:'camp',name:'Acampamento Real',x:10,y:55,kind:'base',supply:true,recruit:true},
 {id:'crossroads',name:'Estrada do Norte',x:29,y:55,kind:'road',supply:false,recruit:false},
 {id:'grove',name:'Bosque da Coruja',x:41,y:19,kind:'forest',supply:false,recruit:false},
 {id:'bridge',name:'Ponte de Pedra',x:51,y:54,kind:'objective',supply:false,recruit:false},
 {id:'watch',name:'Colina da Vigília',x:66,y:20,kind:'objective',supply:false,recruit:false},
 {id:'market',name:'Vila Mercante',x:70,y:80,kind:'trade',supply:true,recruit:true},
 {id:'fort',name:'Fortim do Ocaso',x:91,y:55,kind:'base',supply:true,recruit:true},
];
export const V3_STRATEGY_ROADS:readonly (readonly [V3StrategyNodeId,V3StrategyNodeId])[]=[
 ['camp','crossroads'],['crossroads','grove'],['crossroads','bridge'],
 ['grove','watch'],['bridge','watch'],['bridge','market'],
 ['watch','fort'],['market','fort'],
];
export const V3_STRATEGY_OBJECTIVES:readonly V3StrategyNodeId[]=['bridge','watch','market'];
const BASES:Readonly<Record<Side,V3StrategyNodeId>>={attacker:'camp',defender:'fort'};
const enemyOf=(side:Side):Side=>side==='attacker'?'defender':'attacker';
const node=(id:V3StrategyNodeId)=>{
 const found=V3_STRATEGY_NODES.find(n=>n.id===id);
 if(!found)throw new Error('Nó de campanha desconhecido.');
 return found;
};
export type V3StrategyOrder=
 | Readonly<{type:'MARCH';to:V3StrategyNodeId}>
 | Readonly<{type:'RECRUIT'|'RESUPPLY'|'WAIT'}>;
export type V3StrategyLog=Readonly<{day:number;side:Side;message:string}>;
export type V3StrategyState=Readonly<{
 rulesVersion:typeof V3_STRATEGY_RULE_VERSION;
 phase:'active'|'completed';day:number;turn:Side;winner:Side|null;
 controls:Readonly<Record<Side,'human'|'ai'>>;
 position:Readonly<Record<Side,V3StrategyNodeId>>;
 owners:Readonly<Partial<Record<V3StrategyNodeId,Side>>>;
 troops:Readonly<Record<Side,number>>;
 supplies:Readonly<Record<Side,number>>;
 log:readonly V3StrategyLog[];
}>;
export function v3StrategyNeighbors(id:V3StrategyNodeId):readonly V3StrategyNodeId[]{
 node(id);
 return V3_STRATEGY_ROADS.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]);
}
export function v3StartStrategy(attackerTroops:number,defenderTroops:number,
 opponent:'ai'|'human'='ai'):V3StrategyState{
 for(const n of [attackerTroops,defenderTroops]){
  if(!Number.isSafeInteger(n)||n<1||n>5000)
   throw new Error('Efetivo inicial da estratégia precisa estar entre 1 e 5000.');
 }
 return {rulesVersion:V3_STRATEGY_RULE_VERSION,phase:'active',day:1,turn:'attacker',winner:null,
  controls:{attacker:'human',defender:opponent},position:{...BASES},
  owners:{camp:'attacker',fort:'defender'},
  troops:{attacker:attackerTroops,defender:defenderTroops},
  supplies:{attacker:Math.min(1200,Math.max(350,attackerTroops*2)),
   defender:Math.min(1200,Math.max(350,defenderTroops*2))},log:[]};
}
export function v3StrategyMarchCost(troops:number):number{
 if(!Number.isSafeInteger(troops)||troops<1)throw new Error('Efetivo inválido.');
 return 20+Math.ceil(troops/200);
}
function finalResult(state:V3StrategyState):V3StrategyState{
 if(state.phase==='completed')return state;
 const attacker=V3_STRATEGY_OBJECTIVES.filter(id=>state.owners[id]==='attacker').length;
 const defender=V3_STRATEGY_OBJECTIVES.filter(id=>state.owners[id]==='defender').length;
 if(attacker===3)return {...state,phase:'completed',winner:'attacker'};
 if(defender===3)return {...state,phase:'completed',winner:'defender'};
 if(state.day>30)return {...state,phase:'completed',winner:attacker===defender?null:
   attacker>defender?'attacker':'defender'};
 return state;
}
function logOrder(state:V3StrategyState,side:Side,message:string):V3StrategyState{
 const after={...state,log:[...state.log,{day:state.day,side,message}].slice(-80),
  turn:enemyOf(side),day:side==='defender'?state.day+1:state.day};
 return side==='defender'?finalResult(after):after;
}
export function v3StrategyOrder(state:V3StrategyState,order:V3StrategyOrder):V3StrategyState{
 if(state.rulesVersion!==V3_STRATEGY_RULE_VERSION||state.phase!=='active')
  throw new Error('Campanha estratégica finalizada ou incompatível.');
 const side=state.turn,enemy=enemyOf(side),current=state.position[side];
 const currentNode=node(current);
 switch(order.type){
  case 'WAIT':return logOrder(state,side,'Aguardou ordens na posição atual.');
  case 'RESUPPLY':{
   if(!currentNode.supply||state.owners[current]!==side)
    throw new Error('Reabastecimento somente em posição própria com depósitos.');
   const total=Math.min(1200,state.supplies[side]+120);
   return logOrder({...state,supplies:{...state.supplies,[side]:total}},side,
    'Reabasteceu '+(total-state.supplies[side])+' suprimentos fictícios.');
  }
  case 'RECRUIT':{
   if(!currentNode.recruit||state.owners[current]!==side)
    throw new Error('Recrutamento somente em base ou vila controlada.');
   if(state.supplies[side]<60)throw new Error('Recrutamento exige 60 suprimentos fictícios.');
   if(state.troops[side]+20>5000)throw new Error('Efetivo de treino atingiu seu teto.');
   return logOrder({...state,
    supplies:{...state.supplies,[side]:state.supplies[side]-60},
    troops:{...state.troops,[side]:state.troops[side]+20}},side,
    'Recrutou 20 combatentes fictícios.');
  }
  case 'MARCH':{
   const destination=node(order.to);
   if(!v3StrategyNeighbors(current).includes(order.to))
    throw new Error('Só é permitido deslocamento por estrada adjacente.');
   if(destination.kind==='base'&&order.to===BASES[enemy])
    throw new Error('A base adversária não pode ser conquistada neste protótipo.');
   const cost=v3StrategyMarchCost(state.troops[side]);
   if(state.supplies[side]<cost)throw new Error('Suprimentos insuficientes para marchar.');
   let next:V3StrategyState={...state,
    supplies:{...state.supplies,[side]:state.supplies[side]-cost}};
   if(state.position[enemy]===order.to){
    // Escaramuça determinística de TREINO. Nunca aplica baixas oficiais.
    const attackingLoss=Math.min(state.troops[side],Math.ceil(state.troops[enemy]/7));
    const defendingLoss=Math.min(state.troops[enemy],Math.ceil(state.troops[side]/6));
    const attackerRemains=state.troops[side]-attackingLoss;
    const defenderRemains=state.troops[enemy]-defendingLoss;
    next={...next,troops:{...state.troops,[side]:Math.max(0,attackerRemains),
     [enemy]:Math.max(0,defenderRemains)}};
    if(attackerRemains<=0||defenderRemains<=0){
     const winner:Side|null=attackerRemains>0?side:defenderRemains>0?enemy:null;
     return logOrder({...next,phase:'completed',winner},side,
      'Hoste eliminada na escaramuça de treino em '+destination.name+'.');
    }
    if(attackerRemains>defenderRemains){
     next={...next,position:{...state.position,[side]:order.to,[enemy]:BASES[enemy]},
      owners:{...state.owners,[order.to]:side}};
     return logOrder(next,side,'Venceu escaramuça de simulação em '+destination.name+
      ' (perdas fictícias: '+attackingLoss+' / '+defendingLoss+').');
    }
    return logOrder(next,side,'Escaramuça sem avanço em '+destination.name+
     ' (perdas fictícias: '+attackingLoss+' / '+defendingLoss+').');
   }
   next={...next,position:{...state.position,[side]:order.to},
    owners:{...state.owners,[order.to]:side}};
   return logOrder(next,side,'Marchou até '+destination.name+' (custo '+cost+').');
  }
 }
}
function distance(from:V3StrategyNodeId,to:V3StrategyNodeId):number{
 const queue:[V3StrategyNodeId,number][]=[[from,0]];
 const seen=new Set<V3StrategyNodeId>([from]);
 while(queue.length){
  const [cur,depth]=queue.shift()!;
  if(cur===to)return depth;
  for(const next of v3StrategyNeighbors(cur)){
   if(!seen.has(next)){seen.add(next);queue.push([next,depth+1]);}
  }
 }
 return 99;
}
export function v3StrategyAiTurn(state:V3StrategyState):V3StrategyState{
 if(state.phase!=='active'||state.turn!=='defender'||state.controls.defender!=='ai')return state;
 const side:'defender'='defender',pos=state.position.defender;
 const current=node(pos);
 if(current.supply&&state.owners[pos]===side&&state.supplies.defender<75)
  return v3StrategyOrder(state,{type:'RESUPPLY'});
 if(current.recruit&&state.owners[pos]===side&&state.troops.defender<125&&state.supplies.defender>=60)
  return v3StrategyOrder(state,{type:'RECRUIT'});
 const possible=v3StrategyNeighbors(pos).filter(n=>n!==BASES.attacker);
 if(state.supplies.defender<v3StrategyMarchCost(state.troops.defender))
  return v3StrategyOrder(state,{type:current.supply&&state.owners[pos]===side?'RESUPPLY':'WAIT'});
 const goals=V3_STRATEGY_OBJECTIVES.filter(n=>state.owners[n]!==side);
 if(!goals.length)return v3StrategyOrder(state,{type:'WAIT'});
 const ranked=possible.map(n=>({
  id:n,
  score:Math.min(...goals.map(goal=>distance(n,goal)))+
   (state.position.attacker===n&&state.troops.defender<=state.troops.attacker?6:0)+
   (state.owners[n]===side?0.3:0),
 })).sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id));
 return ranked.length?v3StrategyOrder(state,{type:'MARCH',to:ranked[0]!.id}):
  v3StrategyOrder(state,{type:'WAIT'});
}
