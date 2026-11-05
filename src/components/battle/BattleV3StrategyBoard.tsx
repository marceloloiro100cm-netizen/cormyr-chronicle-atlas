import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {V3_STRATEGY_NODES,V3_STRATEGY_ROADS,V3_STRATEGY_OBJECTIVES,
 v3StartStrategy,v3StrategyNeighbors,v3StrategyMarchCost,v3StrategyOrder,
 v3StrategyAiTurn,type V3StrategyOrder,type V3StrategyState,type V3StrategyNodeId}
 from '@/lib/battle/v3/strategy';

const sideName={attacker:'Aliados',defender:'Adversários'} as const;
export function BattleV3StrategyBoard({attackerCount,defenderCount,opponent,onClose}:{
 attackerCount:number;defenderCount:number;opponent:'ai'|'human';onClose:()=>void;
}){
 const [state,setState]=useState<V3StrategyState>(()=>
  v3StartStrategy(attackerCount,defenderCount,opponent));
 const [notice,setNotice]=useState('');
 const active=state.turn,position=state.position[active];
 const neighbors=v3StrategyNeighbors(position);
 const human=state.controls[active]==='human'&&state.phase==='active';
 const issue=(command:V3StrategyOrder)=>{
  try{setState(v3StrategyOrder(state,command));setNotice('Ordem estratégica registrada no treino.');}
  catch(e){setNotice(e instanceof Error?e.message:'Ordem estratégica recusada.');}
 };
 useEffect(()=>{
  if(state.phase!=='active'||state.controls[state.turn]!=='ai')return;
  try{setState(v3StrategyAiTurn(state));}
  catch(e){setNotice(e instanceof Error?e.message:'A IA não conseguiu emitir uma ordem.');}
 },[state]);
 const march=(id:V3StrategyNodeId)=>issue({type:'MARCH',to:id});
 const objectives=V3_STRATEGY_OBJECTIVES.map(id=>{
  const n=V3_STRATEGY_NODES.find(x=>x.id===id)!;
  return {name:n.name,owner:state.owners[id]};
 });
 return <section className="battle-surface crusade-strategy" aria-label="Mapa estratégico da Cruzada">
  <header className="crusade-strategy-top">
   <div><p className="battle-eyebrow">CORMYR · CRUZADA · PROTÓTIPO OPERACIONAL</p>
    <h2>Mapa estratégico de treinamento</h2>
    <p className="battle-note">Nós e estradas fictícios; dias próprios do exercício,
     sem ligação ao Hub Temporal ou aos domínios oficiais.</p></div>
   <Button size="sm" variant="outline" onClick={onClose}>Fechar planejamento</Button>
  </header>
  <div className="crusade-strategy-metrics" aria-label="Painel operacional">
   <span>Dia de treino <b>{Math.min(state.day,30)}/30</b></span>
   <span>Vez <b>{state.phase==='completed'?'Encerrada':sideName[active]}</b></span>
   <span>Aliados <b>{state.troops.attacker} tropas · {state.supplies.attacker} suprimentos</b></span>
   <span>Adversários <b>{state.troops.defender} tropas · {state.supplies.defender} suprimentos</b></span>
  </div>
  <div className="crusade-strategy-field">
   <svg className="crusade-strategy-roads" viewBox="0 0 100 100" preserveAspectRatio="none"
    aria-hidden="true">
    {V3_STRATEGY_ROADS.map(([a,b])=>{
     const start=V3_STRATEGY_NODES.find(n=>n.id===a)!;
     const end=V3_STRATEGY_NODES.find(n=>n.id===b)!;
     return <line key={a+'-'+b} x1={start.x} y1={start.y} x2={end.x} y2={end.y}/>;
    })}
   </svg>
   {V3_STRATEGY_NODES.map(node=>{
    const isCurrent=state.position[active]===node.id;
    const isAlly=state.position.attacker===node.id;
    const isEnemy=state.position.defender===node.id;
    const owner=state.owners[node.id];
    const available=human&&neighbors.includes(node.id)&&
     !(node.kind==='base'&&owner!==active);
    return <button type="button" key={node.id}
     className={'crusade-strategy-node'+(isCurrent?' current':'')+
      (owner?' owned-'+owner:'')+(available?' reachable':'')}
     style={{left:node.x+'%',top:node.y+'%'}}
     aria-label={node.name+' · '+(owner?sideName[owner]:'Neutro')+
      (available?' · Pode marchar':'')}
     title={available?'Marchar para '+node.name:node.name}
     disabled={!available} onClick={()=>march(node.id)}>
      <strong>{node.name}</strong>
      <span>{isAlly?'◆ Aliados ':''}{isEnemy?'◇ Adversários ':''}</span>
     </button>;
   })}
  </div>
  <div className="crusade-strategy-actions">
   <div className="crusade-strategy-objectives">
    <h3>Marcos estratégicos</h3>
    {objectives.map(o=><p key={o.name}>{o.name}: <strong>{o.owner?sideName[o.owner]:'Neutro'}</strong></p>)}
    <p className="battle-note">Controlar os três marcos ao fim de um dia vence o exercício.
     Confrontos são escaramuças abstratas, não partidas táticas nem perdas oficiais.</p>
   </div>
   <div>
    <h3>Ordens disponíveis</h3>
    <p className="battle-note">Marcha: {v3StrategyMarchCost(state.troops[active])} suprimentos.
     Recrutar: 60 suprimentos por 20 combatentes. Reabastecer: até +120.</p>
    <div className="battle-home-actions">
     <Button size="sm" disabled={!human} onClick={()=>issue({type:'RECRUIT'})}>Recrutar</Button>
     <Button size="sm" variant="outline" disabled={!human}
      onClick={()=>issue({type:'RESUPPLY'})}>Reabastecer</Button>
     <Button size="sm" variant="outline" disabled={!human}
      onClick={()=>issue({type:'WAIT'})}>Encerrar dia</Button>
     <Button size="sm" variant="outline" onClick={()=>{setState(v3StartStrategy(
      attackerCount,defenderCount,opponent));setNotice('Campanha de treino reiniciada.');}}>
      Reiniciar mapa</Button>
    </div>
    {notice&&<p role="status" className="battle-note">{notice}</p>}
    {state.phase==='completed'&&<p role="status"><strong>
     {state.winner===null?'Empate estratégico':
      'Vitória estratégica: '+sideName[state.winner]}
    </strong></p>}
   </div>
  </div>
  <details className="crusade-strategy-history">
   <summary>Histórico de ordens ({state.log.length})</summary>
   <ol>{[...state.log].reverse().slice(0,15).map((entry,i)=><li key={i}>
    Dia {entry.day} · {sideName[entry.side]} · {entry.message}
   </li>)}</ol>
  </details>
 </section>;
}
