/** P3: cerco e mapa operacional de treino. Estado inteiro, determinístico,
 * sem relógio, rede, writes de ficha, baixas ou progressão da campanha oficial.
 */
export type SiegeSide='attacker'|'defender';
export type SiegeAction='BLOCKADE'|'BOMBARD'|'UNDERMINE'|'ASSAULT'|'WITHDRAW'|
 'REPAIR'|'FORTIFY_GATE'|'SORTIE'|'RATION';
export type StrategySite=Readonly<{id:string;name:string;x:number;y:number;kind:'city'|'fort'|'road'|'port'}>;
export type StrategyRoad=Readonly<{from:string;to:string;cost:number}>;
export const STRATEGIC_SITES:readonly StrategySite[]=[
 {id:'arabel',name:'Arabel',x:48,y:24,kind:'city'},
 {id:'hillmarch',name:'Hillmarch',x:27,y:56,kind:'fort'},
 {id:'proskur',name:'Proskur',x:19,y:84,kind:'road'},
 {id:'suzail',name:'Suzail',x:76,y:76,kind:'city'},
 {id:'roadwatch',name:'Vigia da Estrada',x:67,y:42,kind:'fort'},
] as const;
export const STRATEGIC_ROADS:readonly StrategyRoad[]=[
 {from:'arabel',to:'hillmarch',cost:2},
 {from:'hillmarch',to:'proskur',cost:1},
 {from:'arabel',to:'roadwatch',cost:1},
 {from:'roadwatch',to:'suzail',cost:2},
 {from:'hillmarch',to:'suzail',cost:3},
] as const;
export type StrategyRoute=Readonly<{sites:readonly string[];cost:number}>;
/** Custos de ligação são pontos abstratos do jogo, não tempos/distâncias reais. */
export function strategicRoute(from:string,to:string):StrategyRoute{
 const nodes=new Set(STRATEGIC_SITES.map(s=>s.id));
 if(!nodes.has(from)||!nodes.has(to))throw new Error('P3: local estratégico desconhecido.');
 const pending:[string,readonly string[],number][]=[[from,[from],0]];
 const best=new Map<string,number>();
 while(pending.length){
  pending.sort((a,b)=>a[2]-b[2]||a[1].join('>').localeCompare(b[1].join('>')));
  const [at,path,cost]=pending.shift()!;
  if(best.has(at)&&best.get(at)!<=cost)continue;
  best.set(at,cost);
  if(at===to)return {sites:path,cost};
  for(const edge of STRATEGIC_ROADS){
   const other=edge.from===at?edge.to:edge.to===at?edge.from:null;
   if(other)pending.push([other,[...path,other],cost+edge.cost]);
  }
 }
 throw new Error('P3: local estratégico desconectado.');
}
export type SiegeEvent=Readonly<{day:number;side:SiegeSide;action:SiegeAction;
 text:string;wall:number;gate:number;towers:number;garrison:number;attacker:number}>;
export type SiegeState=Readonly<{
 version:1;source:'fictional';siteId:string;
 day:number;turn:SiegeSide;phase:'siege'|'completed';
 wall:number;gate:number;towers:number;garrison:number;attacker:number;
 attackerSupply:number;defenderSupply:number;engines:number;
 winner:SiegeSide|null;reason:string|null;
 history:readonly SiegeEvent[];
}>;
const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n));
export function startSiege(siteId:string='hillmarch'):SiegeState{
 if(!STRATEGIC_SITES.some(s=>s.id===siteId&&s.kind==='fort'))
  throw new Error('P3: cerco exige fortificação de treinamento.');
 return {version:1,source:'fictional',siteId,day:1,turn:'attacker',
  phase:'siege',wall:100,gate:80,towers:60,garrison:80,attacker:120,
  attackerSupply:90,defenderSupply:80,engines:4,
  winner:null,reason:null,history:[]};
}
export function siegeLegalActions(state:SiegeState):SiegeAction[]{
 if(state.phase==='completed')return [];
 if(state.turn==='attacker')return [
  ...(state.attackerSupply>=5?['BLOCKADE' as const]:[]),
  ...(state.engines>0&&state.attackerSupply>=12?['BOMBARD' as const]:[]),
  ...(state.attackerSupply>=18?['UNDERMINE' as const]:[]),
  ...((state.wall<=65||state.gate<=35)&&state.attackerSupply>=10?['ASSAULT' as const]:[]),
  'WITHDRAW' as const,
 ];
 return [
  ...(state.defenderSupply>=15&&state.wall<100?['REPAIR' as const]:[]),
  ...(state.defenderSupply>=12&&(state.gate<100||state.towers<100)?['FORTIFY_GATE' as const]:[]),
  ...(state.defenderSupply>=8?['SORTIE' as const]:[]),
  'RATION' as const,
 ];
}
/** Avança uma única ordem; o ataque não escreve em nenhum exército verdadeiro. */
export function siegeOrder(state:SiegeState,action:SiegeAction):SiegeState{
 if(state.source!=='fictional'||state.phase!=='siege')
  throw new Error('P3: cerco encerrado ou origem não autorizada.');
 if(!siegeLegalActions(state).includes(action))
  throw new Error('P3: ordem ilegal para este turno ou recursos insuficientes.');
 const side=state.turn;
 let {wall,gate,towers,garrison,attacker,attackerSupply,defenderSupply,engines}=state;
 const messages:Record<SiegeAction,string>={
  BLOCKADE:'Bloqueio das rotas de abastecimento',
  BOMBARD:'Bombardeio das muralhas',UNDERMINE:'Minagem das fundações',
  ASSAULT:'Assalto às brechas',
  WITHDRAW:'Retirada das forças sitiantes',REPAIR:'Reparo defensivo',
  FORTIFY_GATE:'Reforço do portão e das torres',
  SORTIE:'Sortida da guarnição',RATION:'Racionamento e redistribuição',
 };
 if(action==='BLOCKADE'){attackerSupply-=5;defenderSupply=clamp(defenderSupply-14);}
 if(action==='BOMBARD'){
  attackerSupply-=12;engines-=1;wall=clamp(wall-23);
  towers=clamp(towers-7);gate=clamp(gate-5);
  garrison=clamp(garrison-4,0,120);
 }
 if(action==='UNDERMINE'){
  attackerSupply-=18;gate=clamp(gate-30);wall=clamp(wall-8);
 }
 if(action==='ASSAULT'){
  attackerSupply-=10;
  const defenses=Math.ceil(wall/22)+Math.ceil(gate/25)+Math.ceil(towers/25);
  const losses=Math.min(attacker,8+defenses);
  attacker-=losses;garrison=clamp(garrison-(27-defenses),0,120);
 }
 if(action==='REPAIR'){defenderSupply-=15;wall=clamp(wall+17);}
 if(action==='FORTIFY_GATE'){
  defenderSupply-=12;gate=clamp(gate+20);towers=clamp(towers+9);
 }
 if(action==='SORTIE'){
  defenderSupply-=8;attacker=clamp(attacker-9,0,150);
  attackerSupply=clamp(attackerSupply-6);
 }
 if(action==='RATION'){
  defenderSupply=clamp(defenderSupply+6);
  garrison=clamp(garrison-2,0,120);
 }
 let winner:SiegeSide|null=null,reason:string|null=null;
 if(action==='WITHDRAW'||attacker===0){winner='defender';reason='retirada ou perdas do atacante';}
 else if(garrison===0){winner='attacker';reason='guarnição vencida';}
 else if(state.day>=12&&side==='defender'){
  winner=defenderSupply>0&&(wall>25||gate>25)?'defender':'attacker';
  reason='limite de doze dias de cerco';
 }
 const complete=winner!==null;
 const history=[...state.history,{day:state.day,side,action,text:messages[action],
  wall,gate,towers,garrison,attacker}];
 return {...state,wall,gate,towers,garrison,attacker,attackerSupply,defenderSupply,engines,
  history,phase:complete?'completed':'siege',winner,reason,
  turn:side==='attacker'?'defender':'attacker',
  day:side==='defender'?state.day+1:state.day};
}
