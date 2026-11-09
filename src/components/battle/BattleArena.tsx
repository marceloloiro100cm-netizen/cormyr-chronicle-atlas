import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {BattleCommand,BattleStack,BattleState,Hex,Side} from '@/lib/battle/domain/types';
import {startBattle,applyBattleCommand,getLegalActions,legalAttack} from '@/lib/battle/domain/turns';
import {livingCount,casualtyCount} from '@/lib/battle/domain/morale';
import {resolveDamage} from '@/lib/battle/domain/combat';
import {battleReport} from '@/lib/battle/domain/report';
import {hexKey} from '@/lib/battle/geometry/hex';
import {gridDistance} from '@/lib/battle/geometry/grid';
import {reachablePaths} from '@/lib/battle/geometry/pathfinding';
import {downloadBattleJson} from '@/lib/battle/serialization/map-io';
import {BattleBoard} from './BattleBoard';
import {BattleExpandedView} from './BattleExpandedView';
import {BattleTurnCue} from './BattleTurnCue';
import {BattleActionFeedback} from './BattleActionFeedback';
import {BattleOutcomeSummary} from './BattleOutcomeSummary';
import {pteEventLabel,mostRecentAction,pteAiActionDescription}
 from '@/lib/battle/ux/action-explanation';
import {tacticalObjectiveDescription} from '@/lib/battle/domain/objectives';
import './battle-p2.css';
import {BattleHouseBanner,BattleHouseVersus} from './BattleHouseHeraldry';
import type {BattleHouseDirectoryRow} from '@/lib/battle/adapters/house-directory';
import './battle-arena-unified.css';
import './battle-p0-p1.css';
import {runAiUntilHuman} from '@/lib/battle/domain/ai';
import {exportReplayJson} from '@/lib/battle/domain/replay';
import {BattleReplay} from './BattleReplay';
import {saveBattleReplay} from '@/lib/battle/battle-session.functions';
import {useServerFn} from '@tanstack/react-start';

const LABEL:Record<Side,string>={attacker:'Atacante',defender:'Defensor'};
function BattleResult({state,initial,sideNames,heraldry,onRestart,onExit,persistenceEnabled}:{
 initial:BattleState;
 state:BattleState;sideNames:Record<Side,string>;
 heraldry?:Partial<Record<Side,BattleHouseDirectoryRow>>|undefined;
 onRestart:()=>void;onExit:()=>void;
 persistenceEnabled:boolean;
}){
 const report=battleReport(state);
 const [replayVisible,setReplayVisible]=useState(false);
 const save=useServerFn(saveBattleReplay);
 const [savedMessage,setSavedMessage]=useState(''),[saving,setSaving]=useState(false);
 const persist=async()=>{
  setSaving(true);
  try{const receipt=await save({data:{replayJson:exportReplayJson(initial,state)}});
   setSavedMessage('Batalha salva: '+receipt.sessionId);
  }catch(e){setSavedMessage(e instanceof Error?e.message:'Falha ao salvar.');}
  finally{setSaving(false);}
 };
 return <section className="battle-surface" aria-label="Resultado da batalha">
   <h2>Resultado da simulação</h2>
  <BattleHouseVersus houses={heraldry} names={sideNames}/>
   <BattleOutcomeSummary title={state.winner?sideNames[state.winner]+' venceu':'Empate'}
    round={state.round} reason={state.resultReason==='objective-capture'?'Posição conquistada':
     state.resultReason==='objective-defense'?'Defesa resistiu até o prazo':
     state.resultReason==='objective-survive'?'Defensor resistiu ao confronto':
     state.resultReason??'Sem causa informada'}
    losses={[
     {label:sideNames.attacker,count:report.bySide.attacker.casualties},
     {label:sideNames.defender,count:report.bySide.defender.casualties},
    ]}/>
   <div className="battle-summary-grid">
    {(['attacker','defender'] as const).map(side=><article key={side} className="battle-result-card">
      {heraldry?.[side]?<BattleHouseBanner side={side} house={heraldry[side]}
  name={sideNames[side]} subtle/>:<h3>{sideNames[side]}</h3>}
      <p>{report.bySide[side].alive} / {report.bySide[side].initial} sobreviventes</p>
      <p>{report.bySide[side].casualties} baixas táticas · {report.bySide[side].damageDealt} dano causado</p>
    </article>)}
   </div>
   <div className="battle-report-scroll"><table className="battle-report-table">
    <caption>Resultado por agrupamento — sem alterações nas fichas oficiais</caption>
    <thead><tr><th>Unidade</th><th>Lado</th><th>Vivos</th><th>Baixas</th><th>PV</th><th>Causou</th><th>Recebeu</th><th>Moral</th></tr></thead>
    <tbody>{report.units.map(unit=><tr key={unit.id}>
      <td>{unit.name}</td><td>{LABEL[unit.side]}</td><td>{unit.alive} / {unit.initial}</td>
      <td>{unit.casualties}</td><td>{unit.remainingHp} / {unit.initialHp}</td>
      <td>{unit.damageDealt}</td><td>{unit.damageReceived}</td><td>{unit.routed?'Debandada':'—'}</td>
    </tr>)}</tbody>
   </table></div>
   <div className="battle-form-row">
    <Button variant="outline" onClick={()=>downloadBattleJson('resultado-batalha.json',JSON.stringify(report,null,2))}>Exportar resultado JSON</Button>
    {persistenceEnabled&&<Button disabled={saving} variant="outline" onClick={()=>void persist()}>
      Salvar batalha
    </Button>}
    <Button variant="outline" onClick={()=>{try{downloadBattleJson('batalha-replay-verificado.json',exportReplayJson(initial,state));}
      catch(e){window.alert(e instanceof Error?e.message:'Replay inválido.');}}}>Exportar batalha completa JSON</Button>
    <Button variant="outline" onClick={()=>setReplayVisible(v=>!v)}>{replayVisible?'Ocultar replay':'Rever turnos'}</Button>
    <Button variant="outline" onClick={onRestart}>Nova simulação com as mesmas forças</Button>
    <Button onClick={onExit}>Voltar ao painel</Button>
   </div>
   {savedMessage&&<p role="status">{savedMessage}</p>}
   {replayVisible&&<BattleReplay initial={initial} state={state}/>}
   <p className="battle-note">Replay verificável PTE-2.0. O salvamento usa registro tático independente e não altera fichas da campanha.</p>
 </section>;
}
export function BattleArena({initial,resume,sideNames,heraldry,onExit,persistenceEnabled=false}:{
 initial:BattleState;resume?:BattleState;sideNames:Record<Side,string>;
 heraldry?:Partial<Record<Side,BattleHouseDirectoryRow>>|undefined;onExit:()=>void;
 persistenceEnabled?:boolean;
}){
 // Uma batalha retomada foi reconstruída por replay SHA-256 no servidor e no navegador.
 // A edição é local; o salvamento posterior cria uma nova cópia, sem sobrescrever a origem.
 const [battle,setBattle]=useState<BattleState>(()=>resume??startBattle(initial));
 const [history,setHistory]=useState<BattleState[]>([]);
 const [expanded,setExpanded]=useState(true);
 const [fullHistory,setFullHistory]=useState(false);
 const [selected,setSelected]=useState<string|null>(battle.activeUnitId);
 const [mode,setMode]=useState<'inspect'|'move'|'attack'>('inspect');
 const [pendingMove,setPendingMove]=useState<Hex|null>(null),[pendingAttack,setPendingAttack]=useState<string|null>(null);
 const [hover,setHover]=useState<Hex|null>(null);
 const [notice,setNotice]=useState(''),[paused,setPaused]=useState(false);
 const saveProgress=useServerFn(saveBattleReplay);
 const [savingProgress,setSavingProgress]=useState(false);
 const [showManual,setShowManual]=useState(false),[reason,setReason]=useState('');
 const [manualWinner,setManualWinner]=useState<Side|null>(null),[showHelp,setShowHelp]=useState(false);
 const active=battle.stacks.find(s=>s.id===battle.activeUnitId);
 const inspected=battle.stacks.find(s=>s.id===selected)??active;
 const canAct=battle.phase==='active'&&!paused&&selected===battle.activeUnitId&&Boolean(active&&battle.controls[active.side]==='human');
 const legal=useMemo(()=>battle.phase==='active'?getLegalActions(battle):[],[battle]);
 const moves=useMemo(()=>legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE'),[legal]);
 const attacks=useMemo(()=>legal.filter((c):c is Extract<BattleCommand,{type:'ATTACK'}>=>c.type==='ATTACK'),[legal]);
 const attackIds=attacks.map(c=>c.targetId);
 const moveKeys=moves.map(c=>hexKey(c.to));
 const paths=useMemo(()=>{
  if(!active||active.movedThisActivation||active.attackedThisActivation||battle.phase!=='active')return [];
  const occupied=battle.stacks.filter(s=>s.id!==active.id&&s.currentHp>0).map(s=>s.position);
  const enemies=battle.stacks.filter(s=>s.side!==active.side&&s.currentHp>0&&s.moraleState!=='routed').map(s=>s.position);
  return reachablePaths(battle.map,active.position,active.movementHex,{occupied,enemies});
 },[battle,active]);
 const candidate=mode==='move'?(pendingMove??hover):null;
 const selectedPath=candidate?paths.find(p=>hexKey(p.to)===hexKey(candidate)):undefined;
 const target=pendingAttack?battle.stacks.find(s=>s.id===pendingAttack):undefined;
 const latestAction=mostRecentAction(battle.events,
  ['DAMAGE','RETALIATION','MOVE','DEFEND','WAIT']);
 const latestDamage=latestAction&&typeof latestAction.delta['damage']==='number'?
  latestAction.delta['damage'] as number:undefined;
 const latestCasualties=latestAction&&typeof latestAction.delta['casualties']==='number'?
  latestAction.delta['casualties'] as number:undefined;
 const damagePreview=active&&target&&legalAttack(battle,active,target).legal
   ?resolveDamage(battle.map,active,target,gridDistance(battle.map,active.position,target.position)>1):null;
 const clear=()=>{setMode('inspect');setPendingMove(null);setPendingAttack(null);setHover(null);};
 useEffect(()=>{
  if(paused||battle.phase!=='active'||!battle.activeUnitId)return;
  const unit=battle.stacks.find(s=>s.id===battle.activeUnitId);
  if(!unit||battle.controls[unit.side]!=='ai')return;
  try{
   const outcome=runAiUntilHuman(battle);
   if(outcome.commands.length){
    setHistory(values=>[...values.slice(-99),battle]);
    setBattle(outcome.state);setSelected(outcome.state.activeUnitId);
    setMode('inspect');setPendingMove(null);setPendingAttack(null);
    setNotice(pteAiActionDescription(outcome.commands));
   }
  }catch(e){setPaused(true);setNotice(e instanceof Error?e.message:'Falha na IA: simulação pausada.');}
 },[battle,paused]);
 const command=(cmd:BattleCommand)=>{
  if(paused){setNotice('A simulação está pausada.');return;}
  try{
   const next=applyBattleCommand(battle,cmd);
   setHistory(states=>[...states.slice(-99),battle]);
   setBattle(next);setSelected(next.activeUnitId);clear();setNotice('');
  }catch(e){setNotice(e instanceof Error?e.message:'Comando recusado.');}
 };
 const chooseHex=(hex:Hex)=>{
  if(paused)return;
  const unit=battle.stacks.find(s=>hexKey(s.position)===hexKey(hex)&&s.currentHp>0);
  // Lote 2: movimento e ataque contextuais. O motor continua validando cada
  // comando; o modo guiado preserva a confirmação explícita para quem preferir.
  if(canAct&&mode==='inspect'&&active){
   const attack=unit&&attacks.find(c=>c.targetId===unit.id);
   if(attack){command(attack);return;}
   const move=!unit&&moves.find(c=>hexKey(c.to)===hexKey(hex));
   if(move){command(move);return;}
  }
  if(canAct&&mode==='move'){
   if(moveKeys.includes(hexKey(hex))){setPendingMove(hex);setPendingAttack(null);setNotice('Confirme o deslocamento abaixo.');}
   else setNotice('Destino bloqueado. Escolha um quadrado verde.');
   return;
  }
  if(canAct&&mode==='attack'){
   if(unit&&attackIds.includes(unit.id)){setPendingAttack(unit.id);setPendingMove(null);setNotice('Confirme o ataque abaixo.');}
   else setNotice('Escolha um inimigo destacado.');
   return;
  }
  if(unit){setSelected(unit.id);clear();}
 };
 const saveCurrent=async()=>{
  if(!persistenceEnabled||savingProgress)return;
  setSavingProgress(true);
  try{
   const saved=await saveProgress({data:{replayJson:exportReplayJson(initial,battle)}});
   setNotice('Batalha salva: '+saved.sessionId);
  }catch(e){setNotice(e instanceof Error?e.message:'Falha no salvamento.');}
  finally{setSavingProgress(false);}
 };
 const undo=()=>{
  const last=history.at(-1);if(!last)return;
  setHistory(xs=>xs.slice(0,-1));setBattle(last);setSelected(last.activeUnitId);setNotice('Última ação desfeita no laboratório.');clear();
 };
 const restart=()=>{
  if(!window.confirm('Reiniciar esta simulação e descartar as ações anteriores?'))return;
  const fresh=startBattle(initial);setBattle(fresh);setHistory([]);setSelected(fresh.activeUnitId);clear();setNotice('');
 };
 if(battle.phase==='completed'||battle.phase==='archived')
  return <BattleExpandedView expanded={expanded} onClose={()=>setExpanded(false)}>
   <div className="battle-module battle-unified-shell battle-result-screen">
    <div className="battle-arena-top battle-surface">
     <strong>Resultado da batalha · PTE-2.0</strong>
     <Button size="sm" variant="outline" className="battle-expand-toggle"
      aria-label={expanded?'Sair da tela ampliada':'Ampliar batalha'}
      onClick={()=>setExpanded(value=>!value)}>
      {expanded?'↙ Sair da tela ampliada':'⤢ Ampliar batalha'}
     </Button>
    </div>
    <BattleResult state={battle} initial={initial} sideNames={sideNames} heraldry={heraldry}
     onRestart={restart} onExit={onExit} persistenceEnabled={persistenceEnabled}/>
   </div>
  </BattleExpandedView>;
 const arena=<div className="battle-module battle-unified-shell">
  <section className="battle-arena" aria-label="Arena tática">
  <header className="battle-arena-top battle-surface">
   <div className="battle-arena-heading">
    <p className="battle-eyebrow">CORMYR · CAMPO TÁTICO · TREINAMENTO</p>
    <h2>{battle.name}</h2>
    <BattleHouseVersus houses={heraldry} names={sideNames}/>
    <p>Rodada {battle.round} / 20 · {active?active.name:'Sem unidade ativa'}
     {' · '}PTE-2.0 experimental</p>
   </div>
   <div className="battle-arena-quick-controls">
    <Button size="sm" variant="outline" className="battle-expand-toggle"
     aria-label={expanded?'Sair da tela ampliada':'Ampliar batalha'}
     onClick={()=>setExpanded(value=>!value)}>
     {expanded?'↙ Sair da tela ampliada':'⤢ Ampliar batalha'}
    </Button>
    <Button size="sm" variant="outline" onClick={()=>setPaused(x=>!x)}>{paused?'Retomar':'Pausar'}</Button>
    {history.length>0&&<Button size="sm" variant="outline"
     aria-label="Desfazer última ação" onClick={undo}>Desfazer</Button>}
    {persistenceEnabled&&<Button size="sm" variant="outline" disabled={savingProgress}
     onClick={()=>void saveCurrent()}>Salvar batalha</Button>}
    <Button size="sm" variant="outline" onClick={onExit}>Sair</Button>
    <details className="battle-arena-extra">
     <summary>Mais opções</summary>
     <div className="battle-arena-extra-buttons">
      <Button size="sm" variant="outline" disabled={!history.length} onClick={undo}>Desfazer ação</Button>
      <Button size="sm" variant="outline" onClick={restart}>Reiniciar</Button>
      {!persistenceEnabled&&<Button size="sm" variant="outline"
       onClick={()=>{try{downloadBattleJson('batalha-replay-verificado.json',
        exportReplayJson(initial,battle));setNotice('Replay exportado para arquivo local.');}
        catch(e){setNotice(e instanceof Error?e.message:'Falha ao exportar replay.');}}}>
       Exportar replay</Button>}
      <Button size="sm" variant="outline" onClick={()=>setShowHelp(x=>!x)}>
       {showHelp?'Ocultar regras':'Regras'}
      </Button>
     </div>
    </details>
   </div>
  </header>
  <BattleTurnCue system="adapted" round={battle.round} phase={battle.phase}
   activeUnit={active?.name} canAct={canAct} moves={moves.length}
   attacks={attacks.length}
   needsSelection={Boolean(active&&battle.controls[active.side]==='human'&&selected!==active.id)}
   onSelectActive={active?()=>{setSelected(active.id);clear();}:undefined}
   hint={canAct?'Toque no verde para mover ou no inimigo destacado para atacar.':
    'Confira a unidade da vez e aguarde sua ativação.'}/>
  {latestAction&&<BattleActionFeedback round={latestAction.round}
   label={pteEventLabel(latestAction,battle.stacks)}
   damage={latestDamage} casualties={latestCasualties}
   detail={latestAction.type==='DAMAGE'?'Ataque resolvido pelo motor PTE.':undefined}/>}
  {battle.objective&&<section className="battle-tactical-goal" aria-label="Objetivo tático" role="status">
    <strong>{battle.objective.kind==='capture'?'Conquistar posição':'Resistir ao ataque'}</strong>
    <p>{tacticalObjectiveDescription(battle)}</p>
   </section>}
  {showHelp&&<div className="battle-surface" role="note">Mover e atacar; defender dá +2. Esperar uma vez por rodada. Baixas apenas simuladas.</div>
  <div className="battle-arena-grid">
    <aside className="battle-surface battle-army-sidebar" aria-label="Exércitos na arena">
     {(['attacker','defender'] as const).map(side=><div key={side}>
      {heraldry?.[side]?<BattleHouseBanner side={side} house={heraldry[side]}
  name={sideNames[side]} subtle/>:<h3>{sideNames[side]}</h3>}
      {battle.stacks.filter(u=>u.side===side).map(u=><button type="button" key={u.id}
        className={u.id===selected?'battle-unit-list active':'battle-unit-list'}
        aria-pressed={u.id===selected} onClick={()=>{setSelected(u.id);clear();}}>
        <span>{u.id===battle.activeUnitId?'● ':''}{u.name}</span>
        <span>{livingCount(u)}/{u.initialCount}{u.moraleState==='routed'?' · Debandada':''}</span>
      </button>)}
     </div>)}
    </aside>
    <section className="battle-surface battle-field" aria-label="Campo de batalha PTE">
     <div className="battle-unified-map-label">
      <h3>Campo de batalha</h3><span>Verde: mover · vermelho: atacar</span>
     </div>
     <BattleBoard map={battle.map} stacks={battle.stacks} activeId={battle.activeUnitId}
       selectedId={selected} moveKeys={canAct&&mode!=='attack'?moveKeys:[]}
       attackKeys={canAct&&mode!=='move'?attackIds:[]} pendingHex={pendingMove}
       onHexClick={chooseHex} onHoverHex={setHover}
       objectivePosition={battle.objective?.kind==='capture'?battle.objective.position:undefined}/>
     {mode==='move'&&<p role="status">Rota: {selectedPath?selectedPath.steps+' '+(battle.map.grid==='square'?'quadrados':'hexágonos')+' · custo '+selectedPath.cost:
      'Selecione um '+(battle.map.grid==='square'?'quadrado':'hexágono')+' destacado'}</p>}
     {damagePreview&&<p role="status">Ataque previsto contra {target?.name}: {damagePreview.damage} PV · {damagePreview.casualties} baixas antes de eventual retaliação.</p>}
     {notice&&<p role="alert" className="battle-error">{notice}</p>}
     <div className="battle-actions battle-actions-compact" role="group" aria-label="Ações da unidade">
      <Button disabled={!canAct||!legal.some(c=>c.type==='DEFEND')} variant="outline"
        onClick={()=>active&&command({type:'DEFEND',unitId:active.id})}>Defender</Button>
      <Button disabled={!canAct||!legal.some(c=>c.type==='WAIT')} variant="outline"
        onClick={()=>active&&command({type:'WAIT',unitId:active.id})}>Esperar</Button>
      <Button disabled={!canAct} onClick={()=>active&&command({type:'END_ACTIVATION',unitId:active.id})}>Fim do turno</Button>
     </div>
     <details className="battle-alternative-controls"
      onToggle={event=>{if(!event.currentTarget.open)clear();}}>
      <summary>Controles por botões</summary>
      <p className="battle-note">Alternativa com confirmação antes de mover ou atacar.</p>
      <div className="battle-actions" role="group" aria-label="Ações guiadas">
       <Button disabled={!canAct||!moves.length} variant={mode==='move'?'default':'outline'}
        onClick={()=>{clear();setMode('move');}}>Mover</Button>
       <Button disabled={!canAct||!attacks.length} variant={mode==='attack'?'default':'outline'}
        onClick={()=>{clear();setMode('attack');}}>Atacar</Button>
       <Button variant="outline" onClick={clear}>Cancelar seleção</Button>
      </div>
     </details>
     {pendingMove&&active&&<div className="battle-confirm" role="group" aria-label="Confirmar movimento">
       <span>Movimento para {pendingMove.q}, {pendingMove.r}</span>
       <Button onClick={()=>command({type:'MOVE',unitId:active.id,to:pendingMove})}>Confirmar movimento</Button>
       <Button variant="outline" onClick={()=>setPendingMove(null)}>Cancelar</Button>
     </div>}
     {pendingAttack&&active&&<div className="battle-confirm" role="group" aria-label="Confirmar ataque">
       <span>Alvo: {target?.name}</span>
       <Button onClick={()=>command({type:'ATTACK',unitId:active.id,targetId:pendingAttack})}>Confirmar ataque</Button>
       <Button variant="outline" onClick={()=>setPendingAttack(null)}>Cancelar</Button>
     </div>}
    </section>
    <aside className="battle-surface battle-inspector" aria-label="Ficha tática selecionada">
     <h3>Unidade selecionada</h3>
     {inspected?<UnitInspector unit={inspected} active={inspected.id===battle.activeUnitId}/>:
      <p>Selecione uma unidade no tabuleiro.</p>}
    </aside>
  </div>
  <div className="battle-surface battle-timeline" role="region" aria-label="Registro da batalha">
   <div className="battle-unified-timeline-head">
    <h3>Últimas ações</h3>
    <Button size="sm" variant="outline" aria-expanded={fullHistory}
     onClick={()=>setFullHistory(value=>!value)}>
     {fullHistory?'Ver últimas ações':'Ver histórico completo'}
    </Button>
   </div>
   {battle.events.length===0?<p>Nenhuma ação registrada.</p>:
    <ol aria-live="polite" className={fullHistory?'battle-timeline-all':''}>
     {battle.events.slice(-(fullHistory?100:6)).reverse().map(e=><li key={e.seq}>
      Rodada {e.round} · {e.type==='DAMAGE'?'Ataque':e.type==='RETALIATION'?'Retaliação':e.type==='MOVE'?'Movimento':e.type==='DEFEND'?'Defesa':e.type==='WAIT'?'Espera':e.type==='END_ACTIVATION'?'Fim de turno':e.type}
      {' · '}{typeof e.delta['damage']==='number'?e.delta['damage']+' PV, '+e.delta['casualties']+' baixas':''}
     </li>)}</ol>}
   <div className="battle-form-row"><Button variant="outline" onClick={()=>setShowManual(x=>!x)}>Encerrar batalha manualmente</Button></div>
   {showManual&&<div className="battle-manual-finish">
     <label>Motivo narrativo (mínimo 10 caracteres)<input aria-label="Motivo do encerramento" maxLength={500} value={reason}
       onChange={e=>setReason(e.target.value)}/></label>
     <label>Resultado<select aria-label="Vencedor manual" value={manualWinner??'draw'}
       onChange={e=>setManualWinner(e.target.value==='draw'?null:e.target.value as Side)}>
       <option value="draw">Empate</option><option value="attacker">{sideNames.attacker}</option>
       <option value="defender">{sideNames.defender}</option></select></label>
     <Button disabled={reason.trim().length<10||paused}
       onClick={()=>command({type:'MANUAL_FINISH',reason,winnerSide:manualWinner})}>Confirmar encerramento</Button>
   </div>}
  </div>
  </section>
 </div>;
 return <BattleExpandedView expanded={expanded} onClose={()=>setExpanded(false)}>
  {arena}
 </BattleExpandedView>;
}
function UnitInspector({unit,active}:{unit:BattleStack;active:boolean}){
 return <div>
  <p><strong>{unit.name}</strong>{active?' · Unidade ativa':' · Consulta'}</p>
  <p>{unit.primaryTypeId} · {unit.training} ·
   {unit.source.kind==='house-readonly'?' cópia autorizada somente leitura':' origem fictícia'}</p>
  <p className="battle-unit-compact-stats"><strong>{livingCount(unit)}</strong> vivos ·
   {unit.currentHp} PV · Ataque {unit.attack} · Defesa {unit.defense}</p>
  <details className="battle-unit-full-sheet">
   <summary>Ficha completa</summary>
   <dl className="battle-inspector-list">
   <dt>Combatentes vivos</dt><dd>{livingCount(unit)} / {unit.initialCount}</dd>
   <dt>PV táticos</dt><dd>{unit.currentHp} / {unit.initialCount*unit.hpPerSoldier}</dd>
   <dt>Baixas nesta batalha</dt><dd>{casualtyCount(unit)}</dd>
   <dt>Ataque / Defesa</dt><dd>{unit.attack} / {unit.defense}</dd>
   <dt>Armadura / Dano</dt><dd>{unit.armor} / {unit.damagePerSoldier}</dd>
   <dt>Movimento / Alcance</dt><dd>{unit.movementHex} / {unit.rangeHex} hex</dd>
   <dt>Moral</dt><dd>{unit.moraleState==='steady'?'Firme':unit.moraleState==='shaken'?'Abalada':'Debandada'}</dd>
   <dt>Posição</dt><dd>{unit.position.q}, {unit.position.r}</dd>
   </dl>
  </details>
  <details><summary>Origem dos atributos</summary>
   <p>Perfil {unit.primaryTypeId} · treinamento {unit.training} · perfil PTE-2.0 experimental.</p>
   <p>PV = efetivo × PV por combatente; ataque e defesa usam o perfil mais bônus de treinamento.</p>
   <p>Sem acréscimo automático de construções, comandantes ou saúde oficial.</p>
  </details>
 </div>;
}
