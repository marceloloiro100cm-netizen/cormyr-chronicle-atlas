import {Button} from '@/components/ui/button';
import {MilitaryUnitSymbol} from '@/components/house/military-unit-symbol';
import type {WarQuickOrder,WarTargetOption} from '@/lib/battle/got/command-preview';
import {formatWarChance,type WarOdds} from '@/lib/battle/got/odds';
import type {WarBattle,WarCommander,WarSide,WarUnit} from '@/lib/battle/got/types';
import './battle-got-command.css';

/** Comando tático em três passos: tropa, ordem e alvo.
 * Componente de apresentação: recebe as opções legais e as chances já
 * calculadas pelo motor e devolve apenas as escolhas do usuário.
 */
export type CommandResult=Readonly<{
 seq:number;tone:'success'|'failure'|'critical'|'info';
 title:string;detail:string;dice?:readonly number[];total?:number;difficulty?:number;
}>;
const SIDE_LABEL:Record<WarSide,string>={attacker:'Atacante',defender:'Defensor'};
const CONDITION:Record<WarUnit['condition'],string>={
 organized:'Organizada',disorganized:'Desorganizada',routed:'Debandada',
 destroyed:'Destruída',surrendered:'Rendida',escaped:'Fora de campo',
};
const STEP_HINT:Record<WarQuickOrder['needs'],string>={
 enemy:'Clique em um inimigo destacado em vermelho no mapa.',
 cell:'Clique em um quadrado verde no mapa.',
 none:'Esta ordem não precisa de alvo.',
};
export function BattleGotCommandBar({battle,commander,ordersLeft,units,unit,orders,activeOrderId,
 commandOdds,commandDifficulty,target,targetUnit,destinationLabel,canConfirm,fastMode,aiSide,
 aiThinking,result,roundReady,onSelectUnit,onPickOrder,onConfirm,onCancel,onEndRound,
 onToggleFast,onAiSide,allowAi=true}:{
 battle:WarBattle;commander:WarCommander|null;ordersLeft:number;
 units:readonly WarUnit[];unit:WarUnit|null;
 orders:readonly WarQuickOrder[];activeOrderId:string;
 commandOdds:WarOdds|null;commandDifficulty:number|null;
 target:WarTargetOption|null;targetUnit:WarUnit|null;destinationLabel:string|null;
 canConfirm:boolean;fastMode:boolean;aiSide:WarSide|'none';aiThinking:boolean;
 result:CommandResult|null;
 /** Nenhum comandante tem ordens: resta concluir a rodada. */
 roundReady:boolean;
 onSelectUnit:(id:string)=>void;onPickOrder:(order:WarQuickOrder)=>void;
 onConfirm:()=>void;onCancel:()=>void;onEndRound:()=>void;
 onToggleFast:(value:boolean)=>void;onAiSide:(value:WarSide|'none')=>void;allowAi?:boolean;
}){
 const active=orders.find(o=>o.id===activeOrderId)??null;
 const pips=commander?Array.from({length:Math.max(ordersLeft,commander.role==='commander'?
  commander.warfare:1)},(_,i)=>i<ordersLeft):[];
 const aiTurn=aiSide!=='none'&&battle.turn===aiSide;
 return <section className={'got-command '+battle.turn} aria-label="Comando tático"
  data-testid="got-command-bar">
  <header className="got-command-turn">
   <div>
    <strong>Vez do {SIDE_LABEL[battle.turn]}</strong>
    <span>{commander?commander.name+' · Guerra '+commander.warfare+'D':'Sem comandante ativo'}</span>
   </div>
   <div className="got-command-pips" role="img"
    aria-label={ordersLeft+' ordem(ns) restante(s) nesta rodada'}>
    {pips.map((on,i)=><i key={i} className={on?'is-on':''}/>)}
    <small>{ordersLeft} ordem(ns)</small>
   </div>
  </header>
  {result&&<div key={result.seq} className={'got-command-result is-'+result.tone} role="status">
   <strong>{result.title}</strong>
   <span>{result.detail}</span>
   {result.dice&&<span className="got-dice" aria-label={'Dados: '+result.dice.join(', ')}>
    {result.dice.map((d,i)=><b key={i} data-face={d}>{d}</b>)}
    {typeof result.total==='number'&&typeof result.difficulty==='number'&&
     <em>Guerra {result.total} contra Disciplina {result.difficulty}</em>}
   </span>}
  </div>}
  {roundReady?<div className="got-command-step is-ready">
   <p>Todas as ordens foram dadas. Ao concluir, as tropas com ordens contínuas
    (atacar, defender, recuar) agem sozinhas e uma nova iniciativa é rolada.</p>
   <Button onClick={onEndRound} className="got-command-end">Concluir rodada</Button>
  </div>:aiTurn?<div className="got-command-step is-ai" role="status">
   <p>{aiThinking?'O comandante adversário está decidindo…':
    'O comandante adversário não tem mais ordens úteis.'}</p>
  </div>:<>
   <div className="got-command-step">
    <h4><span>1</span> Escolha a tropa</h4>
    <div className="got-command-units" role="group" aria-label="Tropas do lado que comanda">
     {units.map(u=><button type="button" key={u.id} onClick={()=>onSelectUnit(u.id)}
      aria-pressed={unit?.id===u.id}
      className={'got-command-unit'+(unit?.id===u.id?' is-selected':'')+' is-'+u.condition}>
      <MilitaryUnitSymbol typeId={u.typeId} size="small"/>
      <span><strong>{u.name}</strong>
       <small>{CONDITION[u.condition]} · Saúde {u.health}/{u.maxHealth}
        {u.issuedThisRound>0?' · já recebeu ordem (+'+u.issuedThisRound*3+')':''}</small></span>
     </button>)}
    </div>
   </div>
   {unit&&<div className="got-command-step">
    <h4><span>2</span> Dê a ordem a {unit.name}</h4>
    <div className="got-command-orders" role="group" aria-label="Ordens disponíveis">
     {orders.map(o=><button type="button" key={o.id} title={o.help}
      aria-pressed={activeOrderId===o.id} disabled={ordersLeft<1}
      className={'got-command-order'+(activeOrderId===o.id?' is-selected':'')}
      onClick={()=>onPickOrder(o)}>
      <span aria-hidden="true">{o.icon}</span>{o.label}
     </button>)}
    </div>
    {active&&<p className="got-command-help">{active.help}</p>}
   </div>}
   {unit&&active&&<div className="got-command-step">
    <h4><span>3</span> {active.needs==='none'?'Confirme':'Escolha no mapa e confirme'}</h4>
    <p className="got-command-help">{STEP_HINT[active.needs]}</p>
    <dl className="got-command-odds">
     {commandOdds&&commandDifficulty!==null&&commander&&<div>
      <dt>A tropa obedece?</dt>
      <dd><b>{formatWarChance(commandOdds.success)}</b>
       <small>Guerra {commander.warfare}D contra Disciplina {commandDifficulty}
        {commandOdds.critical>0.005?' · falha crítica '+formatWarChance(commandOdds.critical):''}</small></dd>
     </div>}
     {target&&targetUnit&&<div>
      <dt>Acerta {targetUnit.name}?</dt>
      {target.odds?<dd><b>{formatWarChance(target.odds.success)}</b>
       <small>{target.testDice}D{target.bonusDice?' +'+target.bonusDice+'B':''}
        {target.penaltyDice?' −'+target.penaltyDice+'D':''} contra Defesa {target.defense}
        {' · '}dano {target.baseDamage} por grau − VA {target.targetArmor}
        {' · '}média {(target.expectedDamage??0).toFixed(1)}</small></dd>:
       <dd><b>após a corrida</b><small>A chance é calculada quando a tropa encosta no alvo.</small></dd>}
     </div>}
     {destinationLabel&&<div><dt>Destino</dt><dd><b>{destinationLabel}</b></dd></div>}
    </dl>
    <div className="got-command-actions">
     <Button onClick={onConfirm} disabled={!canConfirm||ordersLeft<1}>
      Confirmar ordem · {active.label}</Button>
     <Button variant="outline" onClick={onCancel}>Cancelar</Button>
    </div>
   </div>}
   <div className="got-command-footer">
    <Button variant="outline" onClick={onEndRound}>Concluir rodada agora</Button>
    <label className="got-check"><input type="checkbox" checked={fastMode}
     onChange={e=>onToggleFast(e.target.checked)}/>
     Ordem em um clique (sem confirmar)</label>
   </div>
  </>}
  {allowAi&&<label className="got-command-ai">Oponente automático
   <select aria-label="Oponente automático" value={aiSide}
    onChange={e=>onAiSide(e.target.value as WarSide|'none')}>
    <option value="none">Desligado · eu comando os dois lados</option>
    <option value="defender">Controla o Defensor</option>
    <option value="attacker">Controla o Atacante</option>
   </select>
  </label>}
 </section>;
}
