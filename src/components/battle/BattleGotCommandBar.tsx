import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {MilitaryUnitSymbol} from '@/components/house/military-unit-symbol';
import type {WarQuickOrder,WarTargetOption} from '@/lib/battle/got/command-preview';
import {formatWarChance,type WarOdds} from '@/lib/battle/got/odds';
import type {WarBanner,WarBattle,WarCommander,WarSide,WarUnit} from '@/lib/battle/got/types';
import {WarBannerTitle,bannerStyle} from './BattleGotBanner';
import './battle-got-command.css';

/** Comando tático: toque na tropa e depois no mapa.
 * Sem ordem escolhida vale o modo automático: inimigo em vermelho ataca
 * (Luta, Pontaria ou Carga, o que a tropa alcançar) e quadrado verde move.
 * Componente de apresentação: recebe opções legais e chances já calculadas
 * pelo motor e devolve apenas as escolhas do usuário.
 */
export type CommandResult=Readonly<{
 seq:number;tone:'success'|'failure'|'critical'|'info';
 title:string;detail:string;dice?:readonly number[];total?:number;difficulty?:number;
}>;
export function BattleGotCommandBar({battle,banners,commander,ordersLeft,unit,orders,activeOrderId,
 commandOdds,commandDifficulty,target,targetUnit,pendingLabel,canConfirm,confirmFirst,aiSide,
 aiThinking,result,roundReady,smartMoves,smartTargets,canAutoResolve,onPickOrder,onConfirm,onCancel,
 onEndRound,onToggleConfirm,onAiSide,onAutoResolve,allowAi=true}:{
 battle:WarBattle;banners:Readonly<Record<WarSide,WarBanner>>;
 commander:WarCommander|null;ordersLeft:number;unit:WarUnit|null;
 orders:readonly WarQuickOrder[];
 /** Vazio = modo automático (o mapa decide entre atacar e mover). */
 activeOrderId:string;
 commandOdds:WarOdds|null;commandDifficulty:number|null;
 target:WarTargetOption|null;targetUnit:WarUnit|null;
 /** Ordem aguardando confirmação, quando "confirmar antes" está ligado. */
 pendingLabel:string|null;canConfirm:boolean;confirmFirst:boolean;
 aiSide:WarSide|'none';aiThinking:boolean;result:CommandResult|null;
 /** Nenhum comandante tem ordens: a rodada vai virar. */
 roundReady:boolean;
 smartMoves:number;smartTargets:number;canAutoResolve:boolean;
 onPickOrder:(order:WarQuickOrder|null)=>void;
 onConfirm:()=>void;onCancel:()=>void;onEndRound:()=>void;
 onToggleConfirm:(value:boolean)=>void;onAiSide:(value:WarSide|'none')=>void;
 onAutoResolve:()=>void;allowAi?:boolean;
}){
 const active=orders.find(o=>o.id===activeOrderId)??null;
 // Resolver tudo pede um segundo toque: evita encerrar a batalha por engano.
 const [armed,setArmed]=useState(false);
 useEffect(()=>{
  if(!armed)return undefined;
  const timer=window.setTimeout(()=>setArmed(false),4000);
  return()=>window.clearTimeout(timer);
 },[armed]);
 const banner=banners[battle.turn];
 const pips=commander?Array.from({length:Math.max(ordersLeft,commander.role==='commander'?
  commander.warfare:1)},(_,i)=>i<ordersLeft):[];
 const aiTurn=aiSide!=='none'&&battle.turn===aiSide;
 const hint=!unit?'Toque em uma tropa de '+banner.houseName+' no mapa.':
  active?(active.needs==='enemy'?'Toque em um inimigo marcado em vermelho.':
   active.needs==='cell'?'Toque em um quadrado verde.':active.help):
  unit.condition==='routed'?'Tropa em fuga: use Reanimar.':
  smartTargets>0&&smartMoves>0?'Toque em um inimigo para atacar ou em um quadrado verde para mover.':
  smartTargets>0?'Toque em um inimigo marcado em vermelho para atacar.':
  smartMoves>0?'Nenhum inimigo ao alcance. Toque em um quadrado verde para avançar.':
  'Sem alvo nem caminho livre. Escolha outra ordem abaixo.';
 return <section className={'got-command '+battle.turn} aria-label="Comando tático"
  data-testid="got-command-bar" style={bannerStyle(banner)}>
  <header className="got-command-turn">
   <WarBannerTitle banner={banner} detail={commander?'Guerra '+commander.warfare+
    (aiTurn?' · adversário automático':''):'Sem comandante ativo'}>
    Vez de {banner.houseName}</WarBannerTitle>
   <div className="got-command-pips" role="img"
    aria-label={ordersLeft+' ordem(ns) restante(s) nesta rodada'}>
    {pips.map((on,i)=><i key={i} className={on?'is-on':''}/>)}
   </div>
  </header>
  {result&&<div key={result.seq} className={'got-command-result is-'+result.tone} role="status">
   <strong>{result.title}</strong>
   <span>{result.detail}</span>
   {result.dice&&<span className="got-dice" aria-label={'Dados: '+result.dice.join(', ')}>
    {result.dice.map((d,i)=><b key={i} data-face={d}>{d}</b>)}
    {typeof result.total==='number'&&typeof result.difficulty==='number'&&
     <em>{result.total} contra {result.difficulty}</em>}
   </span>}
  </div>}
  {roundReady?<div className="got-command-step is-ready" role="status">
   <p>Ordens encerradas. A próxima rodada começa em instantes.</p>
   <Button onClick={onEndRound} className="got-command-end">Próxima rodada</Button>
  </div>:aiTurn?<div className="got-command-step is-ai" role="status">
   <p>{aiThinking?banner.houseName+' está decidindo…':banner.houseName+' não tem mais ordens.'}</p>
  </div>:<>
   {unit&&<div className="got-command-chosen">
    <MilitaryUnitSymbol typeId={unit.typeId} size="small"/>
    <span><strong>{unit.name}</strong>
     <small>Saúde {unit.health}/{unit.maxHealth}
      {commandOdds?' · obedece '+formatWarChance(commandOdds.success):''}
      {unit.range!=='none'?' · tiro até '+(unit.range==='long'?'200':'20')+' m':''}</small></span>
   </div>}
   <p className="got-command-hint">{hint}</p>
   {unit&&<div className="got-command-orders" role="group" aria-label="Outras ordens">
    {orders.map(o=><button type="button" key={o.id} title={o.help}
     aria-pressed={activeOrderId===o.id} disabled={ordersLeft<1}
     className={'got-command-order'+(activeOrderId===o.id?' is-selected':'')}
     onClick={()=>onPickOrder(activeOrderId===o.id?null:o)}>
     <span aria-hidden="true">{o.icon}</span>{o.label}
    </button>)}
   </div>}
   {unit&&pendingLabel&&<div className="got-command-step">
    <dl className="got-command-odds">
     {commandOdds&&commandDifficulty!==null&&commander&&<div>
      <dt>A tropa obedece?</dt>
      <dd><b>{formatWarChance(commandOdds.success)}</b>
       <small>Guerra {commander.warfare}D contra Disciplina {commandDifficulty}</small></dd>
     </div>}
     {target&&targetUnit&&<div>
      <dt>Acerta {targetUnit.name}?</dt>
      {target.odds?<dd><b>{formatWarChance(target.odds.success)}</b>
       <small>{target.testDice}D{target.bonusDice?' +'+target.bonusDice+'B':''}
        {target.penaltyDice?' −'+target.penaltyDice+'D':''} contra Defesa {target.defense}
        {' · '}dano médio {(target.expectedDamage??0).toFixed(1)}</small></dd>:
       <dd><b>após a corrida</b></dd>}
     </div>}
    </dl>
    <div className="got-command-actions">
     <Button onClick={onConfirm} disabled={!canConfirm||ordersLeft<1}>Confirmar · {pendingLabel}</Button>
     <Button variant="outline" onClick={onCancel}>Cancelar</Button>
    </div>
   </div>}
  </>}
  <div className="got-command-footer">
   {!roundReady&&<Button variant="outline" size="sm" onClick={onEndRound}>Encerrar rodada</Button>}
   <Button variant={armed?'default':'outline'} size="sm" disabled={!canAutoResolve}
    onClick={()=>{if(armed){setArmed(false);onAutoResolve();}else setArmed(true);}}
    title="O comando automático joga os dois lados até o fim, pelas mesmas regras.">
    {armed?'Toque de novo para resolver tudo':'Resolver até o fim'}</Button>
   <details className="got-command-options">
    <summary>Opções</summary>
    <label className="got-check"><input type="checkbox" checked={confirmFirst}
     onChange={e=>onToggleConfirm(e.target.checked)}/>
     Confirmar antes de executar (mostra as chances)</label>
    {allowAi&&<label className="got-command-ai">Adversário automático
     <select aria-label="Oponente automático" value={aiSide}
      onChange={e=>onAiSide(e.target.value as WarSide|'none')}>
      <option value="none">Desligado · eu comando os dois lados</option>
      <option value="defender">Comanda o Defensor</option>
      <option value="attacker">Comanda o Atacante</option>
     </select>
    </label>}
   </details>
  </div>
 </section>;
}
